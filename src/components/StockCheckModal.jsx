import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { sb } from '../lib/supabase';
import { compressImage, saveImg } from '../lib/imageUtils';
import { extractLocationCodes } from '../lib/utils';

/** 재고조사 고유 번호 — 같은 바코드를 여러 번 조사할 수 있어 시각을 붙인다 */
function stockReportId(barcode, d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
    + `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`;
  return `STOCK_${barcode}_${stamp}`;
}

/**
 * 재고조사 등록
 *   바코드 1개 + 수량(선택) + 상품명(선택) + 로케이션(여러 개, 잡다한 텍스트에서 코드만 추출) + 이미지(선택)
 *   SKU ID 를 모르므로 상품페이지 링크는 두지 않는다.
 */
export default function StockCheckModal({ user, onClose, onSaved }) {
  const [barcode, setBarcode]   = useState('');
  const [qty, setQty]           = useState('');
  const [name, setName]         = useState('');   // 상품명 (선택)
  const [locText, setLocText]   = useState('');
  const [image, setImage]       = useState(null);   // dataUrl
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const fileRef = useRef(null);
  const qtyRef  = useRef(null);
  const nameRef = useRef(null);
  const locRef  = useRef(null);

  const cleanBarcode = barcode.replace(/\s/g, '');
  const locations    = useMemo(() => extractLocationCodes(locText), [locText]);
  const qtyNum       = qty === '' ? null : parseInt(qty, 10);
  const qtyInvalid   = qty !== '' && (!Number.isFinite(qtyNum) || qtyNum < 0);
  const canSave      = cleanBarcode.length > 0 && locations.length > 0 && !qtyInvalid && !saving;

  const processFile = useCallback(async (file) => {
    if (!file?.type?.startsWith('image/')) return;
    try {
      setImage(await compressImage(file));
    } catch (e) {
      console.error('이미지 처리 오류', e);
      setError('이미지를 읽지 못했습니다');
    }
  }, []);

  // 모달 어디서든 Ctrl+V 로 이미지 첨부 (텍스트 붙여넣기는 그대로 둔다)
  useEffect(() => {
    const onPaste = (e) => {
      const file = [...(e.clipboardData?.files ?? [])].find(f => f.type.startsWith('image/'));
      if (file) { e.preventDefault(); processFile(file); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [processFile]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const now = new Date();
    const row = {
      report_id:   stockReportId(cleanBarcode, now),
      reported_at: now.toISOString(),
      reason:      'STOCK_CHECK',
      tote_id:     null,
      worker:      null,
      sys_qty:     qtyNum,
      placed_qty:  null,
      tote_qty:    null,
      locations:   locations.map(code => ({ location_code: code, items: [], total_qty: 0 })),
      overage_items: [],
      // 찾는 대상 상품 — 상세 화면의 썸네일·전산 품목 패널이 이 배열을 읽는다
      tote_remaining_items: [{ sku_id: null, product_name: name.trim(), barcode: cleanBarcode, sys_qty: qtyNum }],
      created_by:  user.nickname,
    };

    try {
      const [{ error: e }] = await Promise.all([
        sb.from('analyses').insert(row),
        image ? saveImg(cleanBarcode, image) : Promise.resolve(),
      ]);
      if (e) throw new Error(e.message);
      onSaved();
    } catch (e) {
      console.error('재고조사 저장 오류:', e);
      setError(`저장 실패 — ${e.message ?? '네트워크를 확인해 주세요'}`);
      setSaving(false);
    }
  };

  // 스캐너는 바코드 뒤에 Enter 를 보낸다 → 다음 칸으로 이동
  const nextOnEnter = (ref) => (e) => {
    if (e.key === 'Enter') { e.preventDefault(); ref.current?.focus(); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-800">재고조사 등록</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 바코드 + 수량 */}
          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5 min-w-0">
              <label className="text-xs text-slate-500 font-medium">바코드</label>
              <input
                type="text"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                onKeyDown={nextOnEnter(qtyRef)}
                autoFocus
                placeholder="8801234567890"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono
                           focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div className="w-24 space-y-1.5 flex-shrink-0">
              <label className="text-xs text-slate-500 font-medium">
                수량 <span className="font-normal text-slate-400">(선택)</span>
              </label>
              <input
                ref={qtyRef}
                type="number"
                inputMode="numeric"
                min="0"
                value={qty}
                onChange={e => setQty(e.target.value)}
                onKeyDown={nextOnEnter(nameRef)}
                placeholder="-"
                className={`w-full border rounded-xl px-3 py-2.5 text-sm text-center
                            focus:outline-none focus:ring-2 ${qtyInvalid
                              ? 'border-red-300 focus:ring-red-400'
                              : 'border-slate-200 focus:ring-emerald-400'}`}
              />
            </div>
          </div>

          {/* 상품명 (선택) */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 font-medium">
              상품명 <span className="font-normal text-slate-400">(선택)</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={nextOnEnter(locRef)}
              placeholder="예: 뽀로로 배변 팬티 2P"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          {/* 로케이션 — 아무 텍스트나 붙여넣어도 코드만 추출 */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 font-medium">
              로케이션 <span className="font-normal text-slate-400">(여러 개 가능 · 아무 텍스트나 붙여넣으면 코드만 추출)</span>
            </label>
            <textarea
              ref={locRef}
              value={locText}
              onChange={e => setLocText(e.target.value)}
              placeholder={'66-42C7-62-201\n42HV5-6-404 (66- 생략 가능)\n화면 내용을 통째로 붙여넣어도 됩니다'}
              className="w-full border border-slate-200 rounded-xl p-3 text-sm font-mono
                         resize-y focus:outline-none focus:ring-2 focus:ring-emerald-400 min-h-[120px]"
            />
            {locText.trim() && (
              locations.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-emerald-700 font-medium mr-1">{locations.length}개 인식</span>
                  {locations.map(code => (
                    <span key={code} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono">
                      {code}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-red-500">인식된 로케이션이 없습니다 (예: 66-42C7-62-201)</p>
              )
            )}
          </div>

          {/* 이미지 (선택) */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 font-medium">
              상품 이미지 <span className="font-normal text-slate-400">(선택)</span>
            </label>
            {image ? (
              <div className="flex items-start gap-3">
                <img src={image} alt="" className="h-24 rounded-lg border border-slate-200 object-cover" />
                <button
                  onClick={() => setImage(null)}
                  className="text-xs text-red-400 hover:text-red-600 mt-0.5 transition-colors"
                >
                  삭제
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDrop={e => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files?.[0]); }}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`w-full border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                  dragOver ? 'border-emerald-400 bg-emerald-50 text-emerald-600' : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                }`}
              >
                <p className="text-xs">
                  눌러서 선택 · 드래그 · <kbd className="bg-slate-100 px-1 rounded">Ctrl+V</kbd>
                </p>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { processFile(e.target.files?.[0]); e.target.value = ''; }}
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="px-6 pb-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? '저장 중...' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
