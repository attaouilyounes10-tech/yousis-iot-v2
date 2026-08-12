// ============================================================
// YOUXIS IOT — Données en temps réel (WebSocket)
// Fournit via un contexte :
//   liveData     : dsId -> { value, createdAt }  (maj par data:update)
//   alerts       : dernières alertes (seuil dépassé)
//   deviceStatus : deviceId -> true/false (en ligne/hors ligne)
// ============================================================
import { createContext, useContext, useEffect, useState } from 'react';
import { connectSocket } from '../lib/socket.js';

const LiveContext = createContext(null);

export function LiveDataProvider({ token, children }) {
  const [liveData, setLiveData] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState({});

  useEffect(() => {
    if (!token) return undefined;

    const socket = connectSocket(token);

    socket.on('data:update', (p) => {
      setLiveData((prev) => ({ ...prev, [p.datastreamId]: { value: p.value, createdAt: p.createdAt } }));
    });
    socket.on('command:update', (p) => {
      setLiveData((prev) => ({ ...prev, [p.datastreamId]: { value: p.value, createdAt: p.createdAt } }));
    });
    socket.on('alert', (a) => {
      const alertObj = { ...a, id: a.datastreamId + '-' + Date.now() };
      setAlerts((prev) => [...prev.slice(-4), alertObj]);
      setTimeout(() => setAlerts((prev) => prev.filter((x) => x.id !== alertObj.id)), 8000);
    });
    socket.on('device:status', (s) => {
      setDeviceStatus((prev) => ({ ...prev, [s.deviceId]: s.online }));
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  return <LiveContext.Provider value={{ liveData, alerts, deviceStatus }}>{children}</LiveContext.Provider>;
}

export const useLiveData = () => useContext(LiveContext);