import { useState, useEffect, useRef } from 'react';

export default function ToteMemoModal({ toteId, onClose }) {
  const key = `tote_memo_${toteId}`;
  const [text, setText] = useState(() => localStorage.getItem(key) ?? '');
  const textareaRef = useRef(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleSave = () => {
    const trimmed = text.trim();
    if (trimmed) localStorage.setItem(key, trimmed);
    else localStorage.removeItem(key);
    onClose(!!trimmed);
  };

  const handleDelete = () => {
    localStorage.removeItem(key);
    onClose(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose(null);
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={() => onClose(null)}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:w-80 p-4 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-bold text-slate-700 truncate">{toteId}</span>
          <button
            onClick={() => onClose(null)}
            className="text-slate-400 hover:text-slate-600 leading-none text-lg w-7 h-7 flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메모를 입력하세요"
          rows={4}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none
                     focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />
        <div className="flex items-center justify-between">
          {localStorage.getItem(key) ? (
            <button
              onClick={handleDelete}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              메모 삭제
            </button>
          ) : <span />}
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
