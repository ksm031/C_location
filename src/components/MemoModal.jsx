import { useState, useEffect, useRef } from 'react';
import { sb } from '../lib/supabase';

export default function MemoModal({ user, onClose }) {
  const [memos, setMemos]     = useState([]);
  const [text, setText]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);
  const textareaRef           = useRef(null);

  // 메모 목록 불러오기
  const loadMemos = async () => {
    const { data, error } = await sb
      .from('memos')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setMemos(data);
    setLoading(false);
  };

  useEffect(() => {
    loadMemos();
    // Realtime 구독
    const ch = sb.channel('memos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memos' }, loadMemos)
      .subscribe();
    return () => sb.removeChannel(ch);
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // ESC 닫기
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    await sb.from('memos').insert({ content: trimmed, created_by: user.nickname });
    setText('');
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('이 메모를 삭제할까요?')) return;
    await sb.from('memos').delete().eq('id', id);
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${mi}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <span className="font-bold text-slate-800 flex items-center gap-2">
            <span>📝</span> 공유 메모장
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 입력 영역 */}
        <div className="px-5 pt-4 pb-3 flex-shrink-0 border-b border-slate-100">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="메모를 입력하세요..."
            rows={4}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800
                       resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder-slate-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-400">Ctrl+Enter 로 저장</span>
            <button
              onClick={handleSave}
              disabled={saving || !text.trim()}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40
                         text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>

        {/* 메모 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {loading && (
            <p className="text-sm text-slate-400 text-center py-6">불러오는 중…</p>
          )}
          {!loading && memos.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">저장된 메모가 없습니다.</p>
          )}
          {memos.map((m) => (
            <div
              key={m.id}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 group"
            >
              <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{m.content}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-slate-400">
                  {m.created_by} · {formatDate(m.created_at)}
                </span>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100
                             transition-all"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
