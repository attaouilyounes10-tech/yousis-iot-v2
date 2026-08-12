// ============================================================
// YOUXIS IOT — Page d'inscription
// ============================================================
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-8">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee]" />
          <h1 className="text-2xl font-bold">
            YOUXIS <span className="text-cyan-400">IOT</span>
          </h1>
        </div>
        <h2 className="mb-4 text-lg font-semibold">Créer un compte</h2>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email" required placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
          <input
            type="password" required placeholder="Mot de passe (6 caractères min)" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit" disabled={busy}
            className="w-full rounded-lg bg-cyan-500 py-2 font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            {busy ? '…' : "S'inscrire"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          Déjà un compte ?{' '}
          <Link to="/login" className="text-cyan-400 hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}