// ============================================================
// YOUXIS IOT — Mise en page générale (barre de navigation)
// Mode sécurisé : affichage d'utilisateur connecté + logout.
// ============================================================
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import AlertsBanner from './AlertsBanner.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function Layout() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  // Bouton Déconnexion visible uniquement si connecté
  const loginBtn = (
    <NavLink
      to="/login"
      end
      className="px-3 py-2 rounded-xl text-sm font-medium transition-colors text-slate-300 hover:bg-slate-800"
    >
      🔐 Connexion
    </NavLink>
  );

  const logoutBtn = (
    <button
      onClick={() => {
        logout();
        navigate('/', { replace: true });
      }}
      className="px-3 py-2 rounded-xl text-sm font-medium transition-colors bg-red-600 text-white hover:bg-red-500"
    >
      🚪 Déconnexion
    </button>
  );

  // Si connecté, montrer l'email + logout; sinon login
  const userArea = token ? (
    <>
      <span className="text-sm text-slate-300">
        Bienvenue, {user.email || user.id}
      </span>
      {logoutBtn}
    </>
  ) : (
    loginBtn
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur px-4 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee]" />
            <h1 className="text-lg font-bold tracking-wide sm:text-xl">
              YOUXIS <span className="text-cyan-400">IOT</span>
            </h1>
          </div>
          <nav className="flex flex-wrap items-center gap-1.5">
            {/* Toujours visible, accès au contenu */}
            <NavLink to="/feu" className="px-3 py-2 rounded-xl text-sm font-medium transition-colors text-slate-300 hover:bg-slate-800">
              🚦 Feu
            </NavLink>
            <NavLink to="/cycles" className="px-3 py-2 rounded-xl text-sm font-medium transition-colors text-slate-300 hover:bg-slate-800">
              📈 Cycles
            </NavLink>
            <NavLink to="/montage" className="px-3 py-2 rounded-xl text-sm font-medium transition-colors text-slate-300 hover:bg-slate-800">
              🔧 Montage
            </NavLink>
            <NavLink to="/devices" className="px-3 py-2 rounded-xl text-sm font-medium transition-colors text-slate-300 hover:bg-slate-800">
              Devices
            </NavLink>
          </nav>
          <div className="flex items-center gap-2">
            {userArea}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        <AlertsBanner />
        <Outlet />
      </main>
    </div>
  );
}