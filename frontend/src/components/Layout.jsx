// ============================================================
// YOUXIS IOT — Mise en page générale (barre de navigation)
// ============================================================
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import AlertsBanner from './AlertsBanner.jsx';

export default function Layout() {
  const { user, logout } = useAuth();

  const linkCls = ({ isActive }) =>
    'px-3 py-2 rounded-xl text-sm font-medium transition-colors ' +
    (isActive ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-300 hover:bg-slate-800');

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
            <NavLink to="/tableau-bord" className={linkCls}>
              🚦 Tableau de bord
            </NavLink>
            <NavLink to="/" end className={linkCls}>
              Dashboard
            </NavLink>
            <NavLink to="/devices" className={linkCls}>
              Devices
            </NavLink>
            <span className="ml-1 hidden xl:block text-sm text-slate-500">{user?.email}</span>
            <button
              onClick={logout}
              className="ml-1 px-3 py-2 rounded-xl text-sm bg-slate-800 hover:bg-slate-700"
            >
              Se déconnecter
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        <AlertsBanner />
        <Outlet />
      </main>
    </div>
  );
}