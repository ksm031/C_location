import { useState, useMemo, useEffect } from 'react';
import LocationAccordion from './LocationAccordion';
import SystemItemsPanel from './SystemItemsPanel';
import ToteMemoModal from './ToteMemoModal';
import { cardDate, REASON_STYLE } from '../lib/utils';

export default function DetailPanel({ analysis, checks, onCheck, onUncheck, stars = {}, onStarToggle, user, onBack, memo, onMemoSave, onMemoDelete }) {
  const [sortBy, setSortBy]       = useState('location'); // 'location' | 'time'
  const [filterBy, setFilter]     = useState('all');       // 'all' | 'unchecked' | 'found' | 'not_found'
  const [showSysItems, setShowSysItems] = useState(false);
  const [memoOpen, setMemoOpen]   = useState(false);

  // analysis 바뀌면 패널 닫기
  useEffect(() => {
    setShowSysItems(false);
  }, [analysis?.id]);

  if (!analysis) {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-400">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-sm">왼쪽 목록에서 오류보고를 선택하거나</p>
          <p className="text-sm">상단 <strong>+ 붙여넣기</strong> 버튼으로 추가하세요.</p>
        </div>
      </main>
    );
  }

  const a    = analysis;
  const locs = a.locations ?? [];
  const done        = locs.filter(l => checks[l.location_code]).length;
  const foundCount  = locs.filter(l => checks[l.location_code]?.result === 'found').length;
  const notFoundCount = locs.filter(l => checks[l.location_code]?.result === 'not_found').length;
  const pct  = locs.length > 0 ? Math.round((done / locs.length) * 100) : 0;
  const completed = locs.length > 0 && (done === locs.length || foundCount > 0);

  // 헤더 상품 목록: 오버리지 등록 항목 + 토트에 남은 전산재고만 표시
  const issueItems = [...(a.overage_items ?? []), ...(a.tote_remaining_items ?? [])];
  const seenBarcodes = new Set();
  const uniqueProducts = issueItems.filter(item => {
    if (seenBarcodes.has(item.barcode)) return false;
    seenBarcodes.add(item.barcode);
    return true;
  });
  const targetBarcodes = uniqueProducts.map(p => p.barcode);
  const hasBothIssues = a.reason === 'OVERAGE' && a.sys_qty > 0;
  const overageQty = (a.overage_items ?? []).reduce((s, i) => s + i.qty, 0);
  const diffQty = a.reason === 'SHORTAGE' ? `누락 ${a.sys_qty}개` : `초과 ${overageQty}개`;

  // 정렬
  const sortedLocs = useMemo(() => {
    let list = [...locs];
    if (sortBy === 'time') {
      list.sort((a, b) => {
        const ta = a.items?.[0]?.display_at ?? '';
        const tb = b.items?.[0]?.display_at ?? '';
        return ta.localeCompare(tb);
      });
    } else {
      list.sort((a, b) => a.location_code.localeCompare(b.location_code, undefined, { numeric: true }));
    }
    return list;
  }, [locs, sortBy]);

  // 필터
  const visibleLocs = useMemo(() => {
    if (filterBy === 'all') return sortedLocs;
    if (filterBy === 'unchecked') return sortedLocs.filter(l => !checks[l.location_code]);
    if (filterBy === 'starred') return sortedLocs.filter(l => stars[l.location_code]);
    return sortedLocs.filter(l => checks[l.location_code]?.result === filterBy);
  }, [sortedLocs, filterBy, checks, stars]);

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* 모바일: 뒤로가기 + 토트번호 한 줄 */}
      {onBack && (
        <div className="md:hidden flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-200 flex-shrink-0">
          <button
            onClick={onBack}
            className="text-blue-600 font-medium text-sm flex-shrink-0"
          >
            &#8592; 목록
          </button>
          <span className="font-mono text-base font-bold text-slate-800 truncate">{a.tote_id ?? '-'}</span>
        </div>
      )}

      {/* 상단 정보 헤더 */}
      <div className="bg-white border-b border-slate-200 px-3 md:px-6 py-2 md:py-3 flex-shrink-0">
        {/* 행 1: 토트번호 (데스크탑만) */}
        <div className="hidden md:block font-mono text-xl font-bold text-slate-800 truncate">
          {a.tote_id ?? '-'}
        </div>

        {/* 행 2: 숏/오버 배지 + 완료여부 */}
        <div className="flex items-center gap-2 md:mt-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(REASON_STYLE[a.reason] ?? REASON_STYLE.SHORTAGE).badge}`}>
            {a.reason}
          </span>
          {hasBothIssues && (
            <span className="text-xs text-slate-500 font-medium">+ SHORTAGE</span>
          )}
          {completed ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              ✓ 완료
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
              {done}/{locs.length} 진행중
            </span>
          )}
          {foundCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">
              발견 {foundCount}
            </span>
          )}
          {notFoundCount > 0 && foundCount === 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
              없음
            </span>
          )}
        </div>

        {/* 행 3: 신고시간 · 진열자 · 전산 */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-500">
          <span>{cardDate(a.reported_at)}</span>
          <span>진열자 {a.worker}</span>
          <span>전산 {a.sys_qty}개</span>
        </div>

        {/* 메모 버튼 */}
        <div className="mt-1.5">
          <button
            onClick={() => setMemoOpen(true)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors
              ${memo
                ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
                : 'text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-slate-600'
              }`}
          >
            <span>{memo ? '📝' : '✎'}</span>
            <span>{memo ? '메모 있음' : '메모 추가'}</span>
          </button>
          {memo && (
            <p className="mt-1 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">{memo}</p>
          )}
        </div>

        {/* 행 4: 찾아야하는 갯수 + 바코드 목록 (접기/펼치기) */}
        {uniqueProducts.length > 0 && (
          <div className="mt-1">
            {/* 요약 줄 (항상 표시) */}
            <div className="flex items-baseline gap-2 text-xs min-w-0">
              <span className={`flex-shrink-0 font-semibold ${a.reason === 'SHORTAGE' ? 'text-blue-600' : 'text-yellow-600'}`}>
                {diffQty}
              </span>
              <span className="font-mono text-slate-600 flex-shrink-0">
                {uniqueProducts[0].barcode.slice(0, -3)}
                <span className="font-bold">{uniqueProducts[0].barcode.slice(-3)}</span>
              </span>
              {uniqueProducts.length > 1 && (
                <span className="text-slate-400 flex-shrink-0">外 {uniqueProducts.length - 1}종</span>
              )}
              <span className="text-slate-400 truncate">{uniqueProducts[0].product_name}</span>
              {/* 자세히 → 전산 품목 체크 패널 */}
              <button
                onClick={() => setShowSysItems(true)}
                className="flex-shrink-0 ml-auto px-2.5 py-0.5 text-xs font-medium text-blue-600
                           bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-full transition-colors"
              >
                자세히
              </button>
            </div>

          </div>
        )}

        {/* 진행률 바 */}
        <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${completed ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* 정렬 + 필터 컨트롤 */}
      <div className="px-3 md:px-6 py-2 bg-white border-b border-slate-100 flex-shrink-0
                      overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-2 md:gap-3 min-w-max">
          <span className="text-xs text-slate-500">정렬:</span>
          <div className="flex gap-1">
            {[['location', '로케이션'], ['time', '진열시각']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setSortBy(val)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors whitespace-nowrap ${
                  sortBy === val ? 'bg-blue-100 text-blue-700 font-medium' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-500 ml-1 md:ml-3">필터:</span>
          <div className="flex gap-1">
            {[
              ['all',       '전체'],
              ['unchecked', '미체크'],
              ['found',     '발견'],
              ['not_found', '없음'],
              ['starred',   '★ 관심'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors whitespace-nowrap ${
                  filterBy === val ? 'bg-slate-700 text-white font-medium' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 전산 품목 체크 패널 */}
      {showSysItems && (
        <SystemItemsPanel
          analyses={[analysis]}
          onClose={() => setShowSysItems(false)}
        />
      )}

      {/* 토트 메모 모달 */}
      {memoOpen && (
        <ToteMemoModal
          toteId={analysis.tote_id}
          initialText={memo ?? ''}
          onSave={(text) => onMemoSave(analysis.tote_id, text)}
          onDelete={() => onMemoDelete(analysis.tote_id)}
          onClose={() => setMemoOpen(false)}
        />
      )}

      {/* 로케이션 목록 */}
      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-2">
        {locs.length === 0 && (
          <div className="text-center text-slate-400 py-12">
            <p className="text-sm">진열된 로케이션 정보가 없습니다.</p>
            <p className="text-xs mt-1">(OVERAGE 또는 진열 내역 없음)</p>
          </div>
        )}

        {visibleLocs.length === 0 && locs.length > 0 && (
          <p className="text-sm text-slate-400 text-center py-8">해당 조건의 로케이션이 없습니다.</p>
        )}

        {visibleLocs.map(loc => (
          <LocationAccordion
            key={loc.location_code}
            location={loc}
            check={checks[loc.location_code]}
            onCheck={onCheck}
            onUncheck={onUncheck}
            analysisId={a.id}
            targetBarcodes={targetBarcodes}
            starred={!!stars[loc.location_code]}
            onStarToggle={onStarToggle}
          />
        ))}
      </div>
    </main>
  );
}
