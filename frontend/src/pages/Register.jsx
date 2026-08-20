// ============================================================
// YOUXIS IOT — Page d'inscription (mode sécurisé)
// Affiche un formulaire email+mdp. Envoie vers /api/auth/register.
// Si succès, connexion automatique et redirection vers l'accueil.
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await register(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Erreur d\'inscription');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 flex items-center justify-center">
      <div className="bg-slate-800 rounded-xl p-6 sm:p-8 max-w-md w-full shadow-2xl">
        <h2 className="text-2xl font-bold text-center mb-6">📝 Inscription</h2>
        {error && <p className="text-red-400 text-sm mb-4 center-text">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              className="w-full px-3 py-2 rounded border border-slate-600 bg-slate-900 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Mot de passe</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              className="w-full px-3 py-2 rounded border border-slate-600 bg-slate-900 text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 rounded bg-cyan-600 text-white font-medium hover:bg-cyan-500 transition-colors"
          >
            S'inscrire
          </button>
          <p className="text-center text-sm mt-4 text-slate-500">
            Vous avez déjà un compte ?
            <a href="/login" className="underline text-cyan-300 font-medium">Connectez-vous</a>
          </p>
        </form>
      </div>
    </div>
  );
}