// ============================================================
// YOUXIS IOT — Page « Tableau de bord » (commandes + supervision)
// ------------------------------------------------------------
// Cette page COMMANDE le feu et supervise son processus. La vision pure
// (feux animés, distance) est dans la page « Feu ».
//   - durée du vert (slider 1-30 s)      → datastream `duree_vert`
//   - mode Auto / Vert forcé / Rouge / Maintenance → datastream `mode`
//   - bouton « Piéton » (passage manuel) → datastream `bouton_pieton`
// La logique du feu est côté DEVICE (simulateur ou ESP32) ; il lit les
// commandes chaque seconde via GET /devices/:token/latest.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useLiveData } from '../hooks/useLiveData.jsx';
import { fmtTime } from '../lib/format.js';
import {
  FEU_INFO, MODE_BTNS, Lamp, toneCls, btn, copierSansBug,
} from '../lib/feu.jsx';

export default function TableauDeBord() {
  const { liveData, deviceStatus } = useLiveData() || {};

  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [events, setEvents] = useState([]);
  const [dureeVert, setDureeVert] = useState(5);
  const [modeLocal, setModeLocal] = useState(0);
  const [pressing, setPressing] = useState(false);
  const prev = useRef({});
  const prevMode = useRef(undefined);
  const dureeTimer = useRef(null);
  const pieTimer = useRef(null);

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

  // ---- Valeurs en direct ----
  const feu = liveData?.[byKey.feu];
  const compteur = liveData?.[byKey.compteur_pietons];
  const feuVal = feu ? feu.value : undefined;

  // ---- Init commandes au changement de device ----
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
        }
      } catch (_) { /* device non actif : valeurs par défaut */ }
    })();
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id, byKey.distance]);

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
    prev.current = { f: feuVal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feuVal]);

  // ---- Journal : changement de mode système ----
  useEffect(() => {
    const m = liveData?.[byKey.mode]?.value;
    if (m !== undefined && prevMode.current !== undefined && m !== prevMode.current) {
      const lbl = MODE_BTNS.find((b) => b.v === m)?.label || String(m);
      addEvent(`🕹️ Mode : ${lbl}`, m === 3 ? 'maint' : m === 2 ? 'rouge' : m === 1 ? 'vert' : 'ok');
    }
    prevMode.current = m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData?.[byKey.mode]?.value, byKey.mode]);

  // ---- Création auto du device « Feu intelligent » + ses 7 datastreams ----
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

  // ---- Commandes : mode Auto / Vert forcé / Rouge / Maintenance ----
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

  useEffect(
    () => () => {
      if (dureeTimer.current) clearTimeout(dureeTimer.current);
      if (pieTimer.current) clearTimeout(pieTimer.current);
    },
    []
  );

  const hasFeu = device?.hasFeu;
  const hasCmd = device?.hasCmd;
  const info = feuVal !== undefined ? FEU_INFO[feuVal] : null;
  const carLamp = info ? info.lamp : null;
  const modeActif = liveData?.[byKey.mode]?.value ?? modeLocal;

  const tileCard = 'rounded-3xl border border-slate-800 bg-slate-900/70 p-6';
  const tileTitle = 'flex items-center gap-2 font-semibold';
  const miniLabel = 'text-[11px] uppercase tracking-wider text-slate-500';

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">🎛️ Tableau de bord</h2>
        {online !== null && (
          <span className={'rounded-full px-3 py-1 text-xs font-semibold ' +
            (online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500')}>
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
            <button onClick={() => copierSansBug(created.token, setCopied)} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}>
              {copied ? '✓ Copié' : 'Copier'}
            </button>
          </div>
        </div>
      )}

      {!device && (
        <div className="rounded-3xl border border-dashed border-slate-700 p-10 text-center">
          <p className="mb-1 text-3xl">🎛️</p>
          <p className="font-semibold">Pour piloter le feu, il faut un device avec ses datastreams :</p>
          <p className="mt-1 text-sm text-slate-400">
            <code className="text-cyan-300">distance</code> · <code className="text-cyan-300">pedestrian</code> ·{' '}
            <code className="text-cyan-300">feu</code> · <code className="text-cyan-300">duree_vert</code> ·{' '}
            <code className="text-cyan-300">mode</code> · <code className="text-cyan-300">bouton_pieton</code> ·{' '}
            <code className="text-cyan-300">compteur_pietons</code>
          </p>
          <button onClick={creerDevice} disabled={busy}
            className="mt-5 rounded-2xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50">
            {busy ? 'Création…' : '⚙️ Créer le device « Feu intelligent »'}
          </button>
        </div>
      )}

      {device && hasFeu && (
        <div>
          {/* Sélecteur de device + token */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="min-w-[220px]">
              <label className="mb-1 block text-xs text-slate-400">Device feu</label>
              <select value={selectedId}
                onChange={(e) => { localStorage.setItem('yousis_feu_device', e.target.value); setSelectedId(e.target.value); }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                {devices.filter((d) => d.hasFeu).map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
              </select>
            </div>
            <div className="flex-1 min-w-[220px]">
              <label className="mb-1 block text-xs text-slate-400">Token (simulateur / ESP32)</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-xl bg-slate-950 px-3 py-2 text-sm text-cyan-300">{device.token}</code>
                <button onClick={() => copierSansBug(device.token, setCopied)} className={`${btn} bg-slate-800 hover:bg-slate-700`}>
                  {copied ? '✓ Copié' : 'Copier'}
                </button>
              </div>
            </div>
          </div>

          {/* Ligne : état du feu (mini-aperçu) + compteur */}
          <div className="grid gap-5 lg:grid-cols-3">
            <div className={tileCard}>
              <h3 className={tileTitle}>🚦 État du feu</h3>
              <div className="mt-4 flex items-center justify-center gap-4">
                <Lamp on={carLamp === 'rouge'} color="rouge" />
                <Lamp on={carLamp === 'orange'} color="orange" />
                <Lamp on={carLamp === 'vert'} color="vert" />
              </div>
              {info ? (
                <p className={`mt-4 text-center text-base font-semibold ${info.cls}`}>{info.label}</p>
              ) : (
                <p className="mt-4 text-center text-sm text-slate-500">En attente de données du capteur…</p>
              )}
              {modeActif !== undefined && (
                <p className="mt-1 text-center text-xs text-slate-500">
                  Mode : {MODE_BTNS.find((b) => b.v === modeActif)?.label || String(modeActif)}
                </p>
              )}
            </div>

            <div className={`${tileCard} lg:col-span-2`}>
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
              <p className="mt-4 text-sm text-slate-400">
                👉 La vision complète (feux animés + distance + graphe) est sur l'onglet{' '}
                <span className="text-cyan-300">🚦 Feu</span>.
              </p>
            </div>
          </div>

          {/* Ligne : commandes + journal */}
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <div className={tileCard}>
              <h3 className={`${tileTitle} mb-4`}>🎛️ Commandes du système</h3>

              {!hasCmd ? (
                <div className="text-center">
                  <p className="text-sm text-slate-400">Ce device a les datastreams du feu mais pas encore les <b>commandes</b>.</p>
                  <button onClick={addCommandes} disabled={busy}
                    className="mt-3 rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50">
                    {busy ? 'Ajout…' : '➕ Ajouter les commandes (durée vert, mode, piéton)'}
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <p className={miniLabel}>Durée du vert</p>
                    <div className="mt-1 flex items-center gap-3">
                      <input type="range" min={1} max={30} step={1} value={dureeVert}
                        onChange={(e) => onDureeChange(Number(e.target.value))} className="w-full accent-cyan-400" />
                      <span className="w-14 shrink-0 text-right text-2xl font-black text-emerald-300">{dureeVert} s</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">Appliqué en temps réel — le device l’utilise au prochain cycle de vert.</p>
                  </div>

                  <div className="mt-5">
                    <p className={miniLabel}>Mode système</p>
                    <div className="mt-2 flex gap-1 rounded-2xl bg-slate-950 p-1">
                      {MODE_BTNS.map((b) => {
                        const actif = modeActif === b.v;
                        return (
                          <button key={b.v} onClick={() => setMode(b.v)}
                            className={'flex-1 rounded-xl px-2 py-2 text-sm font-semibold transition-all ' +
                              (actif ? b.active : 'text-slate-400 hover:bg-slate-800 hover:text-white')}>
                            {b.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Maintenance : le feu clignote (orange) et coupe la circulation le temps de l’intervention.
                    </p>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <div>
                      <p className={miniLabel}>Passage piéton</p>
                      <p className="mt-1 text-[11px] text-slate-500">Déclenche le passage à la demande</p>
                    </div>
                    <button onClick={presserPieton} disabled={pressing}
                      className={'h-20 w-20 shrink-0 rounded-full border-2 text-3xl transition-all duration-200 ' +
                        (pressing
                          ? 'scale-90 border-amber-400 bg-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.5)]'
                          : 'border-slate-600 bg-slate-800 hover:bg-slate-700 active:scale-95')}
                      title="Faire traverser le piéton">
                      🚶
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className={`${tileCard} lg:col-span-2`}>
              <h3 className={tileTitle}>📋 Journal des commandes &amp; états</h3>
              <div className="mt-4">
                <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {events.length === 0 ? (
                    <p className="text-sm text-slate-500">En attente d’événements…</p>
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

      {device && !hasFeu && (
        <div className="rounded-3xl border border-dashed border-slate-700 p-10 text-center">
          <p className="font-semibold">Le device « {device.name} » n’a pas encore les datastreams du feu.</p>
        </div>
      )}
    </div>
  );
}
