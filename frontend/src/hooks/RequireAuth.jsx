// ============================================================
// YOUXIS IOT — Garde de route RequireAuth
// Redirige vers /login si l'utilisateur n'est pas connecté (pas de token).
// Utilisation : <RequireAuth> wrapping une route, ou <Route element={<RequireAuth />}>.
// ============================================================
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export function RequireAuth({ children }) {
  const { token, user } = useAuth();
  const location = useLocation();

  // Si pas de token, rediriger vers login en préservant l'URL courante
  // comme "next" en query string (optionnel, pour mémoire)
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Si connecté et qu'on essaie d'accéder à login/register, aller à l'accueil
  if ((location.pathname === '/login' || location.pathname === '/register') && user) {
    return <Navigate to="/" replace />;
  }

  return children;
}