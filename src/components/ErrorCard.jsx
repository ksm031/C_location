import { cardDate, REASON_STYLE, activeLocations } from '../lib/utils';

/** 66-42C7-62-201 → 42C7-62 (66- 제거 후 앞 2단계) */
function shortLoc(code) {
  const parts = code.replace(/^66-/, '').split('-');
  return parts.slice(0, 2).join('-');
}

export default function ErrorCard({ analysis, checks, selected, onSelect, onDelete, thumb }) {
  const a     = analysis;
  const locs  = a.locations ?? [];
  const total = locs.length;
  const done         = locs.filter(l => checks[l.location_code]).length;
  const foundCount   = locs.filter(l => checks[l.location_code]?.result === 'found').length;
  const notFoundCount = locs.filter(l => checks[l.location_code]?.result === 'not_found').length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const completed = total > 0 && (done === total || foundCount > 0);

  const style = REASON_STYLE[a.reason] ?? REASON_STYLE.SHORTAGE;

  // 대표 상품: 오버리지 등록 항목 + 토트에 남은 전산재고만 표시
  const issueItems = [...(a.overage_items ?? []), ...(a.tote_remaining_items ?? [])];
  const firstItem = issueItems.find(Boolean) ?? null;
  // 외 X종: 초과(overage_items) / 누락(tote_remaining_items) 각각의 종류만 카운트
  const barcodeCountItems = a.reason === 'OVERAGE'
    ? (a.overage_items ?? [])
    : (a.tote_remaining_items ?? []);
  const uniqueBarcodeCount = new Set(barcodeCountItems.map(i => i.barcode)).size;

  // 초과·누락이 섞인 토트: 배지로 반대편 유형을 표시
  const mixed = (a.overage_items ?? []).length > 0 && (a.tote_remaining_items ?? []).length > 0;
  const mixedLabel = a.reason === 'OVERAGE' ? '+누락' : '+초과';

  // 누락/초과 수량 텍스트 (여러 종이면 '총'을 붙여 합계임을 명시)
  const overageQty = (a.overage_items ?? []).reduce((s, i) => s + (i.qty ?? 0), 0);
  const sum = uniqueBarcodeCount > 1 ? '총 ' : '';
  const diffLabel = a.reason === 'SHORTAGE'
    ? `누락 ${sum}${a.sys_qty}개`
    : `초과 ${sum}${overageQty}개`;

  // 대표 로케이션 (축약 + 중복 제거, 최대 3개)
  // '없음'으로 확인한 곳은 제외 → 다음으로 빠른 로케이션이 앞에 온다
  const locCodes  = [...new Set(activeLocations(locs, checks).map(l => shortLoc(l.location_code)))];
  const shownLocs = locCodes.slice(0, 3);
  const extraLocs = locCodes.length - shownLocs.length;

  return (
    <div
      onClick={onSelect}
      className={`w-full rounded-xl border-y border-r border-l-4 cursor-pointer transition-all
                  select-none p-3 space-y-1.5 overflow-hidden
        ${selected
          ? 'border-y-green-400 border-r-green-400 border-l-green-500 bg-green-50 shadow-sm'
          : `border-y-slate-200 border-r-slate-200 ${style.accent} bg-white
             hover:border-y-slate-300 hover:border-r-slate-300 hover:shadow-sm`
        }`}
    >
      {/* 행 1: 토트번호 + 배지 + 삭제 */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs font-semibold text-slate-700 truncate">
            {a.tote_id ?? '-'}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${style.badge}`}>
            {style.label}
          </span>
          {mixed && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ${
                a.reason === 'OVERAGE' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
              }`}
              title="초과·누락이 함께 있는 토트"
            >
              {mixedLabel}
            </span>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0 ml-1 w-8 h-6 flex items-center justify-center text-2xl md:text-xl leading-none"
          title="삭제"
        >
          ✕
        </button>
      </div>

      {/* 행 2: 대표 로케이션 (볼드) */}
      {shownLocs.length > 0 ? (
        <div className="text-xs font-bold font-mono text-slate-700 truncate">
          {shownLocs.join('  ')}
          {extraLocs > 0 && <span className="text-slate-400 font-normal ml-1">+{extraLocs}</span>}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">진열 로케이션 없음</p>
      )}

      {/* 행 3: 진열자 */}
      <div className="text-xs text-slate-500">{a.worker}</div>

      {/* 행 4: 신고 시각 */}
      <div className="text-xs text-slate-400">{cardDate(a.reported_at)}</div>

      {/* 행 5: 바코드 + 누락/초과 / 상품명 */}
      {firstItem ? (
        <div className="flex items-start gap-2 text-xs min-w-0 overflow-hidden">
          <div className="flex-1 space-y-0.5 min-w-0 overflow-hidden">
            <div className="flex items-baseline gap-1 min-w-0 overflow-hidden">
              <span className="font-mono text-slate-600 flex-shrink-0">
                {firstItem.barcode.slice(0, -3)}
                <span className="font-bold">{firstItem.barcode.slice(-3)}</span>
              </span>
              {uniqueBarcodeCount > 1 && (
                <span className="text-slate-400 flex-shrink-0">외 {uniqueBarcodeCount - 1}종</span>
              )}
              <span className={`flex-shrink-0 font-medium ${style.countColor}`}>{diffLabel}</span>
            </div>
            <div className="text-slate-400">
              {firstItem.product_name.length > 22
                ? firstItem.product_name.slice(0, 22) + '…'
                : firstItem.product_name}
            </div>
          </div>
          {thumb && (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              className="flex-shrink-0 w-9 h-9 rounded-md object-cover border border-slate-200 bg-white"
            />
          )}
        </div>
      ) : (
        <div className="text-xs text-slate-400">{diffLabel}</div>
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
              className={`h-full rounded-full transition-all ${completed ? 'bg-green-500' : 'bg-slate-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* 결과 배지: 찾음은 하나만 눌러도 표시, 찾음 있으면 없음 숨김 */}
      {(completed || foundCount > 0 || (notFoundCount > 0 && foundCount === 0)) && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {completed && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">✓ 완료</span>
          )}
          {foundCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">찾음 {foundCount}</span>
          )}
          {notFoundCount > 0 && foundCount === 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 font-medium">없음</span>
          )}
        </div>
      )}

    </div>
  );
}
