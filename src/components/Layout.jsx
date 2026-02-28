import { useState, useEffect, useCallback } from 'react';
import { sb } from '../lib/supabase';
import Sidebar from './Sidebar';
import DetailPanel from './DetailPanel';
import PasteModal from './PasteModal';
import ErrorBoundary from './ErrorBoundary';

export default function Layout({ user, onLogout }) {
  const [analyses, setAnalyses]     = useState([]);   // DB에서 불러온 분석 목록
  const [checks, setChecks]         = useState({});   // { analysis_id: { location_code: {result, checked_by} } }
  const [selected, setSelected]     = useState(null); // 선택된 analysis_id
  const [showPaste, setShowPaste]   = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);
  const [search, setSearch]         = useState('');   // 사이드바 검색어

  // ── 분석 목록 로드 ─────────────────────────────────────────────
  const loadAnalyses = useCallback(async () => {
    const { data, error } = await sb
      .from('analyses')
      .select('*')
      .order('reported_at', { ascending: false });
    if (!error && data) setAnalyses(data);
  }, []);

  // ── 체크 결과 로드 ─────────────────────────────────────────────
  const loadChecks = useCallback(async () => {
    const { data, error } = await sb
      .from('location_checks')
      .select('*');
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

  // ── 초기 로드 + Realtime 구독 ──────────────────────────────────
  useEffect(() => {
    Promise.all([loadAnalyses(), loadChecks()]).finally(() => setLoadingInit(false));

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

  const selectedAnalysis = analyses.find(a => a.id === selected) ?? null;
  const selectedChecks   = selected ? (checks[selected] ?? {}) : {};

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      {/* ── 상단 헤더 ── */}
      <header className="flex items-center justify-between px-4 md:px-5 py-3 bg-white/95 backdrop-blur border-b border-slate-200 flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl">📦</span>
          <span className="font-bold tracking-tight text-slate-800 text-sm md:text-base">PS 업무 보조 도구</span>
        </div>
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
        <div className={`${selected != null ? 'hidden ' : ''}md:block`}>
          <Sidebar
            analyses={analyses}
            checks={checks}
            selected={selected}
            onSelect={setSelected}
            onDelete={handleDelete}
            loading={loadingInit}
            search={search}
            onSearchChange={setSearch}
          />
        </div>
        {/* 모바일: 선택 있을 때만 표시 / 데스크탑: 항상 표시 */}
        <div className={`flex-1 min-w-0 flex flex-col ${selected == null ? 'hidden md:flex' : ''}`}>
          <ErrorBoundary key={selected}>
            <DetailPanel
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
    </div>
  );
}
