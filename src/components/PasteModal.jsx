import { useState, useRef, useCallback, useMemo } from 'react';
import { parseText } from '../lib/parser';
import { sb } from '../lib/supabase';
import { compressImage, saveImg } from '../lib/imageUtils';

/* ── 상품별 이미지 업로드 존 ──────────────────────────── */
function ImageZone({ barcode, productName, skuId, dataUrl, onSet, onClear, nameEditable, onNameChange, qty, onQtyChange }) {
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
          <input
            type="text"
            value={productName}
            onChange={e => onNameChange(barcode, e.target.value)}
            placeholder="상품명 입력 (선택)"
            className="flex-1 text-xs border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
          />
        ) : (
          <span className="text-xs text-slate-400 truncate flex-1">{productName}</span>
        )}
        {nameEditable && (
          <input
            type="number"
            min="1"
            value={qty ?? ''}
            onChange={e => onQtyChange(barcode, e.target.value === '' ? null : parseInt(e.target.value))}
            placeholder="수량"
            className="w-14 flex-shrink-0 text-xs border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 text-center"
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
            상품페이지 ↗
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
export default function PasteModal({ user, onClose, onSaved }) {
  const [text, setText]             = useState('');
  const [manualInput, setManualInput] = useState(''); // 수기 바코드 입력
  const [parsed, setParsed]         = useState(null);
  const [saving, setSaving]         = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [step, setStep]             = useState('paste'); // 'paste'|'preview'|'image'|'done'
  const [images, setImages]         = useState({});      // { barcode: base64 }
  const [nameOverrides, setNameOverrides] = useState({}); // { barcode: string } 수기 바코드 상품명
  const [qtyOverrides, setQtyOverrides]   = useState({}); // { barcode: number } 수기 바코드 수량

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
    // 수기 입력 바코드는 중복 여부 관계없이 항상 추가 (isManual 플래그)
    for (const barcode of manualBarcodes) {
      const info = parsedBarcodeMap.get(barcode);
      list.push({ barcode, product_name: info?.product_name ?? '', sku_id: info?.sku_id ?? null, isManual: true });
    }
    return list;
  }, [parsed, manualBarcodes, parsedBarcodeMap]);

  /* ── 파싱 ── */
  const handleParse = () => {
    if (!text.trim()) return;
    setParsed(parseText(text));
    setStep('preview');
  };

  /* ── 저장 (이미지 → DB, 분석 → DB) ── */
  const handleSave = async () => {
    if (!parsed?.reports?.length) return;
    setSaving(true);

    await Promise.all(
      Object.entries(images)
        .filter(([, dataUrl]) => dataUrl)
        .map(([barcode, dataUrl]) => saveImg(barcode, dataUrl))
    );

    const manualItems = manualBarcodes.map(barcode => {
      const info = parsedBarcodeMap.get(barcode);
      return {
        sku_id: info?.sku_id ?? null,
        product_name: nameOverrides[barcode] ?? info?.product_name ?? '',
        barcode,
        sys_qty: qtyOverrides[barcode] ?? null,
      };
    });

    let saved = 0, skipped = 0;
    for (const r of parsed.reports) {
      const { error } = await sb.from('analyses').insert({
        report_id:   r.report_id,
        reported_at: r.reported_at ? new Date(r.reported_at).toISOString() : null,
        reason:      r.reason,
        tote_id:     r.tote_id,
        worker:      r.worker,
        sys_qty:     r.sys_qty,
        placed_qty:  r.placed_qty,
        tote_qty:    r.tote_qty,
        locations:            r.locations,
        overage_items:        r.overage_items ?? [],
        tote_remaining_items: [...(r.tote_remaining_items ?? []), ...manualItems],
        created_by:           user.nickname,
      });
      if (error) {
        if (error.code === '23505') skipped++;
        else console.error('저장 오류:', error.message);
      } else {
        saved++;
      }
    }

    setSaving(false);
    setSaveResult({ saved, skipped });
    setStep('done');
    if (saved > 0) setTimeout(onSaved, 1200);
  };

  /* ── 뒤로 ── */
  const handleBack = () => {
    setStep('paste');
    setParsed(null);
    setSaveResult(null);
    setImages({});
    setNameOverrides({});
    setQtyOverrides({});
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
            {step === 'paste'   && '오류보고 붙여넣기'}
            {step === 'preview' && `파싱 결과 확인 (${parsed?.reports?.length ?? 0}건)`}
            {step === 'image'   && `상품 이미지 첨부 (${uniqueProducts.length}종)`}
            {step === 'done'    && '저장 완료'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg transition-colors">✕</button>
        </div>

        {/* ── STEP 1: 붙여넣기 ── */}
        {step === 'paste' && (
          <>
            <div className="flex-1 overflow-hidden p-6 flex flex-col gap-3">
              <p className="text-sm text-slate-600">
                인트라넷 <strong>진열작업 오류보고 상세</strong> 페이지에서{' '}
                <kbd className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">Ctrl+A</kbd>{' '}
                →{' '}
                <kbd className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">Ctrl+C</kbd>{' '}
                후 아래에 붙여넣으세요.
                <br />
                <span className="text-xs text-slate-400">여러 보고서를 연속으로 붙여넣기 해도 됩니다.</span>
              </p>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
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
                    <span className="font-mono text-sm font-bold text-slate-800">{r.report_id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      r.reason === 'SHORTAGE' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {r.reason}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-600">
                    <span>진열자: {r.worker}</span>
                    <span>토트: {r.tote_id}</span>
                    <span>신고수량: {r.sys_qty}개</span>
                    <span>로케이션: {r.locations?.length ?? 0}개</span>
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
                onClick={() => setStep('image')}
                disabled={parsed.reports.length === 0}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
              >
                다음 →
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: 이미지 첨부 ── */}
        {step === 'image' && (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-xs text-slate-500 mb-3">
                각 상품에 이미지를 첨부할 수 있습니다. 이미지는 선택사항이며 모든 기기에서 공유됩니다.
              </p>
              <div className="space-y-2">
                {uniqueProducts.map((p, i) => (
                  <ImageZone
                    key={`${p.barcode}-${i}`}
                    barcode={p.barcode}
                    productName={p.isManual ? (nameOverrides[p.barcode] ?? p.product_name) : p.product_name}
                    skuId={p.sku_id}
                    dataUrl={images[p.barcode] ?? null}
                    onSet={handleSetImg}
                    onClear={handleClearImg}
                    nameEditable={p.isManual && !p.sku_id}
                    onNameChange={handleNameChange}
                    qty={p.isManual ? (qtyOverrides[p.barcode] ?? null) : null}
                    onQtyChange={handleQtyChange}
                  />
                ))}
                {uniqueProducts.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">첨부할 상품이 없습니다.</p>
                )}
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-between items-center">
              <button onClick={() => setStep('preview')} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
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

        {/* ── STEP 4: 완료 ── */}
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
