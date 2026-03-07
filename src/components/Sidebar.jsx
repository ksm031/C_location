import { useState, useMemo } from 'react';
import ErrorCard from './ErrorCard';

export default function Sidebar({ analyses, checks, selected, onSelect, onDelete, onDeleteAll, loading, search, onSearchChange, toteMemos, onMemoSave, onMemoDelete }) {
  const [sort, setSort] = useState('location'); // 'location' | 'reported_at'

  // 검색 필터
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return analyses.filter(a => {
      if (!q) return true;
      const locs = (a.locations ?? []).map(l => l.location_code).join(' ').toLowerCase();
      const items = (a.locations ?? [])
        .flatMap(l => l.items)
        .map(i => `${i.product_name} ${i.barcode}`.toLowerCase())
        .join(' ');
      return (
        a.report_id.toLowerCase().includes(q) ||
        a.tote_id?.toLowerCase().includes(q) ||
        a.worker?.toLowerCase().includes(q) ||
        locs.includes(q) ||
        items.includes(q)
      );
    });
  }, [analyses, search]);

  // 정렬
  const sorted = useMemo(() => {
    if (sort === 'location') {
      return [...filtered].sort((a, b) => {
        const la = (a.locations?.[0]?.location_code ?? '');
        const lb = (b.locations?.[0]?.location_code ?? '');
        return la.localeCompare(lb, undefined, { numeric: true });
      });
    }
    // reported_at 내림차순 (기본)
    return [...filtered].sort((a, b) =>
      (b.reported_at ?? '').localeCompare(a.reported_at ?? '')
    );
  }, [filtered, sort]);

  // 완료 건수 (ErrorCard의 completed 조건과 동일: 전체 체크 OR 하나라도 발견)
  const completedCount = useMemo(() =>
    analyses.filter(a => {
      const locs = a.locations ?? [];
      if (locs.length === 0) return false;
      const chks = checks[a.id] ?? {};
      const done       = locs.filter(l => chks[l.location_code]).length;
      const foundCount = locs.filter(l => chks[l.location_code]?.result === 'found').length;
      return done === locs.length || foundCount > 0;
    }).length,
    [analyses, checks]
  );
  const total  = analyses.length;
  const pct    = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const allDone = total > 0 && completedCount === total;

  return (
    <aside className="w-full md:w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col shadow-sm h-full">
      {/* 검색 + 정렬 */}
      <div className="p-3 border-b border-slate-100 space-y-2">
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="보고번호 / 로케이션 / 상품 검색"
          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50/70
                     focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setSort('location')}
            className={`flex-1 py-1 text-xs rounded-md transition-colors ${
              sort === 'location'
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            로케이션순
          </button>
          <button
            onClick={() => setSort('reported_at')}
            className={`flex-1 py-1 text-xs rounded-md transition-colors ${
              sort === 'reported_at'
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            신고 시각순
          </button>
        </div>
      </div>

      {/* 진행 현황 + 전체 삭제 */}
      {total > 0 && (
        <div className="px-3 py-2 border-b border-slate-100 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className={`font-medium ${allDone ? 'text-green-600' : 'text-slate-600'}`}>
              완료 {completedCount} / {total}건
              {search && <span className="text-slate-400 font-normal"> ({filtered.length}건)</span>}
              {allDone && <span className="ml-1">✓</span>}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400">{pct}%</span>
              <button
                onClick={onDeleteAll}
                className="text-red-400 hover:text-red-600 transition-colors"
              >
                전체 삭제
              </button>
            </div>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* 목록 */}
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-2 space-y-1.5">
        {loading && (
          <p className="text-xs text-slate-400 text-center py-8">불러오는 중...</p>
        )}
        {!loading && sorted.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-8">
            {search ? '검색 결과 없음' : '저장된 오류보고 없음'}
          </p>
        )}
        {sorted.map(a => (
          <ErrorCard
            key={a.id}
            analysis={a}
            checks={checks[a.id] ?? {}}
            selected={selected === a.id}
            onSelect={() => onSelect(a.id)}
            onDelete={() => onDelete(a.id)}
            memo={toteMemos?.[a.tote_id] ?? null}
            onMemoSave={(text) => onMemoSave(a.tote_id, text)}
            onMemoDelete={() => onMemoDelete(a.tote_id)}
          />
        ))}
      </div>
    </aside>
  );
}
