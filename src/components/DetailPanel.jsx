import { useState, useMemo } from 'react';
import LocationAccordion from './LocationAccordion';
import { formatDate } from '../lib/parser';

const REASON_STYLE = {
  SHORTAGE: 'bg-orange-100 text-orange-700',
  OVERAGE:  'bg-blue-100 text-blue-700',
};

export default function DetailPanel({ analysis, checks, onCheck, user, onBack }) {
  const [sortBy, setSortBy]   = useState('location'); // 'location' | 'time'
  const [filterBy, setFilter] = useState('all');       // 'all' | 'unchecked' | 'found' | 'not_found'

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
  const done = locs.filter(l => checks[l.location_code]).length;
  const pct  = locs.length > 0 ? Math.round((done / locs.length) * 100) : 0;
  const completed = locs.length > 0 && done === locs.length;

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
      list.sort((a, b) => a.location_code.localeCompare(b.location_code));
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
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-3 md:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm md:text-base font-bold text-slate-800">{a.report_id}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${REASON_STYLE[a.reason] ?? 'bg-slate-100 text-slate-600'}`}>
                {a.reason}
              </span>
              {completed && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                  ✓ 완료
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
              <span>신고: {formatDate(a.reported_at)}</span>
              <span>토트: {a.tote_id}</span>
              <span>진열자: {a.worker}</span>
              <span>토트 {a.tote_qty}개 / 진열 {a.placed_qty}개 / 전산 {a.sys_qty}개</span>
            </div>
          </div>

          {/* 진행률 */}
          <div className="flex-shrink-0 text-right">
            <div className="text-xl md:text-2xl font-bold text-slate-700">{pct}%</div>
            <div className="text-xs text-slate-500">{done} / {locs.length}</div>
            <div className="mt-1 h-2 bg-slate-200 rounded-full overflow-hidden w-20 md:w-28 ml-auto">
              <div
                className={`h-full rounded-full transition-all ${completed ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
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
            analysisId={a.id}
          />
        ))}
      </div>
    </main>
  );
}
