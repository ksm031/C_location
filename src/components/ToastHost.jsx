import { useState, useEffect } from 'react';
import { subscribe } from '../lib/toast';

/** 화면 하단 알림. Layout 에서 한 번만 렌더한다. */
export default function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => subscribe(t => {
    setToasts(prev => [...prev, t]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4000);
  }), []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2
                    w-[min(92vw,26rem)] pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
          className={`pointer-events-auto cursor-pointer px-4 py-2.5 rounded-xl shadow-lg text-sm
                      flex items-start gap-2 animate-[fadeIn_.15s_ease-out]
            ${t.type === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-slate-800 text-slate-100'}`}
        >
          <span className="flex-shrink-0">{t.type === 'error' ? '⚠' : 'ℹ'}</span>
          <span className="flex-1 leading-snug">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
