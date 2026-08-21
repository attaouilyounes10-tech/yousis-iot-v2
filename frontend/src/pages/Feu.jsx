// ============================================================
// YOUXIS IOT — Page « Feu » (visionnage seul, façon Wokwi/simulation)
// ------------------------------------------------------------
// Affiche en temps réel l'état du feu tricolore et de la distance, sans
// aucune commande. Les commandes vivent dans « Tableau de bord ».
//   - feu      0 = vert | 1 = orange | 2 = rouge | 3 = maintenance
//   - distance (cm), pedestrian (0/1), compteur_pietons
// La logique est côté DEVICE (simulateur Python ou vrai ESP32).
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useLiveData } from '../hooks/useLiveData.jsx';
import { fmtTime, fmtValue } from '../lib/format.js';
import {
  SEUIL_DEFAUT, FEU_INFO, Lamp, toneCls, copierSansBug, btn,
} from '../lib/feu.jsx';
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function Feu() {
  const { liveData, deviceStatus } = useLiveData() || {};

  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [events, setEvents] = useState([]);
  const [distHistory, setDistHistory] = useState([]);
  const prev = useRef({});
  const prevMode = useRef(undefined);

  // ---- Chargement : devices + leurs datastreams (pour mapper clé → id) ----
  async function load() {
    try {
      const list = await api.getDevices();
      const details = await Promise.all(list.map((d) => api.getDevice(d.id).catch(() => null)));
      const enriched = list.map((d, i) => {
        const dss = details[i]?.datastreams || [];
        const byKey = {};
        for (const ds of dss) byKey[ds.key] = ds.id;
        return { ...d, datastreams: dss, byKey, hasFeu: 'distance' in byKey && 'feu' in byKey };
      });
      setDevices(enriched);

      const feuOnes = enriched.filter((d) => d.hasFeu);
      const saved = localStorage.getItem('yousis_feu_device');
      if (saved && feuOnes.some((d) => String(d.id) === saved)) setSelectedId(String(saved));
      else if (feuOnes.length) setSelectedId(String(feuOnes[0].id));
      else setSelectedId('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  const device = devices.find((d) => String(d.id) === selectedId) || null;
  const byKey = device?.byKey || {};
  const online =
    device && deviceStatus ? (selectedId in deviceStatus ? deviceStatus[selectedId] : device.online) : null;

  // ---- Valeurs en direct (WebSocket) ----
  const dist = liveData?.[byKey.distance];
  const ped = liveData?.[byKey.pedestrian];
  const feu = liveData?.[byKey.feu];
  const compteur = liveData?.[byKey.compteur_pietons];
  const feuVal = feu ? feu.value : undefined;
  const distVal = dist ? dist.value : undefined;
  const pedVal = ped ? ped.value : undefined;
  const lastAt = feu?.createdAt || dist?.createdAt;

  // ---- Historique distance au changement de device ----
  useEffect(() => {
    if (!device?.token) return undefined;
    let annule = false;
    api.getLatest(device.token)
      .then((l) => {
        if (annule || !byKey.distance) return;
        return api.getHistory(byKey.distance, 60).catch(() => []);
      })
      .then((hist) => {
        if (!annule && hist) setDistHistory(hist.map((p) => ({ createdAt: p.createdAt, value: p.value })));
      })
      .catch(() => {});
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id, byKey.distance]);

  // ---- Graphique distance : on ajoute chaque point reçu en direct ----
  useEffect(() => {
    const d = liveData?.[byKey.distance];
    if (!device || !d) return;
    setDistHistory((h) => [...h, { createdAt: d.createdAt, value: d.value }].slice(-60));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData?.[byKey.distance]?.value, byKey.distance, device?.id]);

  // ---- Journal : changement d'état du feu ----
  function addEvent(msg, tone) {
    setEvents((ev) => [{ time: fmtTime(Date.now()), msg, tone }, ...ev].slice(0, 20));
  }

  useEffect(() => {
    const was = prev.current;
    if (feuVal !== undefined && was.f !== undefined && feuVal !== was.f) {
      addEvent(FEU_INFO[feuVal] ? `🚦 ${FEU_INFO[feuVal].label}` : `État du feu : ${feuVal}`,
        feuVal === 3 ? 'maint' : feuVal === 2 ? 'rouge' : feuVal === 1 ? 'orange' : 'vert');
    }
    if (pedVal !== undefined && was.p !== undefined && pedVal !== was.p) {
      if (pedVal === 1) addEvent(`🚸 Piéton détecté — distance ${fmtValue(distVal)} cm`, 'danger');
      else addEvent('✓ Passage libre — aucun piéton', 'ok');
    }
    prev.current = { f: feuVal, p: pedVal, d: distVal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feuVal, pedVal, distVal]);

  // ---- Journal : changement de mode système ----
  useEffect(() => {
    const m = liveData?.[byKey.mode]?.value;
    if (m !== undefined && prevMode.current !== undefined && m !== prevMode.current) {
      const lbl = { 0: 'Auto', 1: 'Vert forcé', 2: 'Rouge forcé', 3: 'Maintenance' }[m] || String(m);
      addEvent(`🕹️ Mode : ${lbl}`, m === 3 ? 'maint' : m === 2 ? 'rouge' : m === 1 ? 'vert' : 'ok');
    }
    prevMode.current = m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData?.[byKey.mode]?.value, byKey.mode]);

  const info = feuVal !== undefined ? FEU_INFO[feuVal] : null;
  const carLamp = info ? info.lamp : null;
  const pedLightGreen = carLamp === 'rouge' || carLamp === 'maintenance';
  const modeActif = liveData?.[byKey.mode]?.value;
  const distPoints = distHistory.map((p) => ({ t: p.createdAt, v: p.value }));
  const NB_MAX = 60;

  // Modes du feu (sélecteur regroupé dans le panneau « Commandes »)
  const MODES = [
    { v: 0, label: 'Auto',        active: 'bg-cyan-500 text-slate-950 shadow-[0_0_0_2px_rgba(6,182,212,0.4)]',         idle: 'bg-slate-800 text-slate-300 hover:bg-slate-700' },
    { v: 1, label: 'Vert forcé',  active: 'bg-emerald-500 text-slate-950 shadow-[0_0_0_2px_rgba(16,185,129,0.4)]',     idle: 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-400/30' },
    { v: 2, label: 'Rouge forcé', active: 'bg-red-500 text-slate-950 shadow-[0_0_0_2px_rgba(239,68,68,0.4)]',         idle: 'bg-red-500/15 text-red-300 hover:bg-red-400/30' },
    { v: 3, label: 'Maintenance', active: 'bg-amber-500 text-slate-950 shadow-[0_0_0_2px_rgba(245,158,11,0.4)]',      idle: 'bg-amber-500/15 text-amber-300 hover:bg-amber-400/30' },
  ];
  const tileCard = 'rounded-3xl border border-slate-800 bg-slate-900/70 p-6';
  const tileTitle = 'flex items-center gap-2 font-semibold';
  const miniLabel = 'text-[11px] uppercase tracking-wider text-slate-500';

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">🚦 Feu intelligent</h2>
        {online !== null && (
          <span className={'rounded-full px-3 py-1 text-xs font-semibold ' +
            (online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500')}>
            {online ? '● en ligne' : '○ hors ligne'}
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {!device && (
        <div className="rounded-3xl border border-dashed border-slate-700 p-10 text-center">
          <p className="mb-1 text-3xl">🚦</p>
          <p className="font-semibold">Aucun device « Feu intelligent » trouvé.</p>
          <p className="mt-1 text-sm text-slate-400">
            Créez-le depuis l'onglet <span className="text-cyan-300">📱 Devices</span> (type « esp32 » puis ajoutez les datastreams du feu).
          </p>
        </div>
      )}

      {device && !device.hasFeu && (
        <div className="rounded-3xl border border-dashed border-slate-700 p-10 text-center">
          <p className="font-semibold">Le device « {device.name} » n’a pas encore les datastreams du feu.</p>
        </div>
      )}

      {device && device.hasFeu && (
        <div>
          {/* Sélecteur de device + token */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="min-w-[220px]">
              <label className="mb-1 block text-xs text-slate-400">Device feu</label>
              <select
                value={selectedId}
                onChange={(e) => { localStorage.setItem('yousis_feu_device', e.target.value); setSelectedId(e.target.value); }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              >
                {devices.filter((d) => d.hasFeu).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[220px]">
              <label className="mb-1 block text-xs text-slate-400">Token (simulateur / ESP32)</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-xl bg-slate-950 px-3 py-2 text-sm text-cyan-300">{device.token}</code>
                <button
                  onClick={() => copierSansBug(device.token, setCopied)}
                  className={`${btn} bg-slate-800 hover:bg-slate-700`}
                >
                  {copied ? '✓ Copié' : 'Copier'}
                </button>
              </div>
            </div>
          </div>

          {/* Ligne 1 : feux + distance */}
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Feux tricolores */}
            <div className={tileCard}>
              <h3 className={tileTitle}>🚦 Feu</h3>
              <div className="mt-4 flex items-start justify-center gap-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="mb-3 text-center text-[10px] font-semibold tracking-widest text-slate-500">VOITURES</p>
                  <div className="flex flex-col items-center gap-3">
                    <Lamp on={carLamp === 'rouge'} color="rouge" />
                    <Lamp on={carLamp === 'orange'} color="orange" />
                    <Lamp on={carLamp === 'vert'} color="vert" />
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="mb-3 text-center text-[10px] font-semibold tracking-widest text-slate-500">PIÉTONS</p>
                  <div className="flex flex-col items-center gap-3">
                    <Lamp on={!pedLightGreen && carLamp !== null} color="rouge" icon="🚷" />
                    <Lamp on={pedLightGreen} color="vert" icon="🚸" />
                  </div>
                </div>
              </div>
              {info ? (
                <p className={`mt-4 text-center text-base font-semibold ${info.cls}`}>{info.label}</p>
              ) : (
                <p className="mt-4 text-center text-sm text-slate-500">En attente de données du capteur…</p>
              )}
              {modeActif !== undefined && modeActif !== 0 && (
                <p className="mt-1 text-center text-xs text-slate-500">
                  Mode : {['Auto', 'Vert forcé', 'Rouge forcé', 'Maintenance'][modeActif] || modeActif}
                </p>
              )}
            </div>

            {/* Distance */}
            <div className={`${tileCard} lg:col-span-2`}>
              <div className="flex items-center justify-between">
                <h3 className={tileTitle}>📏 Distance piéton</h3>
                <span className="text-xs text-slate-500">MAJ {fmtTime(lastAt)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <p className="text-5xl font-black text-cyan-300">
                  {fmtValue(distVal)} <span className="text-xl font-normal text-slate-400">cm</span>
                </p>
                {pedVal === 1 ? (
                  <span className="rounded-full bg-red-500/15 px-3 py-1 text-sm font-semibold text-red-300">🚸 Piéton détecté</span>
                ) : pedVal === 0 ? (
                  <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-300">✓ Passage libre</span>
                ) : (
                  <span className="text-sm text-slate-500">En attente…</span>
                )}
              </div>
              <div className="mt-3 h-40 w-full">
                {distPoints.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={distPoints.slice(-NB_MAX)} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <XAxis dataKey="t" tickFormatter={(t) => fmtTime(t)} tick={{ fontSize: 10, fill: '#64748b' }} stroke="#1e293b" minTickGap={40} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} stroke="#1e293b" width={34} domain={[0, 'dataMax + 20']} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }}
                        labelFormatter={(t) => fmtTime(t)}
                        formatter={(v) => [`${fmtValue(v)} cm`, 'Distance']}
                      />
                      <ReferenceLine y={SEUIL_DEFAUT} stroke="#ef4444" strokeDasharray="5 4"
                        label={{ value: `Seuil ${SEUIL_DEFAUT} cm`, position: 'insideTopRight', fill: '#f87171', fontSize: 10 }} />
                      <Line type="monotone" dataKey="v" stroke="#22d3ee" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-500">En attente de l’historique… (le simulateur doit tourner)</p>
                )}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Seuil de détection piéton : <span className="text-slate-300">{SEUIL_DEFAUT} cm</span>.
              </p>
            </div>
          </div>

          {/* Ligne 2 : compteur (pleine largeur) */}
          <div className="mt-5">
            <div className={`${tileCard} lg:col-span-3`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">🚶</span>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Passages piétons comptabilisés</p>
                    <p className="text-3xl font-black text-cyan-300">{compteur ? compteur.value : 0}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500">Compté côté device, affiché en temps réel</span>
              </div>
            </div>
          </div>

          {/* Ligne 3 : journal (60%) + commandes (40%), pleine largeur */}
          <div className="mt-5 grid gap-5 lg:grid-cols-5">
            {/* Journal d'état — 3/5 */}
            <div className={`${tileCard} lg:col-span-3`}>
              <h3 className={tileTitle}>📋 État actuel &amp; journal</h3>
              <div className="mt-3 text-sm text-slate-400">
                {info ? (
                  <span className={`text-lg font-semibold ${info.cls}`}>{info.label}</span>
                ) : (
                  <span className="text-slate-500">En attente de données du capteur…</span>
                )}
              </div>
              <div className="mt-5">
                <ul className="max-h-80 space-y-2 overflow-y-auto pr-2">
                  {events.length === 0 ? (
                    <p className="text-sm text-slate-500">En attente d’événements…</p>
                  ) : (
                    events.map((ev, i) => (
                      <li key={i} className="flex items-start gap-3 rounded-lg bg-slate-950/40 px-3 py-2 text-sm">
                        <span className="shrink-0 font-mono text-[11px] text-slate-500">{ev.time}</span>
                        <span className={`mt-px h-2 w-2 shrink-0 translate-y-1.5 rounded-full ${
                          (toneCls[ev.tone] || 'text-emerald-300').includes('red') ? 'bg-red-400'
                          : (toneCls[ev.tone] || '').includes('amber') ? 'bg-amber-400'
                          : (toneCls[ev.tone] || '').includes('cyan') ? 'bg-cyan-400'
                          : 'bg-emerald-400'
                        }`} />
                        <span className={toneCls[ev.tone] || 'text-emerald-300'}>{ev.msg}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            {/* Panneau de commandes — 2/5 */}
            <div className={`${tileCard} lg:col-span-2`}>
              <h3 className={tileTitle}>🎛️ Commandes du feu</h3>

              {/* Sélecteur de mode */}
              <p className="mt-5 mb-2 text-[11px] uppercase tracking-wider text-slate-500">Mode du système</p>
              <div className="grid grid-cols-2 gap-2">
                {MODES.map((m) => {
                  const isActive = modeActif === m.v;
                  return (
                    <button
                      key={m.v}
                      onClick={() => selectedId && api.setMode(selectedId, m.v)}
                      className={`rounded-xl px-3 py-3 text-sm font-semibold transition-all duration-150 ${
                        isActive ? m.active : m.idle
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                {modeActif === 0
                  ? 'Auto : le feu réagit seul aux piétons détectés.'
                  : modeActif === 1
                  ? 'Vert forcé : le feu reste vert, les piétons attendent.'
                  : modeActif === 2
                  ? 'Rouge forcé : le feu reste rouge, circulation coupée.'
                  : 'Maintenance : feu figé, circulation coupée.'}
              </p>

              {/* Bouton piéton */}
              <div className="mt-6 border-t border-slate-800 pt-5">
                <p className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Demande de passage</p>
                {modeActif === 0 ? (
                  <button
                    onClick={() => selectedId && api.requestPedestrianCrossing(selectedId)}
                    className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 transition-all duration-150 hover:from-cyan-500 hover:to-cyan-400 active:scale-[0.98]"
                  >
                    <span className="text-lg">🚸</span> Demander passage piéton
                  </button>
                ) : (
                  <button
                    disabled
                    className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-3.5 text-sm font-semibold text-slate-500"
                  >
                    <span className="text-lg opacity-60">🚸</span> Indisponible (mode actif)
                    </button>
                  )}
                </div>
              </div>
            </div>
        </div>
      )}
    </div>
  );
}
