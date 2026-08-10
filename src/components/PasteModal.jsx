import { useState, useRef, useCallback, useMemo } from 'react';
import { parseText } from '../lib/parser';
import { sb } from '../lib/supabase';
import { compressImage, saveImg } from '../lib/imageUtils';
import { findSimilarBarcodes } from '../lib/similarity';

/** DB 마이그레이션이 아직 안 된 서버에서 빼고 재시도할 컬럼 */
const OPTIONAL_COLS = ['similar_items', 'inbound_worker'];

/**
 * 여러 건을 한 번에 저장. 왕복을 1회로 줄이는 게 목적이라
 * 실패했을 때만 원인을 좁혀 가며 되돌린다.
 *   1) 컬럼 부재 → 그 컬럼을 전부에서 빼고 배치 재시도
 *   2) 그래도 실패(중복 등) → 건별로 저장해 성공/스킵을 가른다
 */
async function insertRows(rows) {
  let batch = rows;
  let { error } = await sb.from('analyses').insert(batch);

  for (let i = 0; i < OPTIONAL_COLS.length && error; i++) {
    const missing = OPTIONAL_COLS.find(c => (error.message ?? '').includes(c));
    if (!missing) break;
    batch = batch.map(({ [missing]: _drop, ...rest }) => rest);
    ({ error } = await sb.from('analyses').insert(batch));
  }
  if (!error) return { saved: batch.length, skipped: 0 };

  let saved = 0, skipped = 0;
  for (const row of batch) {
    const { error: e } = await sb.from('analyses').insert(row);
    if (!e) saved++;
    else if (e.code === '23505') skipped++;
    else console.error('저장 오류:', e.message);
  }
  return { saved, skipped };
}

/* ── 상품별 이미지 업로드 존 ──────────────────────────── */
function ImageZone({ barcode, itemKey, productName, skuId, dataUrl, onSet, onClear, nameEditable, onNameChange, qty, onQtyChange, qtyEditable, autoMatched }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback(async (file) => {
    if (!file?.type.startsWith('image/')) return;
    try {
      const compressed = await compressImage(file);
      onSet(barcode, compressed);
    } catch (e) {
      console.error('이미지 처리 오류', e);
    }
  }, [barcode, onSet]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files?.[0]);
  };

  const handlePaste = (e) => {
    for (const item of e.clipboardData?.items ?? []) {
      if (item.type.startsWith('image/')) {
        processFile(item.getAsFile());
        break;
      }
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="font-mono text-xs font-medium text-slate-700 flex-shrink-0">
          {barcode.slice(0, -3)}<span className="font-bold">{barcode.slice(-3)}</span>
        </span>
        {nameEditable ? (
          <div className="flex-1 flex items-center gap-1 min-w-0">
            <input
              type="text"
              value={productName}
              onChange={e => onNameChange(itemKey, e.target.value)}
              placeholder="상품명 입력 (선택)"
              className="flex-1 text-xs border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
            />
            {autoMatched && (
              <span className="text-[10px] text-green-600 font-medium px-1 py-0.5 bg-green-50 border border-green-200 rounded flex-shrink-0">
                ✓ 자동
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-500 truncate flex-1">{productName}</span>
        )}
        {qtyEditable && (
          <input
            type="number"
            value={qty ?? ''}
            onChange={e => onQtyChange(itemKey, e.target.value === '' ? null : parseInt(e.target.value))}
            placeholder="±수량"
            title="양수: 초과(오버리지), 음수: 누락(숏테이지)"
            className={`w-20 flex-shrink-0 text-xs border rounded px-2 py-0.5 focus:outline-none focus:ring-1 text-center
              ${qty > 0 ? 'border-yellow-300 text-yellow-700 focus:ring-yellow-400' :
                qty < 0 ? 'border-blue-300 text-blue-700 focus:ring-blue-400' :
                'border-slate-200 focus:ring-blue-400'}`}
          />
        )}
        {skuId && (
          <a
            href={`https://inventory.coupang.com/sku/${skuId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-xs text-blue-500 hover:text-blue-700 underline"
            onClick={e => e.stopPropagation()}
          >
            상품페이지↗
          </a>
        )}
      </div>

      {dataUrl ? (
        <div className="flex items-start gap-3">
          <img src={dataUrl} alt="" className="h-24 rounded-lg border border-slate-200 object-cover" />
          <button
            onClick={() => onClear(barcode)}
            className="text-xs text-red-400 hover:text-red-600 mt-0.5 transition-colors"
          >
            삭제
          </button>
        </div>
      ) : (
        <div
          tabIndex={0}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onPaste={handlePaste}
          className={`border-2 border-dashed rounded-lg p-4 text-center select-none transition-colors ${
            dragOver
              ? 'border-blue-400 bg-blue-50 text-blue-500'
              : 'border-slate-200 text-slate-400'
          }`}
        >
          <p className="text-xs">드래그 · <kbd className="bg-slate-100 px-1 rounded">Ctrl+V</kbd></p>
        </div>
      )}
    </div>
  );
}

/* ── 메인 컴포넌트 ────────────────────────────────────── */
export default function PasteModal({ user, existingReportIds = [], onClose, onSaved }) {
  const [text, setText]             = useState('');
  const [manualInput, setManualInput] = useState(''); // 수기 바코드 입력
  const [parsed, setParsed]         = useState(null);
  const [saving, setSaving]         = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [step, setStep]             = useState('paste'); // 'paste'|'preview'|'location'|'image'|'done'
  const [images, setImages]         = useState({});      // { barcode: base64 }
  const [nameOverrides, setNameOverrides] = useState({}); // { barcode: string } 수기 바코드 상품명
  const [qtyOverrides, setQtyOverrides]   = useState({}); // { barcode: number } 수기 바코드 수량
  const [locationInput, setLocationInput] = useState(''); // 수기 진열존 입력
  const [similarOverrides, setSimilarOverrides] = useState({}); // { "리포트인덱스:바코드": bool }
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [dupError, setDupError]     = useState(null);  // 전부 중복 → 진행 중지
  const [dupSkipped, setDupSkipped] = useState([]);    // 일부 중복 → 제외하고 진행
  const parseSeq = useRef(0);                          // 백그라운드 중복 조회의 구식 응답 무시용

  /* 이미 등록된 보고번호 (즉시 판정용) */
  const existingIdSet = useMemo(() => new Set(existingReportIds), [existingReportIds]);

  /* 수기 입력 바코드: 쉼표 구분, 공백 무시 */
  const manualBarcodes = useMemo(() => {
    return manualInput
      .split(',')
      .map(b => b.replace(/\s/g, ''))
      .filter(b => b.length > 0);
  }, [manualInput]);

  /* 파싱 데이터 전체에서 바코드 → { product_name, sku_id } 조회 맵 */
  const parsedBarcodeMap = useMemo(() => {
    const map = new Map();
    if (!parsed?.reports) return map;
    for (const r of parsed.reports) {
      const allItems = [
        ...(r.overage_items ?? []),
        ...(r.tote_remaining_items ?? []),
        ...(r.stock_items ?? []),
        ...(r.locations ?? []).flatMap(l => l.items ?? []),
      ];
      for (const item of allItems) {
        if (!map.has(item.barcode)) {
          map.set(item.barcode, { product_name: item.product_name ?? '', sku_id: item.sku_id ?? null });
        }
      }
    }
    return map;
  }, [parsed]);

  /* 이미지 첨부 대상: 오버리지 등록 항목 + 토트에 전산 남은 항목 + 수기 입력 바코드 */
  const uniqueProducts = useMemo(() => {
    if (!parsed?.reports) return [];
    const seen = new Set();
    const list = [];
    for (const r of parsed.reports) {
      for (const item of [...(r.overage_items ?? []), ...(r.tote_remaining_items ?? [])]) {
        if (!seen.has(item.barcode)) {
          seen.add(item.barcode);
          list.push({ barcode: item.barcode, product_name: item.product_name, sku_id: item.sku_id });
        }
      }
    }
    // 수기 입력 바코드는 중복 여부 관계없이 항상 추가 (인덱스 기반 itemKey)
    manualBarcodes.forEach((barcode, idx) => {
      const info = parsedBarcodeMap.get(barcode);
      list.push({ barcode, product_name: info?.product_name ?? '', sku_id: info?.sku_id ?? null, isManual: true, itemKey: `manual_${idx}` });
    });
    return list;
  }, [parsed, manualBarcodes, parsedBarcodeMap]);

  /* 유사상품 후보: 리포트별로 계산 (전역 집계하면 다른 행에 저장돼 버림)
     후보 = 그 리포트 로케이션에 진열된 상품 중 '찾는 대상'이 아닌 것 */
  const candidatesByReport = useMemo(() => {
    if (!parsed?.reports) return [];
    return parsed.reports.map(r => {
      const targetSet = new Set([
        ...(r.overage_items ?? []).map(i => i.barcode),
        ...(r.tote_remaining_items ?? []).map(i => i.barcode),
        ...manualBarcodes,
      ].filter(Boolean));
      const seen = new Set();
      const list = [];
      for (const loc of r.locations ?? []) {
        for (const item of loc.items ?? []) {
          if (!item.barcode || targetSet.has(item.barcode) || seen.has(item.barcode)) continue;
          seen.add(item.barcode);
          list.push({ barcode: item.barcode, product_name: item.product_name ?? '' });
        }
      }
      return list;
    });
  }, [parsed, manualBarcodes]);

  /* 리포트별 자동 추정 결과 (디폴트 체크용) */
  const autoSimilarByReport = useMemo(() => {
    if (!parsed?.reports) return [];
    return parsed.reports.map(r => {
      const targets = [
        ...(r.overage_items ?? []),
        ...(r.tote_remaining_items ?? []),
        ...manualBarcodes.map(b => ({
          barcode: b,
          product_name: parsedBarcodeMap.get(b)?.product_name ?? '',
        })),
      ].filter(t => t.barcode);
      return new Set(findSimilarBarcodes(targets, r.locations ?? []));
    });
  }, [parsed, manualBarcodes, parsedBarcodeMap]);

  /* 체크 상태: override 가 없으면 자동 추정을 따름 (하이브리드) */
  const isSimilarChecked = (ri, barcode) =>
    similarOverrides[`${ri}:${barcode}`] ?? autoSimilarByReport[ri]?.has(barcode) ?? false;

  const totalCandidates = candidatesByReport.reduce((s, l) => s + l.length, 0);

  /* 파싱 결과에 로케이션이 하나도 없는지 여부 */
  const hasNoLocations = useMemo(() =>
    !!parsed?.reports?.length && !parsed.reports.some(r => r.locations?.length > 0),
  [parsed]);

  /* 수기 진열존: 줄바꿈 구분, 공백 무시 */
  const manualLocations = useMemo(() =>
    locationInput
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(code => ({ location_code: code, items: [], total_qty: 0 })),
  [locationInput]);

  /* ── 파싱 + 중복 검사 ──
     저장 단계까지 가서야 중복을 알려주던 걸 앞으로 당긴 것.
     다만 네트워크를 기다리면 버튼이 멈칫하므로,
       1) 이미 불러와 둔 목록으로 즉시 판정하고 화면을 넘긴 뒤
       2) 다른 작업자가 등록한 건은 백그라운드로 확인해 보완한다. */
  const handleParse = () => {
    if (!text.trim()) return;
    setDupError(null);
    setDupSkipped([]);

    const result = parseText(text);
    const ids = result.reports.map(r => r.report_id).filter(Boolean);

    // 1) 내 목록에 이미 있는 건 — 네트워크 대기 없이 판정
    const localDup = ids.filter(id => existingIdSet.has(id));
    if (localDup.length > 0) {
      const fresh = result.reports.filter(r => !localDup.includes(r.report_id));
      if (fresh.length === 0) {
        setDupError(localDup);   // 전부 중복 → 진행 중지
        return;
      }
      setDupSkipped(localDup);   // 일부만 중복 → 그 건만 제외
      setParsed({ ...result, reports: fresh });
    } else {
      setParsed(result);
    }
    setStep('preview');

    // 2) 다른 기기에서 등록한 건 확인 (화면은 이미 넘어간 뒤)
    //    중복은 등록자 기준이므로 본인 것만 조회 — 남이 올린 같은 보고서는 별개로 등록 가능
    const remaining = ids.filter(id => !localDup.includes(id));
    if (remaining.length === 0) return;
    const seq = ++parseSeq.current;
    sb.from('analyses').select('report_id')
      .in('report_id', remaining)
      .eq('created_by', user.nickname)
      .then(({ data, error }) => {
        if (error || seq !== parseSeq.current) return;   // 실패·구식 응답은 무시
        const remoteDup = (data ?? []).map(r => r.report_id);
        if (remoteDup.length === 0) return;
        setDupSkipped(prev => [...new Set([...prev, ...remoteDup])]);
        setParsed(prev => prev && ({
          ...prev,
          reports: prev.reports.filter(r => !remoteDup.includes(r.report_id)),
        }));
      });
  };

  /* ── 저장 (이미지·분석을 병렬로) ── */
  const handleSave = async () => {
    if (!parsed?.reports?.length) return;
    setSaving(true);

    // 이미지 업로드는 분석 저장과 독립적이라 먼저 띄워두고 끝에서 함께 기다린다
    const imgPromise = Promise.all(
      Object.entries(images)
        .filter(([, dataUrl]) => dataUrl)
        .map(([barcode, dataUrl]) => saveImg(barcode, dataUrl))
    );

    // 수기 입력: 양수 → overage_items, 음수 → tote_remaining_items
    const manualOverage = [];
    const manualShortage = [];
    manualBarcodes.forEach((barcode, idx) => {
      const key = `manual_${idx}`;
      const info = parsedBarcodeMap.get(barcode);
      const qty = qtyOverrides[key] ?? null;
      const base = {
        sku_id: info?.sku_id ?? null,
        product_name: nameOverrides[key] ?? info?.product_name ?? '',
        barcode,
      };
      if (qty > 0) {
        manualOverage.push({ ...base, qty });
      } else {
        manualShortage.push({ ...base, sys_qty: qty !== null ? Math.abs(qty) : null });
      }
    });

    const rows = parsed.reports.map((r, ri) => {
      const candidates = candidatesByReport[ri] ?? [];
      return {
        report_id:   r.report_id,
        reported_at: r.reported_at ? new Date(r.reported_at).toISOString() : null,
        reason:      r.reason,
        tote_id:     r.tote_id,
        worker:      r.worker,
        inbound_worker: r.inbound_worker ?? null,
        sys_qty:     r.sys_qty,
        placed_qty:  r.placed_qty,
        tote_qty:    r.tote_qty,
        locations:            [...(r.locations ?? []), ...manualLocations],
        overage_items:        [...(r.overage_items ?? []), ...manualOverage],
        tote_remaining_items: [...(r.tote_remaining_items ?? []), ...manualShortage],
        // 후보가 없으면 null(미지정), 있으면 체크된 것만 (전부 해제 시 [])
        similar_items: candidates.length > 0
          ? candidates.filter(c => isSimilarChecked(ri, c.barcode)).map(c => c.barcode)
          : null,
        created_by:           user.nickname,
      };
    });

    const [{ saved, skipped }] = await Promise.all([insertRows(rows), imgPromise]);

    setSaving(false);
    setSaveResult({ saved, skipped });
    setStep('done');
    if (saved > 0) setTimeout(onSaved, 500);
  };

  /* ── 뒤로 ── */
  const handleBack = () => {
    setStep('paste');
    setParsed(null);
    setSaveResult(null);
    setImages({});
    setNameOverrides({});
    setQtyOverrides({});
    setLocationInput('');
    setSimilarOverrides({});
    setShowAllCandidates(false);
    setDupError(null);
    setDupSkipped([]);
  };

  const handleSetImg = useCallback((barcode, dataUrl) => {
    setImages(prev => ({ ...prev, [barcode]: dataUrl }));
  }, []);

  const handleClearImg = useCallback((barcode) => {
    setImages(prev => { const next = { ...prev }; delete next[barcode]; return next; });
  }, []);

  const handleNameChange = useCallback((barcode, name) => {
    setNameOverrides(prev => ({ ...prev, [barcode]: name }));
  }, []);

  const handleQtyChange = useCallback((barcode, qty) => {
    setQtyOverrides(prev => ({ ...prev, [barcode]: qty }));
  }, []);

  const attachedCount = Object.values(images).filter(Boolean).length;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-800">
            {step === 'paste'   && '오류보고 / 입고 토트 붙여넣기'}
            {step === 'preview'  && (parsed?.pageType === 'tote_detail'
              ? '입고 토트 상세 확인'
              : `파싱 결과 확인 (${parsed?.reports?.length ?? 0}건)`)}
            {step === 'location' && '진열존 입력'}
            {step === 'image'    && `상품 이미지 첨부 (${uniqueProducts.length}종)`}
            {step === 'done'    && '저장 완료'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg transition-colors">✕</button>
        </div>

        {/* ── STEP 1: 붙여넣기 ── */}
        {step === 'paste' && (
          <>
            <div className="flex-1 overflow-hidden p-6 flex flex-col gap-3">
              <p className="text-sm text-slate-600">
                인트라넷 <strong>진열작업 오류보고 상세</strong> 또는 <strong>입고 토트 상세</strong> 페이지에서{' '}
                <kbd className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">Ctrl+A</kbd>{' '}
                →{' '}
                <kbd className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">Ctrl+C</kbd>{' '}
                후 아래에 붙여넣으세요.
                <br />
                <span className="text-xs text-slate-400">오류보고는 여러 건 연속 붙여넣기 가능 · 입고 토트는 상품을 수기로 입력하세요.</span>
              </p>
              <textarea
                value={text}
                onChange={e => { setText(e.target.value); if (dupError) setDupError(null); }}
                autoFocus
                placeholder="여기에 Ctrl+V로 붙여넣기..."
                className="flex-1 w-full border border-slate-200 rounded-xl p-4 text-sm font-mono
                           resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[280px]"
              />
              <p className="text-xs text-slate-400 text-right">{text.length.toLocaleString()}자</p>
              {/* 수기 바코드 입력 */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500 font-medium">
                  수기 바코드 입력 <span className="font-normal text-slate-400">(선택 · 쉼표로 구분)</span>
                </label>
                <input
                  type="text"
                  value={manualInput}
                  onChange={e => setManualInput(e.target.value)}
                  placeholder="예: 8801234567890, 8809876543210"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {manualBarcodes.length > 0 && (
                  <p className="text-xs text-blue-600">{manualBarcodes.length}개 바코드 등록됨</p>
                )}
              </div>

              {/* 이미 등록된 보고서 → 여기서 중단 */}
              {dupError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex-shrink-0">
                  <p className="text-sm font-bold text-red-700 mb-1">
                    이미 등록된 오류보고입니다
                  </p>
                  <p className="text-xs text-red-600 mb-2">
                    아래 {dupError.length}건은 이미 목록에 있어 등록할 수 없습니다.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {dupError.map(id => (
                      <span key={id} className="text-xs font-mono bg-white text-red-700 border border-red-200 px-2 py-0.5 rounded">
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                취소
              </button>
              <button
                onClick={handleParse}
                disabled={!text.trim()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
              >
                파싱하기
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: 프리뷰 ── */}
        {step === 'preview' && parsed && (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {dupSkipped.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-amber-800 mb-1">
                    이미 등록된 {dupSkipped.length}건은 제외했습니다
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {dupSkipped.map(id => (
                      <span key={id} className="text-xs font-mono bg-white text-amber-700 border border-amber-200 px-2 py-0.5 rounded">
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {parsed.errors?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-red-700 mb-1">파싱 오류</p>
                  {parsed.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}
              {parsed.reports.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  <p>파싱된 데이터가 없습니다.</p>
                  <p className="text-xs mt-1">올바른 페이지에서 복사했는지 확인하세요.</p>
                </div>
              )}
              {parsed.reports.map((r, i) => (
                <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-800">
                      {r.page_type === 'tote_detail' ? r.tote_id : r.report_id}
                    </span>
                    {r.page_type !== 'tote_detail' && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        r.reason === 'SHORTAGE' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {r.reason}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-600">
                    <span>{r.page_type === 'tote_detail' ? '입고작업자' : '진열자'}: {r.worker}</span>
                    <span>토트: {r.tote_id}</span>
                    {r.page_type === 'tote_detail' ? (
                      <>
                        <span>토트수량: {r.tote_qty}개</span>
                        <span>진열수량: {r.placed_qty}개</span>
                      </>
                    ) : (
                      <>
                        <span>신고수량: {r.sys_qty}개</span>
                        <span>로케이션: {r.locations?.length ?? 0}개</span>
                      </>
                    )}
                  </div>
                  {r.locations?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.locations.map(l => (
                        <span key={l.location_code}
                          className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono">
                          {l.location_code}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={handleBack} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                ← 다시 붙여넣기
              </button>
              <button
                onClick={() => setStep(hasNoLocations ? 'location' : 'image')}
                disabled={parsed.reports.length === 0}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
              >
                다음 →
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: 진열존 수기 입력 (로케이션 없을 때만) ── */}
        {step === 'location' && (
          <>
            <div className="flex-1 overflow-hidden p-6 flex flex-col gap-3">
              <p className="text-sm text-slate-600">
                파싱된 진열 로케이션이 없습니다. 진열존을 직접 입력해 주세요.
                <br />
                <span className="text-xs text-slate-400">로케이션 코드를 한 줄에 하나씩 입력하세요.</span>
              </p>
              <textarea
                value={locationInput}
                onChange={e => setLocationInput(e.target.value)}
                autoFocus
                placeholder={"66-42HV5-6-404\n66-42HV5-6-303\n66-42HV5-6-304"}
                className="flex-1 w-full border border-slate-200 rounded-xl p-4 text-sm font-mono
                           resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[200px]"
              />
              {manualLocations.length > 0 && (
                <p className="text-xs text-blue-600">{manualLocations.length}개 로케이션 입력됨</p>
              )}
            </div>
            <div className="px-6 pb-6 flex justify-between">
              <button onClick={() => setStep('preview')} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                ← 뒤로
              </button>
              <button
                onClick={() => setStep('image')}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                다음 →
              </button>
            </div>
          </>
        )}

        {/* ── STEP 4: 이미지 첨부 ── */}
        {step === 'image' && (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-xs text-slate-500 mb-3">
                각 상품에 이미지를 첨부할 수 있습니다. 이미지는 선택사항이며 모든 기기에서 공유됩니다.
              </p>
              <div className="space-y-2">
                {uniqueProducts.map((p, i) => (
                  <ImageZone
                    key={p.itemKey ?? `parsed-${i}`}
                    barcode={p.barcode}
                    itemKey={p.itemKey ?? `parsed-${i}`}
                    productName={p.isManual ? (nameOverrides[p.itemKey] ?? p.product_name) : p.product_name}
                    skuId={p.sku_id}
                    dataUrl={images[p.barcode] ?? null}
                    onSet={handleSetImg}
                    onClear={handleClearImg}
                    nameEditable={p.isManual && !p.sku_id}
                    onNameChange={handleNameChange}
                    qty={p.isManual ? (qtyOverrides[p.itemKey] ?? null) : null}
                    onQtyChange={handleQtyChange}
                    qtyEditable={p.isManual}
                    autoMatched={p.isManual && !!parsedBarcodeMap.get(p.barcode)}
                  />
                ))}
                {uniqueProducts.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">첨부할 상품이 없습니다.</p>
                )}
              </div>

              {/* 유사상품 지정 (후보가 있을 때만) */}
              {totalCandidates > 0 && (
                <div className="mt-5 border border-violet-200 bg-violet-50/40 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-medium text-violet-800">유사상품 위치 표시 <span className="font-normal text-violet-500">(선택)</span></p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        체크한 상품이 진열된 로케이션을 보라색으로 표시합니다. 자동 추정된 후보는 미리 체크되어 있습니다.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const next = {};
                        candidatesByReport.forEach((list, ri) =>
                          list.forEach(c => { next[`${ri}:${c.barcode}`] = false; })
                        );
                        setSimilarOverrides(next);
                      }}
                      className="flex-shrink-0 text-xs text-slate-400 hover:text-slate-600 underline"
                    >
                      전체 해제
                    </button>
                  </div>

                  {candidatesByReport.map((list, ri) => {
                    if (list.length === 0) return null;
                    // 자동 추정된 것 먼저 — 접기 대상에서 제외
                    const auto   = list.filter(c => autoSimilarByReport[ri]?.has(c.barcode));
                    const others = list.filter(c => !autoSimilarByReport[ri]?.has(c.barcode));
                    const shown  = showAllCandidates ? others : others.slice(0, 10);
                    const hidden = others.length - shown.length;

                    return (
                      <div key={ri} className="mt-2 first:mt-0">
                        {candidatesByReport.filter(l => l.length > 0).length > 1 && (
                          <p className="text-xs font-mono text-slate-500 mb-1">
                            {parsed.reports[ri]?.report_id ?? parsed.reports[ri]?.tote_id}
                          </p>
                        )}
                        <div className="space-y-0.5">
                          {[...auto, ...shown].map(c => {
                            const checked = isSimilarChecked(ri, c.barcode);
                            const isAuto  = autoSimilarByReport[ri]?.has(c.barcode);
                            return (
                              <label
                                key={c.barcode}
                                className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-white/70 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={e => setSimilarOverrides(prev => ({
                                    ...prev, [`${ri}:${c.barcode}`]: e.target.checked,
                                  }))}
                                  className="w-4 h-4 accent-violet-500 flex-shrink-0"
                                />
                                <span className="font-mono text-xs text-slate-600 flex-shrink-0">
                                  {c.barcode.slice(0, -3)}<span className="font-bold">{c.barcode.slice(-3)}</span>
                                </span>
                                <span className="text-xs text-slate-400 truncate flex-1">{c.product_name}</span>
                                {isAuto && (
                                  <span className="flex-shrink-0 text-[10px] text-green-600 font-medium px-1 py-0.5 bg-green-50 border border-green-200 rounded">
                                    자동
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                        {hidden > 0 && (
                          <button
                            onClick={() => setShowAllCandidates(true)}
                            className="mt-1 text-xs text-violet-600 hover:text-violet-800"
                          >
                            ▸ 나머지 {hidden}종 보기
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex justify-between items-center">
              <button onClick={() => setStep(hasNoLocations ? 'location' : 'preview')} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                ← 뒤로
              </button>
              <div className="flex items-center gap-3">
                {attachedCount > 0 && (
                  <span className="text-xs text-slate-400">{attachedCount}개 이미지 첨부됨</span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {saving ? '저장 중...' : `${parsed.reports.length}건 저장`}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── STEP 5: 완료 ── */}
        {step === 'done' && saveResult && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 gap-4">
            <div className="text-5xl">✅</div>
            <p className="text-lg font-bold text-slate-800">저장 완료</p>
            <div className="text-sm text-slate-600 text-center space-y-1">
              {saveResult.saved > 0 && <p>새로 저장: <strong>{saveResult.saved}건</strong></p>}
              {saveResult.skipped > 0 && <p className="text-slate-400">이미 등록됨 (스킵): {saveResult.skipped}건</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
