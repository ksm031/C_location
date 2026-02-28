import { useState } from 'react';
import { formatDate } from '../lib/parser';

export default function LocationAccordion({ location, check, onCheck, onUncheck, analysisId, targetBarcodes = [] }) {
  const [open, setOpen] = useState(false);
  const { location_code, items = [], total_qty } = location;
  const result = check?.result;

  // 로케이션 코드의 알파벳 뒤 숫자(예: 23A10 → 10) 홀/짝 → 텍스트 색 구분
  const locTrailNum = parseInt(location_code.match(/[A-Za-z](\d+)/)?.[1] ?? '0', 10);
  const locColorClass = locTrailNum % 2 !== 0 ? 'text-blue-900' : 'text-slate-500';

  // 찾아야 할 상품(바코드 목록)과 일치하는 아이템 계산
  const isMatch = (item) =>
    targetBarcodes.length > 0 && targetBarcodes.includes(item.barcode);
  const matchCount = targetBarcodes.length > 0
    ? items.filter(isMatch).reduce((sum, item) => sum + (item.display_qty ?? 1), 0)
    : 0;

  // 이 로케이션의 고유 SKU 수 (같은 바코드 복수 진열 행은 1종으로 집계)
  const uniqueSkuCount = new Set(items.map(i => i.barcode)).size;

  // 이 로케이션의 진열자 목록 (중복 제거)
  const workers = [...new Set(items.map(i => i.display_worker).filter(Boolean))];

  return (
    <div className={`rounded-xl border transition-colors ${
      result === 'found'     ? 'border-green-300 bg-green-50' :
      result === 'not_found' ? 'border-red-300 bg-red-50'    :
      'border-slate-200 bg-white'
    }`}>
      {/* 헤더 */}
      <div
        className="px-3 pt-3 pb-2 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        {/* 1행: 펼침 아이콘 + 로케이션 코드 (절대 생략 없음) */}
        <div className="flex items-center gap-2">
          <span className={`text-slate-400 text-xs transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}>
            ▶
          </span>
          <span className={`font-mono font-semibold text-sm break-all ${locColorClass}`}>
            {location_code}
          </span>
        </div>

        {/* 2행: 진열자 · 종수/수량 · 일치배지 */}
        <div className="flex items-center gap-2 mt-1 pl-4 flex-wrap">
          {workers.length > 0 && (
            <span className="text-xs text-slate-500 truncate max-w-[140px]">
              진열자 {workers.join(' · ')}
            </span>
          )}
          <span className="text-xs text-slate-400">
            {uniqueSkuCount}종 {total_qty}개
          </span>
          {matchCount > 0 && (
            <span className="text-xs font-semibold text-amber-600">
              {matchCount}개 일치
            </span>
          )}
        </div>

        {/* 3행: 체크 버튼 */}
        <div className="flex gap-2 mt-2 pl-4" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onCheck(analysisId, location_code, 'found')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              result === 'found'
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-slate-100 hover:bg-green-100 text-slate-600 hover:text-green-700'
            }`}
          >
            발견
          </button>
          <button
            onClick={() => onCheck(analysisId, location_code, 'not_found')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              result === 'not_found'
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-700'
            }`}
          >
            없음
          </button>
          {result && (
            <button
              onClick={() => onUncheck(analysisId, location_code)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-200 hover:bg-slate-300 text-slate-500 hover:text-slate-700 transition-colors"
              title="체크 취소"
            >
              ↩
            </button>
          )}
        </div>
      </div>

      {/* 체크한 사람 표시 */}
      {result && (
        <div className="px-4 pb-1.5 -mt-1">
          <span className={`text-xs ${result === 'found' ? 'text-green-600' : 'text-red-600'}`}>
            {result === 'found' ? '✓ 발견됨' : '✗ 없음 확인'}
            {check?.checked_by && ` · ${check.checked_by}`}
          </span>
        </div>
      )}

      {/* 상세 항목 목록 */}
      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {items.map((item, idx) => (
            <div key={idx} className="px-4 py-2.5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className={`text-xs ${isMatch(item) ? 'text-amber-600 font-semibold' : 'text-slate-700'}`} title={item.product_name}>
                  {item.product_name}
                </p>
                <p className={`text-xs font-mono mt-0.5 ${isMatch(item) ? 'text-amber-500' : 'text-slate-400'}`}>
                  {item.barcode.slice(0, -3)}<span className="font-bold">{item.barcode.slice(-3)}</span>
                </p>
                {item.display_worker && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    진열자 {item.display_worker}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-medium text-slate-600">{item.display_qty}개</p>
                <p className="text-xs text-slate-400">{formatDate(item.display_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
