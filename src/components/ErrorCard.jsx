import { formatDate } from '../lib/parser';

const REASON_STYLE = {
  SHORTAGE: { bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700', label: 'SHORTAGE' },
  OVERAGE:  { bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700',     label: 'OVERAGE'  },
};

export default function ErrorCard({ analysis, checks, selected, onSelect, onDelete }) {
  const a     = analysis;
  const locs  = a.locations ?? [];
  const total = locs.length;
  const done  = locs.filter(l => checks[l.location_code]).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const completed = total > 0 && done === total;

  const style = REASON_STYLE[a.reason] ?? REASON_STYLE.SHORTAGE;

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border cursor-pointer transition-all select-none p-3 space-y-2
        ${selected
          ? 'border-blue-400 bg-blue-50 shadow-sm'
          : `border-slate-200 ${style.bg} hover:border-slate-300 hover:shadow-sm`
        }`}
    >
      {/* 상단: 보고번호 + 삭제 */}
      <div className="flex items-start justify-between gap-1">
        <span className="text-xs font-mono text-slate-600 truncate">{a.report_id}</span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="text-slate-300 hover:text-red-400 transition-colors text-xs flex-shrink-0 ml-1"
          title="삭제"
        >
          ✕
        </button>
      </div>

      {/* 배지 + 진열 작업자 */}
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
          {style.label}
        </span>
        <span className="text-xs text-slate-500 truncate">{a.worker}</span>
      </div>

      {/* 신고 일시 + 수량 */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{formatDate(a.reported_at)}</span>
        <span>
          {a.reason === 'SHORTAGE'
            ? `누락 ${a.sys_qty}개`
            : `초과 ${a.placed_qty}개`}
        </span>
      </div>

      {/* 진행률 바 */}
      {total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <span>로케이션 체크</span>
            <span className={completed ? 'text-green-600 font-medium' : ''}>
              {done}/{total}
              {completed && ' ✓'}
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
