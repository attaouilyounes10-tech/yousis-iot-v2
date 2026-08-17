// ============================================================
// YOUXIS IOT — Page « Tableau de bord » (le feu intelligent, façon Blynk)
// ------------------------------------------------------------
// La logique du feu est côté DEVICE (simulateur Python ou vrai ESP32) :
//   → distance mesurée par le HC-SR04
//   → pedestrian = 1 si distance < seuil (piéton détecté)
//   → feu       0 = vert | 1 = orange | 2 = rouge  (feu des voitures)
//
// Ce tableau de bord, en plus d' AFFICHER (feux, distance en direct
// + mini graphique, journal), COMMANDE le device en temps réel :
//   - durée du vert (slider 1-30 s)     → datastream `duree_vert`
//   - mode Auto / Vert forcé / Rouge    → datastream `mode`
//   - bouton « Piéton » (passage manuel) → datastream `bouton_pieton`
// Les commandes partent via POST /devices/:id/commands ; le device les
// lit à chaque tour sur GET /devices/:token/latest.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useLiveData } from '../hooks/useLiveData.jsx';
import { fmtTime, fmtValue } from '../lib/format.js';
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Valeur affichée du seuil (correspond au --seuil par défaut du simulateur)
const SEUIL_DEFAUT = 80;

// Descriptif de chaque état du feu (voitures)
const FEU_INFO = {
  0: { label: 'Feu vert — les voitures roulent',     cls: 'text-emerald-300', lamp: 'vert' },
  1: { label: 'Feu orange — les voitures s’arrêtent', cls: 'text-amber-300',  lamp: 'orange' },
  2: { label: 'Feu rouge — le piéton traverse',      cls: 'text-red-300',     lamp: 'rouge' },
};

// Boutons du mode système (durée du vert et bouton piéton s'y ajoutent)
const MODE_BTNS = [
  { v: 0, label: 'Auto',        active: 'bg-cyan-500 text-slate-950' },
  { v: 1, label: 'Vert forcé',  active: 'bg-emerald-500 text-slate-950' },
  { v: 2, label: 'Rouge forcé', active: 'bg-red-500 text-slate-950' },
];

// Couleur du texte d'un événement du journal
const toneCls = {
  danger: 'text-red-300',
  rouge: 'text-red-300',
  orange: 'text-amber-300',
  ok: 'text-emerald-300',
  vert: 'text-emerald-300',
};

const btn = 'rounded-xl px-4 py-2 text-sm font-semibold transition-colors';

/** Copie du texte sans casser sur les connexions http:// (iPhone) : fallback execCommand. */
async function copierSansBug(text, setCopied) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  } catch (_) {
    /* ignore : la copie reste impossible sur cette origine */
  }
}

/** Une lampe de feu tricolore (allumée avec un halo, sinon éteinte). */
function Lamp({ on, color, icon }) {
  const colors = {
    rouge:  'border-red-400 bg-red-500 shadow-[0_0_26px_rgba(239,68,68,0.9)]',
    orange: 'border-amber-400 bg-amber-500 shadow-[0_0_26px_rgba(245,158,11,0.9)]',
    vert:   'border-emerald-400 bg-emerald-500 shadow-[0_0_26px_rgba(16,185,129,0.9)]',
  };
  const styled = 'flex h-14 w-14 items-center justify-center rounded-full border-2 text-xl transition-all duration-300 sm:h-16 sm:w-16 sm:text-2xl ' +
    (on ? colors[color] : 'border-slate-700 bg-slate-950 text-slate-700');
  return <div className={styled}>{on ? icon : ''}</div>;
}

export default function TableauDeBord() {
  const { liveData, deviceStatus } = useLiveData() || {};

  const [devices, setDevices] = useState([]);   // enrichis : { …, hasFeu, hasCmd, byKey }
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null); // {token} après création auto
  const [copied, setCopied] = useState(false);
  const [events, setEvents] = useState([]);     // journal des événements
  const [dureeVert, setDureeVert] = useState(5);
  const [modeLocal, setModeLocal] = useState(0);
  const [pressing, setPressing] = useState(false);
  const [distHistory, setDistHistory] = useState([]); // [{createdAt, value}] pour le graphique
  const prev = useRef({});                      // détection des changements d'état
  const prevMode = useRef(undefined);
  const dureeTimer = useRef(null);
  const pieTimer = useRef(null);

  // ---- Chargement : devices + leurs datastreams (pour mapper clé → id) ----
  async function load() {
    try {
      const list = await api.getDevices();
      const details = await Promise.all(list.map((d) => api.getDevice(d.id).catch(() => null)));
      const enriched = list.map((d, i) => {
        const dss = details[i]?.datastreams || [];
        const byKey = {};
        for (const ds of dss) byKey[ds.key] = ds.id;
        const hasCmd = 'duree_vert' in byKey && 'mode' in byKey && 'bouton_pieton' in byKey;
        return { ...d, datastreams: dss, byKey, hasFeu: 'distance' in byKey && 'feu' in byKey, hasCmd };
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

  // ---- Initialisation à l'ouverture / changement de device ----
  useEffect(() => {
    if (!device?.token) return undefined;
    let annule = false;
    (async () => {
      try {
        const l = await api.getLatest(device.token);
        const cmd = {};
        for (const s of l.datastreams || []) cmd[s.key] = s.value;
        if (!annule) {
          if (cmd.duree_vert != null) setDureeVert(Number(cmd.duree_vert));
          if (cmd.mode != null) setModeLocal(Number(cmd.mode));
          if (byKey.distance) {
            const hist = await api.getHistory(byKey.distance, 60).catch(() => []);
            if (!annule) setDistHistory(hist.map((p) => ({ createdAt: p.createdAt, value: p.value })));
          }
        }
      } catch (_) { /* device non encore actif : valeurs par défaut */}
    })();
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

  // ---- Journal : on note chaque changement d'état ----
  function addEvent(msg, tone) {
    setEvents((ev) => [{ time: fmtTime(Date.now()), msg, tone }, ...ev].slice(0, 20));
  }

  useEffect(() => {
    const was = prev.current;
    if (feuVal !== undefined && was.f !== undefined && feuVal !== was.f) {
      addEvent(FEU_INFO[feuVal] ? `🚦 ${FEU_INFO[feuVal].label}` : `État du feu : ${feuVal}`, feuVal === 2 ? 'rouge' : feuVal === 1 ? 'orange' : 'vert');
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
      const lbl = MODE_BTNS.find((b) => b.v === m)?.label || String(m);
      addEvent(`🕹️ Mode : ${lbl}`, m === 2 ? 'rouge' : m === 1 ? 'vert' : 'ok');
    }
    prevMode.current = m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData?.[byKey.mode]?.value, byKey.mode]);

  // ---- Création auto du device « Feu intelligent » + ses 6 datastreams ----
  async function creerDevice() {
    setBusy(true); setError('');
    try {
      const d = await api.createDevice({ name: 'Feu intelligent', type: 'esp32' });
      await api.addDatastream(d.id, { key: 'distance', unit: 'cm' });
      await api.addDatastream(d.id, { key: 'pedestrian', unit: '', data_type: 'boolean' });
      await api.addDatastream(d.id, { key: 'feu', unit: '', data_type: 'number' });
      await api.addDatastream(d.id, { key: 'duree_vert', unit: 's' });
      await api.addDatastream(d.id, { key: 'mode', unit: '' });
      await api.addDatastream(d.id, { key: 'bouton_pieton', unit: '' });
      await api.addDatastream(d.id, { key: 'compteur_pietons', unit: '' });
      localStorage.setItem('yousis_feu_device', String(d.id));
      setCreated({ token: d.token });
      setSelectedId(String(d.id));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Ajouter les 3 datastreams de commande (anciens devices « feu ») ----
  async function addCommandes() {
    if (!device) return;
    setBusy(true); setError('');
    try {
      await Promise.all([
        api.addDatastream(device.id, { key: 'duree_vert', unit: 's' }),
        api.addDatastream(device.id, { key: 'mode', unit: '' }),
        api.addDatastream(device.id, { key: 'bouton_pieton', unit: '' }),
      ]);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Commandes : durée du vert (slider, envoi dès qu'on lâche) ----
  function onDureeChange(v) {
    setDureeVert(v);
    if (dureeTimer.current) clearTimeout(dureeTimer.current);
    dureeTimer.current = setTimeout(() => {
      dureeTimer.current = null;
      api.sendCommand(device.id, { key: 'duree_vert', value: v }).catch((e) => setError(e.message));
    }, 350);
  }

  // ---- Commandes : mode Auto / Vert forcé / Rouge forcé ----
  function setMode(v) {
    if (!device) return;
    setModeLocal(v);
    api.sendCommand(device.id, { key: 'mode', value: v }).catch((e) => setError(e.message));
  }

  // ---- Commande : bouton « Piéton » (impulsion 1 puis retour à 0) ----
  function presserPieton() {
    if (!device || pressing) return;
    api.sendCommand(device.id, { key: 'bouton_pieton', value: 1 }).catch((e) => setError(e.message));
    setPressing(true);
    if (pieTimer.current) clearTimeout(pieTimer.current);
    pieTimer.current = setTimeout(() => {
      api.sendCommand(device.id, { key: 'bouton_pieton', value: 0 }).catch(() => {});
      setPressing(false);
    }, 1500);
  }

  // Nettoyage des timers au démontage
  useEffect(
    () => () => {
      if (dureeTimer.current) clearTimeout(dureeTimer.current);
      if (pieTimer.current) clearTimeout(pieTimer.current);
    },
    []
  );

  // ---- Prêt pour l'affichage ? ----
  const hasFeu = device?.hasFeu;
  const hasCmd = device?.hasCmd;

  const info = feuVal !== undefined ? FEU_INFO[feuVal] : null;
  const carLamp = info ? info.lamp : null;
  const pedLightGreen = carLamp === 'rouge';
  const modeActif = liveData?.[byKey.mode]?.value ?? modeLocal;
  const distPoints = distHistory.map((p) => ({ t: p.createdAt, v: p.value }));
  const NB_MAX = 60;

  // ---- Blocs réutilisables ----
  const tileCard = 'rounded-3xl border border-slate-800 bg-slate-900/70 p-6';
  const tileTitle = 'flex items-center gap-2 font-semibold';
  const miniLabel = 'text-[11px] uppercase tracking-wider text-slate-500';

  return (
    <div className="mx-auto max-w-6xl">
      {/* Entête */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">🚦 Tableau de bord</h2>
        {online !== null && (
          <span
            className={
              'rounded-full px-3 py-1 text-xs font-semibold ' +
              (online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500')
            }
          >
            {online ? '● en ligne' : '○ hors ligne'}
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {/* Bandeau après création auto : affiche le token à copier */}
      {created && (
        <div className="mb-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-sm text-emerald-300">✅ Device « Feu intelligent » créé ! Copie son token :</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-slate-950 px-3 py-2 text-sm text-cyan-300">{created.token}</code>
            <button
              onClick={() => copierSansBug(created.token, setCopied)}
              className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}
            >
              {copied ? '✓ Copié' : 'Copier'}
            </button>
          </div>
        </div>
      )}

      {/* ==== Aucun device prêt → écran de mise en place ==== */}
      {!device && (
        <div className="rounded-3xl border border-dashed border-slate-700 p-10 text-center">
          <p className="mb-1 text-3xl">🚦</p>
          <p className="font-semibold">Pour lancer la démo du feu intelligent, il faut un device avec ses datastreams :</p>
          <p className="mt-1 text-sm text-slate-400">
            <code className="text-cyan-300">distance</code> (cm) · <code className="text-cyan-300">pedestrian</code> (0/1) ·{' '}
            <code className="text-cyan-300">feu</code> (0=vert, 1=orange, 2=rouge) · <code className="text-cyan-300">duree_vert</code> (s) ·{' '}
            <code className="text-cyan-300">mode</code> · <code className="text-cyan-300">bouton_pieton</code>
          </p>
          <button
            onClick={creerDevice}
            disabled={busy}
            className="mt-5 rounded-2xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            {busy ? 'Création…' : '⚙️ Créer le device « Feu intelligent »'}
          </button>
        </div>
      )}

      {/* ==== Device prêt : feux + supervision + commandes + journal ==== */}
      {device && hasFeu && (
        <div>
          {/* Sélecteur de device + token */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="min-w-[220px]">
              <label className="mb-1 block text-xs text-slate-400">Device feu</label>
              <select
                value={selectedId}
                onChange={(e) => {
                  localStorage.setItem('yousis_feu_device', e.target.value);
                  setSelectedId(e.target.value);
                }}
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

          {/* Ligne 1 : les feux + supervision de la distance */}
          <div className="grid gap-5 lg:grid-cols-3">
            {/* ---- Les deux feux tricolores ---- */}
            <div className={tileCard}>
              <h3 className={tileTitle}>🚦 Feux</h3>
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
            </div>

            {/* ---- Supervision de la distance ---- */}
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
                      <ReferenceLine
                        y={SEUIL_DEFAUT}
                        stroke="#ef4444"
                        strokeDasharray="5 4"
                        label={{ value: `Seuil ${SEUIL_DEFAUT} cm`, position: 'insideTopRight', fill: '#f87171', fontSize: 10 }}
                      />
                      <Line type="monotone" dataKey="v" stroke="#22d3ee" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-500">En attente de l’historique… (le simulateur doit tourner)</p>
                )}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Seuil de détection piéton : <span className="text-slate-300">{SEUIL_DEFAUT} cm</span> — réglable dans le
                simulateur avec <code className="text-cyan-300">--seuil</code>.
              </p>
            </div>
          </div>

          {/* Ligne 2 : commandes + état/journal */}
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            {/* ---- Compteur de passages piétons ---- */}
            <div className={`${tileCard} lg:col-span-3`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">🚶</span>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Passages piétons comptabilisés</p>
                    <p className="text-3xl font-black text-cyan-300">{compteur ? compteur.value : 0}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500">Compté côté device (broche 14 + ultrason), affiché en temps réel</span>
              </div>
            </div>
            {/* ---- Commandes du système ---- */}
            <div className={tileCard}>
              <h3 className={`${tileTitle} mb-4`}>🎛️ Commandes du système</h3>

              {!hasCmd ? (
                <div className="text-center">
                  <p className="text-sm text-slate-400">
                    Ce device a les datastreams du feu mais pas encore les <b>commandes</b>.
                  </p>
                  <button
                    onClick={addCommandes}
                    disabled={busy}
                    className="mt-3 rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {busy ? 'Ajout…' : '➕ Ajouter les commandes (durée vert, mode, piéton)'}
                  </button>
                </div>
              ) : (
                <>
                  {/* Durée du vert */}
                  <div>
                    <p className={miniLabel}>Durée du vert</p>
                    <div className="mt-1 flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={30}
                        step={1}
                        value={dureeVert}
                        onChange={(e) => onDureeChange(Number(e.target.value))}
                        className="w-full accent-cyan-400"
                      />
                      <span className="w-14 shrink-0 text-right text-2xl font-black text-emerald-300">{dureeVert} s</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Appliqué en temps réel — le device l’utilise au prochain cycle de vert.
                    </p>
                  </div>

                  {/* Mode système */}
                  <div className="mt-5">
                    <p className={miniLabel}>Mode système</p>
                    <div className="mt-2 flex gap-1 rounded-2xl bg-slate-950 p-1">
                      {MODE_BTNS.map((b) => {
                        const actif = modeActif === b.v;
                        return (
                          <button
                            key={b.v}
                            onClick={() => setMode(b.v)}
                            className={
                              'flex-1 rounded-xl px-2 py-2 text-sm font-semibold transition-all ' +
                              (actif ? b.active : 'text-slate-400 hover:bg-slate-800 hover:text-white')
                            }
                          >
                            {b.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bouton piéton */}
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <div>
                      <p className={miniLabel}>Passage piéton</p>
                      <p className="mt-1 text-[11px] text-slate-500">Déclenche le passage à la demande</p>
                    </div>
                    <button
                      onClick={presserPieton}
                      disabled={pressing}
                      className={
                        'h-20 w-20 shrink-0 rounded-full border-2 text-3xl transition-all duration-200 ' +
                        (pressing
                          ? 'scale-90 border-amber-400 bg-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.5)]'
                          : 'border-slate-600 bg-slate-800 hover:bg-slate-700 active:scale-95')
                      }
                      title="Faire traverser le piéton"
                    >
                      🚶
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* ---- État actuel + journal ---- */}
            <div className={`${tileCard} lg:col-span-2`}>
              <h3 className={tileTitle}>📋 État actuel &amp; journal</h3>
              <div className="mt-3 text-sm text-slate-400">
                {info ? (
                  <span className={`text-lg font-semibold ${info.cls}`}>{info.label}</span>
                ) : (
                  <span className="text-slate-500">En attente de données du capteur…</span>
                )}
                {modeActif !== undefined && (
                  <span className="ml-3 rounded-full bg-slate-950 px-3 py-1 text-xs">
                    Mode : {MODE_BTNS.find((b) => b.v === modeActif)?.label || String(modeActif)}
                  </span>
                )}
              </div>

              <div className="mt-4">
                <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {events.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      En attente d’événements… (un piéton apparaît toutes les ~15-30 s).
                    </p>
                  ) : (
                    events.map((ev, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="shrink-0 text-[11px] text-slate-500">{ev.time}</span>
                        <span className={toneCls[ev.tone] || 'text-emerald-300'}>{ev.msg}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Device présent mais sans les datastreams du feu */}
      {device && !hasFeu && (
        <div className="rounded-3xl border border-dashed border-slate-700 p-10 text-center">
          <p className="font-semibold">Le device « {device.name} » n’a pas encore les datastreams du feu.</p>
          <button onClick={() => { setSelectedId(localStorage.getItem('yousis_feu_device') || ''); load(); }} className="mt-1 text-sm text-cyan-400 hover:underline">
            Recharger la liste
          </button>
        </div>
      )}
    </div>
  );
}