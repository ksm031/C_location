import { useState, useEffect } from 'react';
import Login from './components/Login';
import Layout from './components/Layout';

const APP_PASSWORD = '0102';

export default function App() {
  const [auth, setAuth]     = useState(() => localStorage.getItem('app_auth') === 'ok');
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [user, setUser]     = useState(null);

  useEffect(() => {
    if (!auth) return;
    const saved = localStorage.getItem('ps_user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch {}
    }
  }, [auth]);

  const handlePwSubmit = (e) => {
    e.preventDefault();
    if (pwInput === APP_PASSWORD) {
      localStorage.setItem('app_auth', 'ok');
      setAuth(true);
    } else {
      setPwError(true);
      setPwInput('');
    }
  };

  const handleLogin = (nickname) => {
    const u = { nickname };
    localStorage.setItem('ps_user', JSON.stringify(u));
    setUser(u);
  };

  const handleLogout = () => {
    localStorage.removeItem('ps_user');
    setUser(null);
  };

  if (!auth) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <form onSubmit={handlePwSubmit} className="flex flex-col items-center gap-3">
          <input
            type="password"
            value={pwInput}
            onChange={e => { setPwInput(e.target.value); setPwError(false); }}
            placeholder="암호를 입력하세요"
            autoFocus
            className="border border-slate-300 rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-400"
          />
          {pwError && <p className="text-red-500 text-xs">암호가 틀렸습니다.</p>}
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
          >
            확인
          </button>
        </form>
      </div>
    );
  }

  if (!user) return <Login onLogin={handleLogin} />;
  return <Layout user={user} onLogout={handleLogout} />;
}
