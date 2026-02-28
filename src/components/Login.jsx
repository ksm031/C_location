import { useState } from 'react';

export default function Login({ onLogin }) {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) { setError('닉네임을 입력하세요.'); return; }
    if (trimmed.length > 20) { setError('닉네임은 20자 이내로 입력하세요.'); return; }
    onLogin(trimmed);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 md:p-10 w-full max-w-sm">
        <div className="text-center mb-7">
          <div className="text-4xl mb-3">📦</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">PS 업무 보조 도구</h1>
          <p className="text-sm text-slate-500 mt-1.5">진열 오류보고 로케이션 체크</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              닉네임
            </label>
            <input
              type="text"
              value={nickname}
              onChange={e => { setNickname(e.target.value); setError(''); }}
              placeholder="이름 또는 사번 입력"
              autoFocus
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm transition
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="mt-1 min-h-[20px]">
              {error ? (
                <p className="text-xs text-red-500">{error}</p>
              ) : (
                <p className="text-xs text-slate-400">최대 20자까지 입력할 수 있어요.</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium
                       rounded-lg text-sm transition-colors"
          >
            시작하기
          </button>
        </form>
      </div>
    </div>
  );
}
