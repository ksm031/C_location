import { useState, useMemo, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import LocationAccordion from './LocationAccordion';
import { getImgs } from '../lib/imageUtils';

/** Code 128 바코드 SVG 컴포넌트 */
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
    } catch (_) { /* 잘못된 바코드 값 무시 */ }
  }, [value]);
  if (!value) return null;
  return <svg ref={svgRef} className="max-w-full" />;
}

const REASON_STYLE = {
  SHORTAGE: { badge: 'bg-blue-100 text-blue-700' },
  OVERAGE:  { badge: 'bg-yellow-100 text-yellow-700' },
};

/** "2026-02-27T22:15:22+00:00" → "02.27 22:15:22" */
function cardDate(dateStr) {
  if (!dateStr) return '';
  const m = dateStr.match(/\d{4}-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return dateStr;
  return `${m[1]}.${m[2]} ${m[3]}:${m[4]}:${m[5]}`;
}

export default function DetailPanel({ analysis, checks, onCheck, onUncheck, user, onBack, search }) {
  const [sortBy, setSortBy]       = useState('location'); // 'location' | 'time'
  const [filterBy, setFilter]     = useState('all');       // 'all' | 'unchecked' | 'found' | 'not_found'
  const [barcodeExpanded, setBarcodeExpanded] = useState(false);
  const [productImages, setProductImages]     = useState({}); // { barcode: dataUrl }

  // analysis 바뀌면 이미지 캐시 초기화
  useEffect(() => {
    setProductImages({});
    setBarcodeExpanded(false);
  }, [analysis?.id]);

  // 아코디언 열릴 때 이미지 fetch
  useEffect(() => {
    if (!barcodeExpanded || !analysis) return;
    const seen = new Set();
    const barcodes = (analysis.locations ?? [])
      .flatMap(l => l.items ?? [])
      .filter(item => {
        if (seen.has(item.barcode)) return false;
        seen.add(item.barcode);
        return true;
      })
      .map(item => item.barcode);
    if (!barcodes.length) return;
    getImgs(barcodes).then(setProductImages);
  }, [barcodeExpanded, analysis?.id]);

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
  const completed = locs.length > 0 && done === locs.length;

  const allItems = locs.flatMap(l => l.items ?? []);
  const seenBarcodes = new Set();
  const uniqueProducts = allItems.filter(item => {
    if (seenBarcodes.has(item.barcode)) return false;
    seenBarcodes.add(item.barcode);
    return true;
  });
  const targetBarcodes = uniqueProducts.map(p => p.barcode);
  const diffQty = a.reason === 'SHORTAGE' ? `누락 ${a.sys_qty}개` : `초과 ${a.placed_qty}개`;

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
    return sortedLocs.filter(l => checks[l.location_code]?.result === filterBy);
  }, [sortedLocs, filterBy, checks]);

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* 모바일 뒤로가기 */}
      {onBack && (
        <button
          onClick={onBack}
          className="md:hidden flex items-center gap-1.5 px-4 py-2.5 bg-white border-b border-slate-200
                     text-sm text-blue-600 font-medium flex-shrink-0"
        >
          <span>&#8592;</span> 목록으로
        </button>
      )}

      {/* 상단 정보 헤더 */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex-shrink-0">
        {/* 행 1: 토트번호 */}
        <div className="font-mono text-lg md:text-xl font-bold text-slate-800 truncate">
          {a.tote_id ?? '-'}
        </div>

        {/* 행 2: 숏/오버 배지 + 완료여부 */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(REASON_STYLE[a.reason] ?? REASON_STYLE.SHORTAGE).badge}`}>
            {a.reason}
          </span>
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
              {/* 펼치기/접기 토글 */}
              <button
                onClick={() => setBarcodeExpanded(v => !v)}
                className="flex-shrink-0 text-blue-400 hover:text-blue-600 ml-auto pl-2"
              >
                {barcodeExpanded ? '접기 ▲' : '바코드 ▼'}
              </button>
            </div>

            {/* 바코드 목록 (펼쳤을 때) - max-h 스크롤로 헤더 overflow 방지 */}
            {barcodeExpanded && (
              <div className="mt-1.5 border-t border-slate-100 pt-1.5 max-h-60 overflow-y-auto space-y-1.5">
                {uniqueProducts.map(item => (
                  <div key={item.barcode}>
                    <div className="flex items-baseline gap-1.5 text-xs">
                      <span className="font-mono text-slate-700 font-medium flex-shrink-0">
                        {item.barcode.slice(0, -3)}
                        <span className="font-bold">{item.barcode.slice(-3)}</span>
                      </span>
                      <span className="text-slate-500 truncate">{item.product_name}</span>
                    </div>
                    {productImages[item.barcode] && (
                      <img
                        src={productImages[item.barcode]}
                        alt=""
                        className="mt-1 h-28 rounded-lg border border-slate-200 object-cover"
                      />
                    )}
                    <div className="overflow-x-auto">
                      <Barcode128 value={item.barcode} />
                    </div>
                  </div>
                ))}
              </div>
            )}
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
      <div className="px-4 md:px-6 py-2.5 bg-white border-b border-slate-100 flex flex-wrap items-center gap-2 md:gap-3 flex-shrink-0">
        <span className="text-xs text-slate-500">정렬:</span>
        <div className="flex gap-1">
          {[['location', '로케이션'], ['time', '진열시각']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSortBy(val)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
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
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                filterBy === val ? 'bg-slate-700 text-white font-medium' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

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
          />
        ))}
      </div>
    </main>
  );
}
