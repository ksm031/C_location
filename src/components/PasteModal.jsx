import { useState } from 'react';
import { parseText, reasonLabel } from '../lib/parser';
import { sb } from '../lib/supabase';

export default function PasteModal({ user, onClose, onSaved }) {
  const [text, setText]         = useState('');
  const [parsed, setParsed]     = useState(null);   // { reports, errors }
  const [saving, setSaving]     = useState(false);
  const [saveResult, setSaveResult] = useState(null); // { saved, skipped }
  const [step, setStep]         = useState('paste'); // 'paste' | 'preview' | 'done'

  // ── 파싱 ───────────────────────────────────────────────────────
  const handleParse = () => {
    if (!text.trim()) return;
    const result = parseText(text);
    setParsed(result);
    setStep('preview');
  };

  // ── 저장 ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!parsed?.reports?.length) return;
    setSaving(true);

    let saved = 0, skipped = 0;
    for (const r of parsed.reports) {
      const payload = {
        report_id:   r.report_id,
        reported_at: r.reported_at ? new Date(r.reported_at).toISOString() : null,
        reason:      r.reason,
        tote_id:     r.tote_id,
        worker:      r.worker,
        sys_qty:     r.sys_qty,
        placed_qty:  r.placed_qty,
        tote_qty:    r.tote_qty,
        locations:   r.locations,
        created_by:  user.nickname,
      };

      const { error } = await sb
        .from('analyses')
        .insert(payload);

      if (error) {
        // 중복 report_id (unique constraint) → 스킵
        if (error.code === '23505') skipped++;
        else console.error('저장 오류:', error.message);
      } else {
        saved++;
      }
    }

    setSaving(false);
    setSaveResult({ saved, skipped });
    setStep('done');
    if (saved > 0) setTimeout(onSaved, 1200);
  };

  // ── 뒤로 ───────────────────────────────────────────────────────
  const handleBack = () => {
    setStep('paste');
    setParsed(null);
    setSaveResult(null);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-800">
            {step === 'paste'   && '오류보고 붙여넣기'}
            {step === 'preview' && `파싱 결과 확인 (${parsed?.reports?.length ?? 0}건)`}
            {step === 'done'    && '저장 완료'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* ── STEP 1: 붙여넣기 ── */}
        {step === 'paste' && (
          <>
            <div className="flex-1 overflow-hidden p-6 flex flex-col gap-3">
              <p className="text-sm text-slate-600">
                인트라넷 <strong>진열작업 오류보고 상세</strong> 페이지에서{' '}
                <kbd className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">Ctrl+A</kbd>{' '}
                →{' '}
                <kbd className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">Ctrl+C</kbd>{' '}
                후 아래에 붙여넣으세요.
                <br />
                <span className="text-xs text-slate-400">여러 보고서를 연속으로 붙여넣기 해도 됩니다.</span>
              </p>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                autoFocus
                placeholder="여기에 Ctrl+V로 붙여넣기..."
                className="flex-1 w-full border border-slate-200 rounded-xl p-4 text-sm font-mono
                           resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[280px]"
              />
              <p className="text-xs text-slate-400 text-right">{text.length.toLocaleString()}자</p>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                취소
              </button>
              <button
                onClick={handleParse}
                disabled={!text.trim()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
              >
                파싱하기
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: 프리뷰 ── */}
        {step === 'preview' && parsed && (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {/* 파싱 오류 */}
              {parsed.errors?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-red-700 mb-1">파싱 오류</p>
                  {parsed.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}

              {/* 파싱 결과 목록 */}
              {parsed.reports.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  <p>파싱된 데이터가 없습니다.</p>
                  <p className="text-xs mt-1">올바른 페이지에서 복사했는지 확인하세요.</p>
                </div>
              )}

              {parsed.reports.map((r, i) => (
                <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-800">{r.report_id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      r.reason === 'SHORTAGE' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {r.reason}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-600">
                    <span>진열자: {r.worker}</span>
                    <span>토트: {r.tote_id}</span>
                    <span>신고수량: {r.sys_qty}개</span>
                    <span>로케이션: {r.locations?.length ?? 0}개</span>
                  </div>
                  {r.locations?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.locations.map(l => (
                        <span key={l.location_code}
                          className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono">
                          {l.location_code}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={handleBack} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                ← 다시 붙여넣기
              </button>
              <button
                onClick={handleSave}
                disabled={saving || parsed.reports.length === 0}
                className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? '저장 중...' : `${parsed.reports.length}건 저장`}
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: 완료 ── */}
        {step === 'done' && saveResult && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 gap-4">
            <div className="text-5xl">✅</div>
            <p className="text-lg font-bold text-slate-800">저장 완료</p>
            <div className="text-sm text-slate-600 text-center space-y-1">
              {saveResult.saved > 0 && <p>새로 저장: <strong>{saveResult.saved}건</strong></p>}
              {saveResult.skipped > 0 && <p className="text-slate-400">이미 등록됨 (스킵): {saveResult.skipped}건</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
