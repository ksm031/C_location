import { useState, useMemo, useEffect } from 'react';
import ErrorCard from './ErrorCard';
import { getImgs } from '../lib/imageUtils';
import { compareLocation, primaryLocationCode, checkOutcome } from '../lib/utils';

/** 카드 대표 상품 바코드 (초과/누락 항목 중 첫 번째) */
function repBarcode(a) {
  const item = [...(a.overage_items ?? []), ...(a.tote_remaining_items ?? [])]
    .find(i => i?.barcode);
  return item?.barcode ?? null;
}

export default function Sidebar({ analyses, checks, selected, onSelect, onDelete, onDeleteAll, onDeleteCompleted, loading, loadError, onRetry, search, onSearchChange }) {
  const [onlyOpen, setOnlyOpen] = useState(false); // 미완료만 보기
  const [sort, setSort] = useState('location'); // 'location' | 'reported_at'
  const [thumbs, setThumbs] = useState({});     // { barcode: dataUrl }

  // 대표 상품 썸네일: 전 카드 바코드를 모아 한 번에 조회 (캐시 사용)
  const repBarcodes = useMemo(
    () => [...new Set(analyses.map(repBarcode).filter(Boolean))],
    [analyses]
  );

  useEffect(() => {
    if (!repBarcodes.length) return;
    let alive = true;
    getImgs(repBarcodes).then(map => { if (alive) setThumbs(prev => ({ ...prev, ...map })); });
    return () => { alive = false; };
  }, [repBarcodes]);

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

  // 완료 건 (찾음 1건 이상 · 또는 전 로케이션 '없음' 확인) — 카드와 같은 판정 사용
  const completedIds = useMemo(() =>
    analyses
      .filter(a => {
        const o = checkOutcome(a.locations ?? [], checks[a.id] ?? {});
        return o === 'found' || o === 'missing';
      })
      .map(a => a.id),
    [analyses, checks]
  );
  const completedCount = completedIds.length;

  // 미완료만 보기
  const visible = useMemo(() => {
    if (!onlyOpen) return filtered;
    const done = new Set(completedIds);
    return filtered.filter(a => !done.has(a.id));
  }, [filtered, onlyOpen, completedIds]);

  // 정렬
  const sorted = useMemo(() => {
    if (sort === 'location') {
      // '없음'으로 확인한 로케이션은 제외하고 남은 것 중 가장 빠른 로케이션 기준
      const keyOf = new Map(
        visible.map(a => [a.id, primaryLocationCode(a.locations ?? [], checks[a.id] ?? {})])
      );
      return [...visible].sort((a, b) =>
        compareLocation(keyOf.get(a.id) ?? '', keyOf.get(b.id) ?? '')
      );
    }
    // reported_at 내림차순 (기본)
    return [...visible].sort((a, b) =>
      (b.reported_at ?? '').localeCompare(a.reported_at ?? '')
    );
  }, [visible, sort, checks]);

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
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
              sort === 'location'
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            로케이션순
          </button>
          <button
            onClick={() => setSort('reported_at')}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
              sort === 'reported_at'
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            신고 시각순
          </button>
        </div>
        <button
          onClick={() => setOnlyOpen(v => !v)}
          className={`w-full py-1.5 text-xs rounded-md transition-colors ${
            onlyOpen
              ? 'bg-slate-700 text-white font-medium'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          {onlyOpen ? `미완료만 (${total - completedCount}건)` : '미완료만 보기'}
        </button>
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
                onClick={() => onDeleteCompleted?.(completedIds)}
                disabled={completedCount === 0}
                title="찾음 1건 이상이거나 전 로케이션을 '없음'으로 확인한 오류를 삭제"
                className="text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-slate-400
                           disabled:cursor-default transition-colors"
              >
                완료 삭제
              </button>
              <span className="text-slate-200">|</span>
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
              className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-slate-400'}`}
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
        {!loading && loadError && (
          <div className="text-center py-8 px-3">
            <p className="text-xs text-red-600 font-medium mb-1">목록을 불러오지 못했습니다</p>
            <p className="text-[11px] text-slate-400 mb-3">네트워크 상태를 확인해 주세요</p>
            <button
              onClick={onRetry}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}
        {!loading && !loadError && sorted.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-8">
            {search ? '검색 결과 없음' : onlyOpen ? '미완료 항목 없음' : '저장된 오류보고 없음'}
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
            thumb={thumbs[repBarcode(a)] ?? null}
          />
        ))}
      </div>
    </aside>
  );
}
