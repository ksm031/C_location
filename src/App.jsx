import { useState, useEffect } from 'react';
import Login from './components/Login';
import Layout from './components/Layout';

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('ps_user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch {}
    }
  }, []);

  const handleLogin = (nickname) => {
    const u = { nickname };
    localStorage.setItem('ps_user', JSON.stringify(u));
    setUser(u);
  };

  const handleLogout = () => {
    localStorage.removeItem('ps_user');
    setUser(null);
  };

  if (!user) return <Login onLogin={handleLogin} />;
  return <Layout user={user} onLogout={handleLogout} />;
}
