import { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { getImgs } from '../lib/imageUtils';

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

  // 전체 analyses 에서 overage_items + tote_remaining_items 수집 (중복 제거 없음, 고유 _key 부여)
  const items = (() => {
    const list = [];
    for (const a of analyses) {
      for (const item of [...(a.overage_items || []), ...(a.tote_remaining_items || [])]) {
        if (!item.barcode) continue;
        list.push({ ...item });
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

  const toggle = (key) => {
    setChecked(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const total = items.length;
  const done  = items.filter(i => checked[i._key]).length;

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
            items.map(item => (
              <label
                key={item._key}
                className={`flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all select-none
                  ${checked[item._key]
                    ? 'border-green-400 bg-green-50'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                  }`}
              >
                {/* 상품 이미지 */}
                <div
                  className="w-[72px] h-[72px] flex-shrink-0 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center cursor-zoom-in"
                  onClick={(e) => {
                    if (!images[item.barcode]) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setZoomImg(images[item.barcode]);
                  }}
                >
                  {images[item.barcode]
                    ? <img src={images[item.barcode]} alt="" className="w-full h-full object-cover" />
                    : <span className="text-2xl opacity-40">📷</span>
                  }
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
                  {item.sys_qty != null && (
                    <div className="text-[11px] text-blue-500 font-medium mb-1">
                      전산수량 {item.sys_qty}개
                    </div>
                  )}
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
