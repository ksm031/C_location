import { useState, useEffect, useCallback } from 'react';
import { sb } from '../lib/supabase';
import Sidebar from './Sidebar';
import DetailPanel from './DetailPanel';
import PasteModal from './PasteModal';
import MemoModal from './MemoModal';
import ErrorBoundary from './ErrorBoundary';

export default function Layout({ user, onLogout }) {
  const [analyses, setAnalyses]     = useState([]);   // DB에서 불러온 분석 목록
  const [checks, setChecks]         = useState({});   // { analysis_id: { location_code: {result, checked_by} } }
  const [selected, setSelected]     = useState(null); // 선택된 analysis_id
  const [showPaste, setShowPaste]   = useState(false);
  const [showMemo, setShowMemo]     = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);
  const [search, setSearch]         = useState('');   // 사이드바 검색어

  // ── 분석 목록 로드 ─────────────────────────────────────────────
  const loadAnalyses = useCallback(async () => {
    const { data, error } = await sb
      .from('analyses')
      .select('*')
      .eq('created_by', user.nickname)
      .order('reported_at', { ascending: false });
    if (!error && data) setAnalyses(data);
  }, [user.nickname]);

  // ── 체크 결과 로드 ─────────────────────────────────────────────
  const loadChecks = useCallback(async () => {
    // 자기 analyses 의 id 목록을 먼저 가져와서 해당 체크만 조회
    const { data: ids } = await sb
      .from('analyses')
      .select('id')
      .eq('created_by', user.nickname);
    if (!ids?.length) { setChecks({}); return; }

    const { data, error } = await sb
      .from('location_checks')
      .select('*')
      .in('analysis_id', ids.map(r => r.id));
    if (!error && data) {
      const map = {};
      for (const row of data) {
        if (!map[row.analysis_id]) map[row.analysis_id] = {};
        map[row.analysis_id][row.location_code] = {
          result:     row.result,
          checked_by: row.checked_by,
          checked_at: row.checked_at,
        };
      }
      setChecks(map);
    }
  }, []);

  // ── 초기 로드 + 매일 오전 8시 자동 초기화 + Realtime 구독 ───────
  useEffect(() => {
    const init = async () => {
      // 오전 8시가 지났고 오늘 아직 초기화하지 않은 경우 DB 전체 삭제
      // 초기화 여부를 Supabase에 저장 → 모든 기기에서 공유
      const now      = new Date();
      const todayKey = now.toISOString().slice(0, 10); // e.g. "2026-02-28"
      const resetAt  = new Date(now); resetAt.setHours(8, 0, 0, 0);

      if (now >= resetAt) {
        const { data: setting } = await sb
          .from('app_settings')
          .select('value')
          .eq('key', 'daily_reset_date')
          .maybeSingle();

        if (setting?.value !== todayKey) {
          // analyses 삭제 → location_checks 는 ON DELETE CASCADE 로 자동 삭제
          await sb.from('analyses').delete().gte('created_at', '1970-01-01');
          await sb.from('app_settings')
            .upsert({ key: 'daily_reset_date', value: todayKey });
        }
      }

      await Promise.all([loadAnalyses(), loadChecks()]);
      setLoadingInit(false);
    };

    init();

    const ch1 = sb.channel('analyses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analyses' }, loadAnalyses)
      .subscribe();

    const ch2 = sb.channel('checks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_checks' }, loadChecks)
      .subscribe();

    return () => { sb.removeChannel(ch1); sb.removeChannel(ch2); };
  }, [loadAnalyses, loadChecks]);

  // ── 체크 결과 저장/업데이트 ───────────────────────────────────
  const handleCheck = async (analysisId, locationCode, result) => {
    // 낙관적 업데이트
    setChecks(prev => ({
      ...prev,
      [analysisId]: {
        ...prev[analysisId],
        [locationCode]: { result, checked_by: user.nickname, checked_at: new Date().toISOString() },
      },
    }));

    await sb.from('location_checks').upsert(
      { analysis_id: analysisId, location_code: locationCode, result, checked_by: user.nickname },
      { onConflict: 'analysis_id,location_code' }
    );
  };

  // ── 체크 취소 ─────────────────────────────────────────────────
  const handleUncheck = async (analysisId, locationCode) => {
    setChecks(prev => {
      const copy = { ...prev };
      if (copy[analysisId]) {
        const locCopy = { ...copy[analysisId] };
        delete locCopy[locationCode];
        copy[analysisId] = locCopy;
      }
      return copy;
    });
    await sb.from('location_checks')
      .delete()
      .eq('analysis_id', analysisId)
      .eq('location_code', locationCode);
  };

  // ── 삭제 ──────────────────────────────────────────────────────
  const handleDelete = async (analysisId) => {
    if (!window.confirm('이 오류보고를 목록에서 삭제할까요?')) return;
    await sb.from('analyses').delete().eq('id', analysisId);
    if (selected === analysisId) setSelected(null);
  };

  // ── 전체 삭제 (본인 등록분만) ─────────────────────────────────
  const handleDeleteAll = async () => {
    if (!window.confirm(`전체 ${analyses.length}건을 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
    await sb.from('analyses').delete().eq('created_by', user.nickname);
    setSelected(null);
  };

  const selectedAnalysis = analyses.find(a => a.id === selected) ?? null;
  const selectedChecks   = selected ? (checks[selected] ?? {}) : {};

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      {/* ── 상단 헤더 ── */}
      <header className="flex items-center justify-between px-4 md:px-5 py-3 bg-white/95 backdrop-blur border-b border-slate-200 flex-shrink-0 shadow-sm">
        <button
          className="flex items-center gap-2 group"
          onClick={() => setShowMemo(true)}
          title="공유 메모장 열기"
        >
          <span className="text-xl">📦</span>
          <span className="font-bold tracking-tight text-slate-800 text-sm md:text-base
                           group-hover:text-blue-600 transition-colors">진열로케이션정리</span>
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPaste(true)}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                       rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <span>+</span> 붙여넣기
          </button>
          <span className="text-sm text-slate-500">
            <span className="font-medium text-slate-700">{user.nickname}</span>
          </span>
          <button
            onClick={onLogout}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* ── 본문 ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* 모바일: 선택 없을 때만 표시 / 데스크탑: 항상 표시 */}
        <div className={`${selected != null ? 'hidden ' : 'flex-1 '}md:flex-none md:block`}>
          <Sidebar
            analyses={analyses}
            checks={checks}
            selected={selected}
            onSelect={setSelected}
            onDelete={handleDelete}
            onDeleteAll={handleDeleteAll}
            loading={loadingInit}
            search={search}
            onSearchChange={setSearch}
          />
        </div>
        {/* 모바일: 선택 있을 때만 표시 / 데스크탑: 항상 표시 */}
        <div className={`flex-1 min-w-0 flex flex-col ${selected == null ? 'hidden md:flex' : ''}`}>
          <ErrorBoundary key={selected}>
            <DetailPanel
              key={selected}
              analysis={selectedAnalysis}
              checks={selectedChecks}
              onCheck={handleCheck}
              onUncheck={handleUncheck}
              user={user}
              onBack={() => setSelected(null)}
              search={search}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* ── 붙여넣기 모달 ── */}
      {showPaste && (
        <PasteModal
          user={user}
          onClose={() => setShowPaste(false)}
          onSaved={() => { setShowPaste(false); loadAnalyses(); }}
        />
      )}

      {/* ── 공유 메모 모달 ── */}
      {showMemo && (
        <MemoModal
          user={user}
          onClose={() => setShowMemo(false)}
        />
      )}
    </div>
  );
}
