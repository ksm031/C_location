import { useState, useEffect, useCallback, useRef } from 'react';
import { sb } from '../lib/supabase';
import { parseText } from '../lib/parser';
import { clearImgCache } from '../lib/imageUtils';
import { localDateKey } from '../lib/utils';
import { notify } from '../lib/toast';
import ToastHost from './ToastHost';

/** 배포 빌드 시각 "MM.DD HH:mm" (vite define 으로 주입) */
const BUILD_LABEL = (() => {
  const d = new Date(__BUILD_TIME__);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
})();
import Sidebar from './Sidebar';
import DetailPanel from './DetailPanel';
import PasteModal from './PasteModal';
import MemoModal from './MemoModal';
import ErrorBoundary from './ErrorBoundary';

export default function Layout({ user, onLogout }) {
  const [analyses, setAnalyses]     = useState([]);   // DB에서 불러온 분석 목록
  const [checks, setChecks]         = useState({});   // { analysis_id: { location_code: {result, checked_by} } }
  const [selected, setSelected]     = useState(null); // 선택된 analysis_id
  const [showPaste, setShowPaste] = useState(false);
  const [pasteSeed, setPasteSeed] = useState(''); // 확장 프로그램이 넘겨준 초기 텍스트
  const [pendingOpen, setPendingOpen] = useState(null); // 확장의 '진행 상황 열기' 보류 요청
  const [showMemo, setShowMemo]   = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);
  const [search, setSearch]         = useState('');   // 사이드바 검색어
  const [stars, setStars]           = useState({});   // { analysis_id: { location_code: true } }
  const [toteMemos, setToteMemos]   = useState({});   // { tote_id: memo_text }
  const [deletedNotice, setDeletedNotice] = useState(false); // 타 기기 삭제 알림
  const [loadError, setLoadError] = useState(null);           // 목록 로드 실패 사유
  const loadSeq = useRef(0);                                  // 늦게 온 응답 무시용

  // ── 크롬 확장 사이드바에서 넘어온 요청 ──
  //   intent 'register' — 텍스트를 채워 붙여넣기 모달을 연다 (저장은 사용자 확인)
  //   intent 'open'     — 이미 등록된 건이면 그 진행 상황을 연다
  useEffect(() => {
    const onMessage = (e) => {
      if (e.data?.type !== 'PS_PASTE_TEXT' || typeof e.data.text !== 'string') return;
      const { text, intent } = e.data;

      if (intent === 'open') {
        const ids = parseText(text).reports.map(r => r.report_id).filter(Boolean);
        if (ids.length === 0) { notify('이 화면에서 보고번호를 찾지 못했습니다'); return; }
        // 목록이 아직 안 왔을 수 있어 요청을 보류해 두고 아래 effect 가 처리한다
        setPendingOpen({ ids, text });
        return;
      }

      setPasteSeed(text);
      setShowPaste(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 보류된 '진행 상황 열기' 요청 처리 (목록이 준비되면 실행)
  useEffect(() => {
    if (!pendingOpen || loadingInit) return;
    const hit = analyses.find(a => pendingOpen.ids.includes(a.report_id));
    setPendingOpen(null);
    if (hit) {
      setSelected(hit.id);
      setDeletedNotice(false);
      return;
    }
    // 등록 기록이 없으면 곧바로 등록 화면으로 — 다음 행동이 등록일 가능성이 높다
    notify('등록된 기록이 없어 등록 화면을 엽니다', 'info');
    setPasteSeed(pendingOpen.text);
    setShowPaste(true);
  }, [pendingOpen, analyses, loadingInit]);

  // ── 타 기기 삭제 감지: analyses 갱신 시 selected가 목록에 없으면 자동 해제 ──
  useEffect(() => {
    if (loadingInit || !selected) return;
    if (!analyses.some(a => a.id === selected)) {
      setSelected(null);
      setDeletedNotice(true);
    }
  }, [analyses, loadingInit, selected]);

  // ── 전체 데이터 로드 (analyses → checks + stars 병렬) ────────
  const loadAll = useCallback(async () => {
    // 늦게 도착한 응답이 최신 상태를 덮어쓰지 않도록 순번을 매긴다
    const seq = ++loadSeq.current;
    const isStale = () => seq !== loadSeq.current;

    const { data, error } = await sb
      .from('analyses')
      .select('*')
      .eq('created_by', user.nickname)
      .order('reported_at', { ascending: false });

    if (isStale()) return;
    if (error || !data) {
      // 로드 실패를 '데이터 없음' 과 구분 (빈 목록 문구가 오해를 부름)
      setLoadError(error?.message ?? '목록을 불러오지 못했습니다');
      return;
    }
    setLoadError(null);
    setAnalyses(data);

    const ids = data.map(r => r.id);
    if (!ids.length) { setChecks({}); setStars({}); return; }

    const [checksRes, starsRes] = await Promise.all([
      sb.from('location_checks').select('*').in('analysis_id', ids),
      sb.from('starred_locations')
        .select('analysis_id, location_code')
        .in('analysis_id', ids)
        .eq('starred_by', user.nickname),
    ]);

    if (isStale()) return;

    if (!checksRes.error && checksRes.data) {
      const map = {};
      for (const row of checksRes.data) {
        if (!map[row.analysis_id]) map[row.analysis_id] = {};
        map[row.analysis_id][row.location_code] = {
          result:     row.result,
          checked_by: row.checked_by,
          checked_at: row.checked_at,
        };
      }
      setChecks(map);
    }

    if (!starsRes.error && starsRes.data) {
      const map = {};
      for (const row of starsRes.data) {
        if (!map[row.analysis_id]) map[row.analysis_id] = {};
        map[row.analysis_id][row.location_code] = true;
      }
      setStars(map);
    }

    const memosRes = await sb.from('tote_memos').select('tote_id, memo');
    if (isStale()) return;
    if (!memosRes.error && memosRes.data) {
      const map = {};
      for (const row of memosRes.data) map[row.tote_id] = row.memo;
      setToteMemos(map);
    }
  }, [user.nickname]);

  // ── 초기 로드 + 매일 오전 8시 자동 초기화 + Realtime 구독 ───────
  useEffect(() => {
    const init = async () => {
      // 오전 8시가 지났고 오늘 아직 초기화하지 않은 경우 DB 전체 삭제
      // 초기화 여부를 Supabase에 저장 → 모든 기기에서 공유
      // 로컬 날짜를 써야 한다 — UTC 로 하면 KST 00~09시에 전날 키가 나와
      // 8시 임계값과 어긋나고, 간격이 벌어진 날엔 하루 두 번 삭제된다
      const now      = new Date();
      const todayKey = localDateKey(now);
      const resetAt  = new Date(now); resetAt.setHours(8, 0, 0, 0);

      if (now >= resetAt) {
        const { data: setting } = await sb
          .from('app_settings')
          .select('value')
          .eq('key', 'daily_reset_date')
          .maybeSingle();
        const prevValue = setting?.value ?? '';

        if (prevValue !== todayKey) {
          // 날짜를 먼저 기록해 다른 기기의 중복 실행을 억제
          await sb.from('app_settings')
            .upsert({ key: 'daily_reset_date', value: todayKey });

          // starred_locations 먼저 (CASCADE 미보장 대비) → analyses(체크는 CASCADE)
          //   → 토트메모 → 공용메모 → 상품이미지
          const results = await Promise.all([
            sb.from('starred_locations').delete().not('analysis_id', 'is', null),
            sb.from('analyses').delete().gte('created_at', '1970-01-01'),
            sb.from('tote_memos').delete().not('tote_id', 'is', null),
            sb.from('memos').delete().not('id', 'is', null),
            sb.from('product_images').delete().not('barcode', 'is', null),
          ]);
          const failed = results.filter(r => r.error);

          if (failed.length > 0) {
            // 일부만 지워진 채 날짜가 기록되면 하루 종일 어중간한 상태로 굳는다.
            // 날짜를 되돌려 다음 접속자가 다시 시도하게 한다.
            await sb.from('app_settings')
              .upsert({ key: 'daily_reset_date', value: prevValue });
            notify('일일 초기화가 완료되지 못했습니다. 새로고침해 주세요.');
            console.error('초기화 실패:', failed.map(r => r.error.message));
          }
          clearImgCache();
        }
      }

      await loadAll();
      setLoadingInit(false);
    };

    init();

    // Realtime 이벤트가 몰릴 때 전체 재조회가 연달아 도는 것을 막는다
    let t = null;
    const reload = () => { clearTimeout(t); t = setTimeout(loadAll, 300); };

    const ch1 = sb.channel('analyses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analyses' }, reload)
      .subscribe();

    const ch2 = sb.channel('checks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_checks' }, reload)
      .subscribe();

    const ch3 = sb.channel('stars-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'starred_locations' }, reload)
      .subscribe();

    const ch4 = sb.channel('tote-memos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tote_memos' }, reload)
      .subscribe();

    return () => { clearTimeout(t); sb.removeChannel(ch1); sb.removeChannel(ch2); sb.removeChannel(ch3); sb.removeChannel(ch4); };
  }, [loadAll]);

  // ── 체크 결과 저장/업데이트 ───────────────────────────────────
  const handleCheck = async (analysisId, locationCode, result) => {
    if (!analyses.some(a => a.id === analysisId)) return; // 타 기기 삭제 방어
    const before = checks;                                 // 실패 시 되돌릴 상태
    setChecks(prev => ({
      ...prev,
      [analysisId]: {
        ...prev[analysisId],
        [locationCode]: { result, checked_by: user.nickname, checked_at: new Date().toISOString() },
      },
    }));

    const { error } = await sb.from('location_checks').upsert(
      { analysis_id: analysisId, location_code: locationCode, result, checked_by: user.nickname },
      { onConflict: 'analysis_id,location_code' }
    );
    if (error) { setChecks(before); notify('체크 저장 실패 — 다시 눌러 주세요'); }
  };

  // ── 체크 취소 ─────────────────────────────────────────────────
  const handleUncheck = async (analysisId, locationCode) => {
    if (!analyses.some(a => a.id === analysisId)) return; // 타 기기 삭제 방어
    const before = checks;
    setChecks(prev => {
      const copy = { ...prev };
      if (copy[analysisId]) {
        const locCopy = { ...copy[analysisId] };
        delete locCopy[locationCode];
        copy[analysisId] = locCopy;
      }
      return copy;
    });
    const { error } = await sb.from('location_checks')
      .delete()
      .eq('analysis_id', analysisId)
      .eq('location_code', locationCode);
    if (error) { setChecks(before); notify('체크 취소 실패 — 다시 시도해 주세요'); }
  };

  // ── 관심 로케이션 토글 ────────────────────────────────────────
  const handleStarToggle = async (analysisId, locationCode) => {
    if (!analyses.some(a => a.id === analysisId)) return; // 타 기기 삭제 방어
    const isStarred = !!stars[analysisId]?.[locationCode];
    const before = stars;
    setStars(prev => {
      const aStars = { ...prev[analysisId] };
      if (isStarred) delete aStars[locationCode];
      else aStars[locationCode] = true;
      return { ...prev, [analysisId]: aStars };
    });
    const { error } = isStarred
      ? await sb.from('starred_locations')
          .delete()
          .eq('analysis_id', analysisId)
          .eq('location_code', locationCode)
          .eq('starred_by', user.nickname)
      : await sb.from('starred_locations').upsert(
          { analysis_id: analysisId, location_code: locationCode, starred_by: user.nickname },
          { onConflict: 'analysis_id,location_code,starred_by' }
        );
    if (error) { setStars(before); notify('관심 표시 저장 실패'); }
  };

  // ── 토트 메모 저장 ────────────────────────────────────────────
  const handleMemoSave = async (toteId, text) => {
    if (!toteId) { notify('토트번호가 없어 메모를 저장할 수 없습니다'); return; }
    const before = toteMemos;
    setToteMemos(prev => ({ ...prev, [toteId]: text }));
    const { error } = await sb.from('tote_memos').upsert(
      { tote_id: toteId, memo: text, updated_by: user.nickname, updated_at: new Date().toISOString() },
      { onConflict: 'tote_id' }
    );
    if (error) { setToteMemos(before); notify('메모 저장 실패 — 내용을 복사해 두세요'); }
  };

  const handleMemoDelete = async (toteId) => {
    const before = toteMemos;
    setToteMemos(prev => { const c = { ...prev }; delete c[toteId]; return c; });
    const { error } = await sb.from('tote_memos').delete().eq('tote_id', toteId);
    if (error) { setToteMemos(before); notify('메모 삭제 실패'); }
  };

  // ── 삭제 ──────────────────────────────────────────────────────
  const handleDelete = async (analysisId) => {
    if (!window.confirm('이 오류보고를 목록에서 삭제할까요?')) return;
    const before = analyses;
    setAnalyses(prev => prev.filter(a => a.id !== analysisId));
    if (selected === analysisId) setSelected(null);
    const { error } = await sb.from('analyses').delete().eq('id', analysisId);
    if (error) { setAnalyses(before); notify('삭제 실패 — 다시 시도해 주세요'); }
  };

  // ── 완료분만 삭제 (찾음 1건 이상 · 또는 전 로케이션 없음 확인) ──
  const handleDeleteCompleted = async (ids) => {
    if (!ids?.length) return;
    if (!window.confirm(`완료된 ${ids.length}건을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
    const idSet = new Set(ids);
    const before = analyses;
    setAnalyses(prev => prev.filter(a => !idSet.has(a.id)));
    if (idSet.has(selected)) setSelected(null);
    const { error } = await sb.from('analyses').delete().in('id', ids);
    if (error) { setAnalyses(before); notify('삭제 실패 — 다시 시도해 주세요'); }
  };

  // ── 전체 삭제 (본인 등록분만) ─────────────────────────────────
  const handleDeleteAll = async () => {
    if (!window.confirm(`전체 ${analyses.length}건을 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
    const before = analyses;
    setAnalyses([]);
    setSelected(null);
    const { error } = await sb.from('analyses').delete().eq('created_by', user.nickname);
    if (error) { setAnalyses(before); notify('전체 삭제 실패 — 다시 시도해 주세요'); }
  };

  const selectedAnalysis = analyses.find(a => a.id === selected) ?? null;
  const selectedChecks   = selected ? (checks[selected] ?? {}) : {};
  const selectedStars    = selected ? (stars[selected]  ?? {}) : {};

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-100">
      <ToastHost />
      {/* ── 상단 헤더 ── */}
      <header className="flex items-center justify-between px-3 md:px-5 py-2 md:py-3 bg-white/95 backdrop-blur border-b border-slate-200 flex-shrink-0 shadow-sm">
        {/* 제목은 일반 텍스트 — 버튼이면 바로 아래 '← 목록' 과 겹쳐 오터치가 남 */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-lg md:text-xl">📦</span>
          <span className="font-bold tracking-tight text-slate-800 text-sm md:text-base truncate">
            진열로케이션정리
          </span>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {/* 공용 메모장 (아이콘만) */}
          <button
            onClick={() => setShowMemo(true)}
            title="공용 메모장 열기"
            aria-label="공용 메모장 열기"
            className="w-9 h-9 flex items-center justify-center bg-amber-50 hover:bg-amber-100
                       border border-amber-200 rounded-lg transition-colors flex-shrink-0 text-base"
          >
            📝
          </button>
          <button
            onClick={() => setShowPaste(true)}
            className="px-3 md:px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs md:text-sm font-medium
                       rounded-lg transition-colors flex items-center gap-1 shadow-sm flex-shrink-0"
          >
            <span>+</span> 붙여넣기
          </button>
          {/* 빌드시각 + 확장 다운로드: 배포 확인용 / PC 전용, 눈에 띄지 않게 */}
          <span className="hidden sm:flex items-center gap-2 text-[10px] text-slate-300">
            <span className="font-mono" title="배포 빌드 시각">{BUILD_LABEL}</span>
            <a
              href={`${import.meta.env.BASE_URL}extension.zip`}
              download
              className="hover:text-blue-500 transition-colors"
              title="크롬 확장 내려받기 — 압축을 풀고 chrome://extensions 에서 '압축해제된 확장 프로그램을 로드'"
            >
              확장
            </a>
          </span>
          <span className="hidden sm:inline text-sm text-slate-500">
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
            onSelect={id => { setSelected(id); setDeletedNotice(false); }}
            onDelete={handleDelete}
            onDeleteAll={handleDeleteAll}
            onDeleteCompleted={handleDeleteCompleted}
            loading={loadingInit}
            loadError={loadError}
            onRetry={loadAll}
            search={search}
            onSearchChange={setSearch}
          />
        </div>
        {/* 모바일: 선택 있을 때만 표시 / 데스크탑: 항상 표시 */}
        <div className={`flex-1 min-w-0 flex flex-col relative ${selected == null ? 'hidden md:flex' : ''}`}>
          {/* 타 기기 삭제 알림 토스트 */}
          {deletedNotice && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2
                            bg-amber-50 border border-amber-300 text-amber-800 text-xs
                            px-4 py-2.5 rounded-full shadow-md whitespace-nowrap">
              <span>⚠️ 다른 기기에서 해당 오류보고가 삭제되었습니다.</span>
              <button
                onClick={() => setDeletedNotice(false)}
                className="ml-1 text-amber-500 hover:text-amber-700 font-bold"
              >✕</button>
            </div>
          )}
          <ErrorBoundary key={selected}>
            <DetailPanel
              key={selected}
              analysis={selectedAnalysis}
              checks={selectedChecks}
              onCheck={handleCheck}
              onUncheck={handleUncheck}
              stars={selectedStars}
              onStarToggle={handleStarToggle}
              user={user}
              onBack={() => setSelected(null)}
              memo={selectedAnalysis ? (toteMemos[selectedAnalysis.tote_id] ?? null) : null}
              onMemoSave={handleMemoSave}
              onMemoDelete={handleMemoDelete}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* ── 붙여넣기 모달 ── */}
      {showPaste && (
        <PasteModal
          user={user}
          existingReportIds={analyses.map(a => a.report_id)}
          initialText={pasteSeed}
          onClose={() => { setShowPaste(false); setPasteSeed(''); }}
          onSaved={() => { setShowPaste(false); setPasteSeed(''); loadAll(); }}
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
