const REASON_STYLE = {
  SHORTAGE: { bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700', label: 'SHORTAGE' },
  OVERAGE:  { bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700',     label: 'OVERAGE'  },
};

/** "2026-02-27T22:15:22+00:00" → "02.27 22:15:22" */
function cardDate(dateStr) {
  if (!dateStr) return '';
  const m = dateStr.match(/\d{4}-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return dateStr;
  return `${m[1]}.${m[2]} ${m[3]}:${m[4]}:${m[5]}`;
}

/**
 * 66-42C7-62-201 → 42C7
 * 66-42-C7-62-201 → 42-C7  (첫 파트가 숫자만이면 다음 파트도 포함)
 */
function shortLoc(code) {
  const stripped = code.replace(/^66-/, '');
  const parts = stripped.split('-');
  return /^\d+$/.test(parts[0]) ? parts.slice(0, 2).join('-') : parts[0];
}

export default function ErrorCard({ analysis, checks, selected, onSelect, onDelete }) {
  const a     = analysis;
  const locs  = a.locations ?? [];
  const total = locs.length;
  const done  = locs.filter(l => checks[l.location_code]).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const completed = total > 0 && done === total;

  const style = REASON_STYLE[a.reason] ?? REASON_STYLE.SHORTAGE;

  // 대표 상품 (전체 아이템 중 첫 번째)
  const firstItem = locs.flatMap(l => l.items ?? []).find(Boolean) ?? null;

  // 누락/초과 수량 텍스트
  const diffLabel = a.reason === 'SHORTAGE'
    ? `누락 ${a.sys_qty}개`
    : `초과 ${a.placed_qty}개`;

  // 대표 로케이션 (축약, 최대 3개)
  const locCodes  = locs.map(l => shortLoc(l.location_code));
  const shownLocs = locCodes.slice(0, 3);
  const extraLocs = locCodes.length - shownLocs.length;

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border cursor-pointer transition-all select-none p-3 space-y-1.5
        ${selected
          ? 'border-blue-400 bg-blue-50 shadow-sm'
          : `border-slate-200 ${style.bg} hover:border-slate-300 hover:shadow-sm`
        }`}
    >
      {/* 행 1: 배지 + 작업자 + 삭제 */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${style.badge}`}>
            {style.label}
          </span>
          <span className="text-xs text-slate-500 truncate">{a.worker}</span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="text-slate-300 hover:text-red-400 transition-colors text-xs flex-shrink-0 ml-1"
          title="삭제"
        >
          ✕
        </button>
      </div>

      {/* 행 2: 토트번호 */}
      <div className="font-mono text-xs font-semibold text-slate-700 truncate">
        {a.tote_id ?? '-'}
      </div>

      {/* 행 3: 신고 시각 */}
      <div className="text-xs text-slate-400">{cardDate(a.reported_at)}</div>

      {/* 행 4: 바코드 (상품명) 누락/초과 N개 */}
      {firstItem ? (
        <div className="flex items-baseline gap-1 min-w-0 text-xs">
          <span className="font-mono text-slate-600 flex-shrink-0">{firstItem.barcode}</span>
          <span className="text-slate-400 truncate min-w-0">({firstItem.product_name})</span>
          <span className={`flex-shrink-0 font-medium ${a.reason === 'SHORTAGE' ? 'text-orange-600' : 'text-blue-600'}`}>
            {diffLabel}
          </span>
        </div>
      ) : (
        <div className="text-xs text-slate-400">{diffLabel}</div>
      )}

      {/* 행 5: 대표 로케이션 */}
      {shownLocs.length > 0 && (
        <div className="text-xs text-slate-500 font-mono">
          {shownLocs.join('  ')}
          {extraLocs > 0 && <span className="text-slate-400 ml-1">+{extraLocs}</span>}
        </div>
      )}

      {/* 진행률 바 */}
      {total > 0 && (
        <div className="space-y-1 pt-0.5">
          <div className="flex justify-between text-xs text-slate-400">
            <span>로케이션 체크</span>
            <span className={completed ? 'text-green-600 font-medium' : ''}>
              {done}/{total}{completed && ' ✓'}
            </span>
          </div>
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${completed ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {total === 0 && (
        <p className="text-xs text-slate-400 italic">진열 로케이션 없음</p>
      )}
    </div>
  );
}
