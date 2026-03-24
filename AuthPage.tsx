import React, { useState } from 'react';
import { apiLogin, apiRegister, setAuth } from './api';

type Props = { onAuth: (user: { id: string; name: string; email: string }) => void };

const AuthPage = ({ onAuth }: Props) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = mode === 'login'
        ? await apiLogin(email, password)
        : await apiRegister(name, email, password);

      if (res.token) {
        setAuth(res.token, res.user);
        onAuth(res.user);
      } else {
        setError(res.message || 'Erreur inattendue.');
      }
    } catch {
      setError('Connexion au serveur impossible.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">SPENDWISE</h1>
          <p className="text-zinc-500 font-medium mt-2">Intelligence Financière Augmentée</p>
        </div>

        {/* Card */}
        <div className="bg-[#0c0c0c] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl">
          {/* Tab toggle */}
          <div className="flex bg-[#080808] p-2 rounded-2xl border border-white/5 mb-8">
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all ${mode === m ? 'bg-zinc-800 text-white shadow-xl' : 'text-zinc-600 hover:text-zinc-400'}`}
              >
                {m === 'login' ? 'Connexion' : 'Inscription'}
              </button>
            ))}
          </div>

          <form onSubmit={handle} className="space-y-5">
            {mode === 'register' && (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Nom complet</label>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)} required
                  className="w-full bg-[#121212] border border-white/5 rounded-2xl p-4 text-white focus:border-emerald-500/50 outline-none transition-all font-bold"
                  placeholder="Jean Dupont"
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full bg-[#121212] border border-white/5 rounded-2xl p-4 text-white focus:border-emerald-500/50 outline-none transition-all font-bold"
                placeholder="jean@exemple.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Mot de passe</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className="w-full bg-[#121212] border border-white/5 rounded-2xl p-4 text-white focus:border-emerald-500/50 outline-none transition-all font-bold"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs font-bold text-center bg-red-500/10 border border-red-500/20 rounded-xl p-3">{error}</p>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-2xl transition-all shadow-xl shadow-emerald-600/10 uppercase tracking-[0.3em] text-xs mt-2"
            >
              {loading ? 'Chargement...' : mode === 'login' ? 'Accéder au Terminal' : 'Créer mon compte'}
            </button>
          </form>
        </div>

        <p className="text-center text-zinc-700 text-xs mt-6 font-bold">
          SpendWise © 2024 — Intelligence Financière Sécurisée
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
