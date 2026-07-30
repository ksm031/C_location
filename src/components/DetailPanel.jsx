import { useState, useMemo, useEffect } from 'react';
import LocationAccordion from './LocationAccordion';
import SystemItemsPanel from './SystemItemsPanel';
import ToteMemoModal from './ToteMemoModal';
import { getImgs } from '../lib/imageUtils';
import { cardDate, REASON_STYLE, compareLocation, checkOutcome, OUTCOME_STYLE } from '../lib/utils';

export default function DetailPanel({ analysis, checks, onCheck, onUncheck, stars = {}, onStarToggle, user, onBack, memo, onMemoSave, onMemoDelete }) {
  const [sortBy, setSortBy]       = useState('location'); // 'location' | 'time'
  const [filterBy, setFilter]     = useState('all');       // 'all' | 'unchecked' | 'found' | 'not_found'
  const [showSysItems, setShowSysItems] = useState(false);
  const [memoOpen, setMemoOpen]   = useState(false);
  const [thumbs, setThumbs]       = useState({}); // { barcode: dataUrl }

  // analysis 바뀌면 패널 닫기
  useEffect(() => {
    setShowSysItems(false);
  }, [analysis?.id]);

  // 전산 상품 썸네일 로드
  useEffect(() => {
    setThumbs({});
    if (!analysis) return;
    const barcodes = [...new Set(
      [...(analysis.overage_items ?? []), ...(analysis.tote_remaining_items ?? [])]
        .map(i => i.barcode).filter(Boolean)
    )];
    if (!barcodes.length) return;
    getImgs(barcodes).then(setThumbs);
  }, [analysis]);

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
  // 찾아서 완료 / 못 찾아서 완료 구분
  const outcome   = checkOutcome(locs, checks);
  const outStyle  = OUTCOME_STYLE[outcome];
  const completed = outcome === 'found' || outcome === 'missing';

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

  // 진열 내역의 실제 진열자들 (2명 이상이면 헤더에 경고)
  const displayWorkers = [...new Set(
    locs.flatMap(l => (l.items ?? []).map(i => i.display_worker)).filter(Boolean)
  )];
  const multiWorker  = displayWorkers.length > 1;
  // 신고자(오류보고 상 진열 작업자)를 맨 앞으로 — 여러 명일 때 누가 신고자인지 바로 보이게
  const reporter = a.worker ?? null;
  const orderedWorkers = displayWorkers.length > 0
    ? [...displayWorkers.filter(w => w === reporter), ...displayWorkers.filter(w => w !== reporter)]
    : (reporter ? [reporter] : []);

  // 초과/누락 수량: 항목 합계 우선, 누락은 항목이 없으면 보고서 전산수량으로 대체
  const overageQty  = (a.overage_items ?? []).reduce((s, i) => s + (i.qty ?? 0), 0);
  const remainQty   = (a.tote_remaining_items ?? []).reduce((s, i) => s + (i.sys_qty ?? 0), 0);
  const shortageQty = remainQty > 0
    ? remainQty
    : (a.reason === 'SHORTAGE' || hasBothIssues ? (a.sys_qty ?? 0) : 0);

  // 여러 종일 때: 첫 상품 수량 / 나머지 수량 (합계가 첫 상품 것으로 오독되는 것 방지)
  const itemQty  = i => i.sys_qty ?? i.qty ?? 0;
  const firstQty = uniqueProducts.length > 0 ? itemQty(uniqueProducts[0]) : 0;
  const restQty  = uniqueProducts.slice(1).reduce((s, i) => s + itemQty(i), 0);
  const multiKind = uniqueProducts.length > 1;

  // 양쪽 다 있으면 둘 다 표시 (여러 종이면 '총'을 붙여 합계임을 명시)
  const sum = multiKind ? '총 ' : '';
  const diffParts = [];
  if (overageQty  > 0) diffParts.push({ text: `초과 ${sum}${overageQty}개`,  cls: 'text-yellow-600' });
  if (shortageQty > 0) diffParts.push({ text: `누락 ${sum}${shortageQty}개`, cls: 'text-blue-600' });
  if (diffParts.length === 0) {
    diffParts.push(a.reason === 'SHORTAGE'
      ? { text: '누락', cls: 'text-blue-600' }
      : { text: '초과', cls: 'text-yellow-600' });
  }

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
      list.sort((a, b) => compareLocation(a.location_code, b.location_code));
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

        {/* 행 2: 유형(pill) + 진행 상태(텍스트) + 경고(pill) */}
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 md:mt-1.5 text-xs">
          {/* 위계 1: 유형 — 유일한 기본 pill */}
          <span className={`px-2 py-0.5 rounded-full font-medium ${(REASON_STYLE[a.reason] ?? REASON_STYLE.SHORTAGE).badge}`}>
            {a.reason}
          </span>
          {hasBothIssues && <span className="text-slate-400">+SHORTAGE</span>}

          {/* 위계 2: 진행 상태 — pill 대신 점 구분 텍스트 */}
          <span className="flex items-center gap-1.5 text-slate-400">
            <span aria-hidden="true">·</span>
            {outcome === 'found' ? (
              <span className="text-green-600 font-bold">✓ 찾음 {foundCount}</span>
            ) : outcome === 'missing' ? (
              <span className="text-red-600 font-bold">✗ 못 찾음</span>
            ) : (
              <span className="text-slate-600 font-medium">{done}/{locs.length}</span>
            )}
            {completed && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-slate-400">{done}/{locs.length} 확인</span>
              </>
            )}
          </span>

          {/* 위계 1: 경고 — 눈에 띄어야 하므로 pill 유지 */}
          {multiWorker && (
            <span
              className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold"
              title={`진열자 ${displayWorkers.join(', ')}`}
            >
              ⚠ 진열자 {displayWorkers.length}명
            </span>
          )}
        </div>

        {/* 행 3: 신고시간 · 진열자 · 입고자 · 전산 + 메모 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
          <span>{cardDate(a.reported_at)}</span>
          <span className={multiWorker ? 'text-amber-700' : undefined}>
            진열자{' '}
            {orderedWorkers.length === 0 ? '-' : orderedWorkers.map((w, i) => (
              <span
                key={w}
                className={multiWorker && w === reporter ? 'text-[13px] font-bold' : undefined}
                title={multiWorker && w === reporter ? '신고자' : undefined}
              >
                {i > 0 && <span className="font-normal text-[12px]">, </span>}
                {w}
              </span>
            ))}
          </span>
          <span>입고자 {a.inbound_worker ?? '-'}</span>
          <span>전산 {a.sys_qty}개</span>
          <button
            onClick={() => setMemoOpen(true)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors
              ${memo
                ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
                : 'text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-slate-600'
              }`}
          >
            <span>{memo ? '📝' : '✎'}</span>
            <span>{memo ? '메모' : '메모 추가'}</span>
          </button>
        </div>
        {memo && (
          <p className="mt-1 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">{memo}</p>
        )}

        {/* 행 4: 찾아야하는 갯수 + 바코드 목록 (접기/펼치기) */}
        {uniqueProducts.length > 0 && (
          <div className="mt-1">
            {/* 요약 줄 (항상 표시) */}
            <div className="flex items-center gap-2 text-xs min-w-0">
              {thumbs[uniqueProducts[0].barcode] && (
                <button
                  onClick={() => setShowSysItems(true)}
                  title={uniqueProducts[0].product_name}
                  className="flex-shrink-0 w-7 h-7 rounded-md overflow-hidden border border-slate-200 bg-slate-50
                             hover:border-blue-300 transition-colors"
                >
                  <img src={thumbs[uniqueProducts[0].barcode]} alt="" className="w-full h-full object-cover" />
                </button>
              )}
              <span className="flex-shrink-0 flex items-center gap-1 font-semibold">
                {diffParts.map((p, i) => (
                  <span key={p.text} className={p.cls}>
                    {i > 0 && <span className="text-slate-300 font-normal mr-1">·</span>}
                    {p.text}
                  </span>
                ))}
              </span>
              <span className="font-mono text-slate-600 flex-shrink-0">
                {uniqueProducts[0].barcode.slice(0, -3)}
                <span className="font-bold">{uniqueProducts[0].barcode.slice(-3)}</span>
              </span>
              {/* 여러 종이면 첫 상품 수량 + 나머지 수량을 각각 표기해 합계 오독 방지 */}
              {multiKind && firstQty > 0 && (
                <span className="flex-shrink-0 font-semibold text-slate-600">{firstQty}개</span>
              )}
              {multiKind && (
                <span className="text-slate-400 flex-shrink-0">
                  외 {uniqueProducts.length - 1}종{restQty > 0 && ` ${restQty}개`}
                </span>
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
            className={`h-full rounded-full transition-all ${outStyle.bar}`}
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
                className={`px-3 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap ${
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
                className={`px-3 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap ${
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
