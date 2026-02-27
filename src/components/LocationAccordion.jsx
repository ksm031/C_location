import { useState } from 'react';
import { formatDate } from '../lib/parser';

export default function LocationAccordion({ location, check, onCheck, analysisId }) {
  const [open, setOpen] = useState(false);
  const { location_code, items = [], total_qty } = location;
  const result = check?.result;

  const resultStyle = {
    found:     { btn: 'bg-green-500 hover:bg-green-600 text-white', label: '✓ 발견' },
    not_found: { btn: 'bg-red-500 hover:bg-red-600 text-white',     label: '✗ 없음' },
  };

  return (
    <div className={`rounded-xl border transition-colors ${
      result === 'found'     ? 'border-green-300 bg-green-50' :
      result === 'not_found' ? 'border-red-300 bg-red-50'    :
      'border-slate-200 bg-white'
    }`}>
      {/* 헤더 행 */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        {/* 펼침 아이콘 */}
        <span className={`text-slate-400 text-xs transition-transform ${open ? 'rotate-90' : ''}`}>
          ▶
        </span>

        {/* 로케이션 코드 */}
        <span className="font-mono font-semibold text-sm text-slate-800 flex-1">
          {location_code}
        </span>

        {/* 항목 수 / 수량 */}
        <span className="text-xs text-slate-500">
          {items.length}종 {total_qty}개
        </span>

        {/* 체크 버튼 */}
        <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onCheck(analysisId, location_code, 'found')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              result === 'found'
                ? resultStyle.found.btn
                : 'bg-slate-100 hover:bg-green-100 text-slate-600 hover:text-green-700'
            }`}
          >
            발견
          </button>
          <button
            onClick={() => onCheck(analysisId, location_code, 'not_found')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              result === 'not_found'
                ? resultStyle.not_found.btn
                : 'bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-700'
            }`}
          >
            없음
          </button>
        </div>
      </div>

      {/* 체크한 사람 표시 */}
      {result && (
        <div className="px-4 pb-1 -mt-1">
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
                <p className="text-xs text-slate-700 truncate" title={item.product_name}>
                  {item.product_name}
                </p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {item.barcode}
                </p>
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
