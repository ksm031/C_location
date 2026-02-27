import { useState, useMemo } from 'react';
import ErrorCard from './ErrorCard';

export default function Sidebar({ analyses, checks, selected, onSelect, onDelete, loading, search, onSearchChange }) {
  const [sort, setSort] = useState('reported_at'); // 'reported_at' | 'location'

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
        return la.localeCompare(lb);
      });
    }
    // reported_at 내림차순 (기본)
    return [...filtered].sort((a, b) =>
      (b.reported_at ?? '').localeCompare(a.reported_at ?? '')
    );
  }, [filtered, sort]);

  return (
    <aside className="w-full md:w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
      {/* 검색 + 정렬 */}
      <div className="p-3 border-b border-slate-100 space-y-2">
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="보고번호 / 로케이션 / 상품 검색"
          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <div className="flex gap-2">
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
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
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
          />
        ))}
      </div>

      {/* 하단 카운트 */}
      <div className="px-3 py-2 border-t border-slate-100 text-xs text-slate-400">
        총 {analyses.length}건
        {search && ` (필터: ${filtered.length}건)`}
      </div>
    </aside>
  );
}
