// ============================================================
// YOUXIS IOT — Contexte d'authentification
// Le token JWT est conservé dans le localStorage.
// ============================================================
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setToken, setOnUnauthorized } from './api.js';

const AuthContext = createContext(null);

function readStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => localStorage.getItem('yousis_token'));
  const [user, setUser] = useState(() => readStored('yousis_user'));

  // Le client API connaît toujours le token courant (synchronisé à chaque changement)
  useEffect(() => {
    setToken(token);
  }, [token]);

  function storeSession(data) {
    localStorage.setItem('yousis_token', data.token);
    localStorage.setItem('yousis_user', JSON.stringify(data.user));
    setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
  }

  const login = useCallback(async (email, password) => {
    storeSession(await api.login({ email, password }));
  }, []);

  const register = useCallback(async (email, password) => {
    storeSession(await api.register({ email, password }));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('yousis_token');
    localStorage.removeItem('yousis_user');
    setToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  // Si le backend renvoie 401 (compte disparu après réinit de la base), on déconnecte.
  useState(() => {
    setOnUnauthorized(() => logout());
  });

  return <AuthContext.Provider value={{ token, user, login, register, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);