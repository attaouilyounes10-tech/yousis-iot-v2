// ============================================================
// YOUXIS IOT — Données en temps réel (WebSocket)
// Fournit via un contexte :
//   liveData     : dsId -> { value, createdAt }  (maj par data:update)
//   alerts       : dernières alertes (seuil dépassé)
//   deviceStatus : deviceId -> true/false (en ligne/hors ligne)
// ============================================================
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { connectSocket } from '../lib/socket.js';

const LiveContext = createContext(null);

export function LiveDataProvider({ token, children }) {
  const [liveData, setLiveData] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState({});
  const [cycles, setCycles] = useState([]);
  // Signal incrémenté à chaque « Remettre à 0 » : les pages (Feu…) l'écoutent
  // pour vider leur historique local (graphe distance, journal…).
  const [resetSignal, setResetSignal] = useState(0);
  // Timestamp après lequel les nouvelles données seront acceptées à nouveau.
  // Initialisé à 0 = aucune restriction.
  const ignoreUntil = useRef(Date.now());

  useEffect(() => {
    // En mode « sans login », on se connecte sans token : le backend bascule
    // sur l'utilisateur public et diffuse les données de tous les devices.
    const socket = connectSocket(token);

    // Nettoyage précédent si le token a changé (nouveau socket)
    const prev = ignoreUntil.current;
    // On réinitialise le filtre : on acceptera les données dont createdAt > ignoreUntil
    const filterOld = (p) => p.createdAt > ignoreUntil.current;

    socket.on('data:update', (p) => {
      if (!filterOld(p)) return; // ignore les updates venues avant le reset
      setLiveData((prev) => ({ ...prev, [p.datastreamId]: { value: p.value, createdAt: p.createdAt } }));
    });
    socket.on('command:update', (p) => {
      if (!filterOld(p)) return;
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
    socket.on('cycle:new', (c) => {
      // c = { deviceId, etat, createdAt } — ajouté en tête pour la vue Cycles
      setCycles((prev) => [{ ...c }, ...prev].slice(0, 1000));
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  // Vide l'historique live des cycles (utilisé par « Remettre à 0 »)
  function clearCyclesLive() {
    setCycles([]);
  }

  // « Remettre à 0 » global : vide toutes les données live (compteur, état du
  // feu, distance, alertes, cycles). Ignore les futures données pendant 2 s
  // pour laisser le temps aux pages (Feu, Cycles) de vider leur état local
  // via resetSignal avant que de nouvelles données arrivent du device.
  function clearAll() {
    setLiveData({});
    setAlerts([]);
    setCycles([]);
    // On glisse le deadline dans le ref : les listeners le lisent en continu.
    // 2000 ms = 2 secondes d'ignorance pour éviter la course de réécriture.
    ignoreUntil.current = Date.now() + 2000;
    // En parallèle, on propage le signal aux pages qui l'écoutent
    setResetSignal((n) => n + 1);
  }

  return (
    <LiveContext.Provider value={{ liveData, alerts, deviceStatus, cycles, resetSignal, clearCyclesLive, clearAll }}>
      {children}
    </LiveContext.Provider>
  );
}

// Export du hook pour usage dans les pages
export const useLiveData = () => useContext(LiveContext);