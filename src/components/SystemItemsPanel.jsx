import { useState, useEffect, useRef, useCallback } from 'react';
import JsBarcode from 'jsbarcode';
import { getImgs, saveImg, compressImage } from '../lib/imageUtils';

function Barcode128({ value }) {
  const svgRef = useRef(null);
  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width: 1.2,
        height: 32,
        margin: 4,
        displayValue: false,
      });
    } catch (_) {}
  }, [value]);
  return <svg ref={svgRef} className="max-w-full" />;
}

export default function SystemItemsPanel({ analyses, onClose }) {
  // 오늘 날짜 기준으로 localStorage 키 생성 → 매일 자동 초기화
  const todayKey   = new Date().toISOString().slice(0, 10);
  const storageKey = `sys_checks_${todayKey}`;

  const [checked, setChecked] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); }
    catch { return {}; }
  });
  const [images, setImages]     = useState({});
  const [zoomImg, setZoomImg]   = useState(null);

  // 전체 analyses 에서 overage_items + tote_remaining_items 수집
  // (중복 제거 없음 · _type 으로 초과/누락 구분 · 고유 _key 부여)
  const items = (() => {
    const list = [];
    for (const a of analyses) {
      for (const item of a.overage_items || []) {
        if (!item.barcode) continue;
        list.push({ ...item, _type: 'overage', _qty: item.qty ?? item.sys_qty ?? null });
      }
      for (const item of a.tote_remaining_items || []) {
        if (!item.barcode) continue;
        list.push({ ...item, _type: 'shortage', _qty: item.sys_qty ?? item.qty ?? null });
      }
    }
    return list.map((item, i) => ({ ...item, _key: `${item.barcode}_${i}` }));
  })();

  // 상품 이미지 로드
  useEffect(() => {
    const barcodes = [...new Set(items.map(i => i.barcode).filter(Boolean))];
    if (!barcodes.length) return;
    getImgs(barcodes).then(setImages);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyses]);

  const fileInputRef = useRef(null);
  const uploadTargetRef = useRef(null); // barcode currently targeted for upload

  const handleImageFile = useCallback(async (barcode, file) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const dataUrl = await compressImage(file);
      await saveImg(barcode, dataUrl);
      setImages(prev => ({ ...prev, [barcode]: dataUrl }));
    } catch (e) {
      console.error('이미지 저장 실패', e);
    }
  }, []);

  // 전역 paste 이벤트 (패널이 열려있는 동안)
  useEffect(() => {
    const onPaste = (e) => {
      const barcode = uploadTargetRef.current;
      if (!barcode) return;
      const file = [...(e.clipboardData?.files ?? [])].find(f => f.type.startsWith('image/'));
      if (file) { e.preventDefault(); handleImageFile(barcode, file); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleImageFile]);

  const openFilePicker = (barcode) => {
    uploadTargetRef.current = barcode;
    fileInputRef.current.click();
  };

  const toggle = (key) => {
    setChecked(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const total = items.length;
  const done  = items.filter(i => checked[i._key]).length;

  // 체크한 항목은 목록 아래로 (원래 순서는 유지)
  const orderedItems = [...items].sort(
    (a, b) => (checked[a._key] ? 1 : 0) - (checked[b._key] ? 1 : 0)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex"
      onClick={onClose}
    >
      {/* 이미지 확대 팝업 */}
      {zoomImg && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/80"
          onClick={(e) => { e.stopPropagation(); setZoomImg(null); }}
        >
          <img src={zoomImg} alt="" className="max-w-[90vw] max-h-[80vh] object-contain rounded-xl cursor-zoom-out" />
        </div>
      )}
      {/* 배경 딤 */}
      <div className="absolute inset-0 bg-black/50" />

      {/* 패널 (우측 슬라이드) */}
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-white flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-800">전산 품목 체크</span>
            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
              {done}/{total}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors text-lg font-bold"
          >
            ✕
          </button>
        </div>

        {/* 진행 바 */}
        {total > 0 && (
          <div className="h-1 bg-slate-100 flex-shrink-0">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${Math.round((done / total) * 100)}%` }}
            />
          </div>
        )}

        {/* 카드 목록 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {items.length === 0 ? (
            <div className="text-center text-slate-400 mt-24 text-sm">
              <div className="text-3xl mb-3">📭</div>
              <div>전산 품목이 없습니다</div>
            </div>
          ) : (
            orderedItems.map(item => (
              <label
                key={item._key}
                className={`flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all select-none
                  ${checked[item._key]
                    ? 'border-green-300 bg-green-50/60 opacity-50 hover:opacity-100'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                  }`}
              >
                {/* 상품 이미지 */}
                <div className="w-[72px] flex-shrink-0 flex flex-col gap-1">
                  <div
                    className={`w-[72px] h-[72px] rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center relative group
                      ${images[item.barcode] ? 'cursor-zoom-in' : 'cursor-pointer border-2 border-dashed border-slate-300 hover:border-blue-400'}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (images[item.barcode]) {
                        setZoomImg(images[item.barcode]);
                      } else {
                        openFilePicker(item.barcode);
                      }
                    }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
                      if (file) handleImageFile(item.barcode, file);
                    }}
                  >
                    {images[item.barcode] ? (
                      <>
                        <img src={images[item.barcode]} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <span className="text-white text-xs opacity-0 group-hover:opacity-100 font-medium">변경</span>
                        </div>
                      </>
                    ) : (
                      <span className="text-2xl opacity-30">📷</span>
                    )}
                  </div>
                  {images[item.barcode] && (
                    <button
                      className="w-full text-[10px] text-slate-400 hover:text-blue-500 text-center leading-none py-0.5"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openFilePicker(item.barcode); }}
                    >
                      변경
                    </button>
                  )}
                </div>

                {/* 텍스트 + 바코드 이미지 */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="font-medium text-slate-800 text-sm leading-snug mb-0.5 line-clamp-2">
                    {item.product_name}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mb-1">
                    {item.barcode.slice(0, -3)}
                    <span className="font-bold">{item.barcode.slice(-3)}</span>
                  </div>
                  <div className="mb-1">
                    <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded font-bold ${
                      item._type === 'overage'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {item._type === 'overage' ? '초과' : '누락'}
                      {item._qty != null && ` ${item._qty}개`}
                    </span>
                  </div>
                  <div className="overflow-hidden">
                    <Barcode128 value={item.barcode} />
                  </div>
                </div>

                {/* 체크박스 */}
                <div className="flex-shrink-0 flex items-center pl-1">
                  <input
                    type="checkbox"
                    checked={!!checked[item._key]}
                    onChange={() => toggle(item._key)}
                    className="w-5 h-5 accent-green-500 cursor-pointer"
                  />
                </div>
              </label>
            ))
          )}
        </div>

        {/* 숨겨진 파일 입력 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && uploadTargetRef.current) handleImageFile(uploadTargetRef.current, file);
            e.target.value = '';
          }}
        />

        {/* 하단 요약 */}
        {total > 0 && (
          <div className="flex-shrink-0 px-4 py-3 border-t border-slate-200 bg-slate-50 text-sm text-slate-500">
            {done === total
              ? <span className="text-green-600 font-medium">모두 확인 완료!</span>
              : <span>남은 항목 <span className="font-semibold text-slate-700">{total - done}개</span></span>
            }
          </div>
        )}
      </div>
    </div>
  );
}
