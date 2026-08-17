// ============================================================
// YOUXIS IOT — Page « Cycles du feu »
// Vue type ThingSpeak : historique PERSISTANT des cycles du feu,
// enregistré en temps réel dans la base (table feu_cycles).
//   → compteur de passages piétons
//   → graphe des états dans le temps
//   → journal de tous les cycles (survit au rechargement)
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useLiveData } from '../hooks/useLiveData.jsx';
import { fmtTime } from '../lib/format.js';

// état -> { label, couleur } (le device n'émet que 0/1/2)
const ETAT = {
  0: { label: 'VERT',   cls: 'text-emerald-300', dot: '#10b981' },
  1: { label: 'ORANGE', cls: 'text-amber-300',   dot: '#f59e0b' },
  2: { label: 'ROUGE',  cls: 'text-red-300',     dot: '#ef4444' },
};

const tile = 'rounded-3xl border border-slate-800 bg-slate-900/70 p-6';

export default function Cycles() {
  const { cycles, clearCyclesLive } = useLiveData() || {};
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState([]); // cycles chargés depuis la base
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  async function load() {
    try {
      const list = await api.getDevices();
      const feuOnes = list.filter((d) =>
        d.datastreams?.some?.((s) => s.key === 'feu') ||
        // datastreams pas toujours inclus ; on recharge le détail
        false
      );
      const details = await Promise.all(list.map((d) => api.getDevice(d.id).catch(() => null)));
      const enriched = list.map((d, i) => ({
        ...d,
        datastreams: details[i]?.datastreams || [],
      }));
      setDevices(enriched);
      const feu = enriched.filter((d) => d.datastreams.some((s) => s.key === 'feu'));
      const saved = localStorage.getItem('yousis_feu_device');
      const next = saved && feu.some((d) => String(d.id) === saved) ? saved : (feu[0] ? String(feu[0].id) : '');
      setSelectedId(next);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  // Rafraîchir : recharge l'historique persistant depuis la base
  async function refresh() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const rows = await api.getCycles(selectedId, 500);
      setHistory(rows);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Remettre à 0 : vide l'historique des cycles (base + live) pour le device
  async function resetCycles() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.clearCycles(selectedId);
      setHistory([]);
      clearCyclesLive?.();
      setError('');
      setConfirmReset(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Recharge l'historique persistant à chaque changement de device
  useEffect(() => {
    if (!selectedId) { setHistory([]); return undefined; }
    let annule = false;
    api.getCycles(selectedId, 500)
      .then((rows) => { if (!annule) setHistory(rows); })
      .catch(() => {});
    return () => { annule = true; };
  }, [selectedId]);

  // Fusion : historique de base + nouveaux cycles temps réel (WebSocket)
  const deviceCycles = useMemo(() => {
    const base = history.map((c) => ({ ...c, deviceId: Number(selectedId) }));
    const live = (cycles || []).filter((c) => String(c.deviceId) === String(selectedId));
    // dédoublonnage par createdAt
    const map = new Map();
    for (const c of [...base, ...live]) map.set(c.createdAt, c);
    return [...map.values()].sort((a, b) => a.createdAt - b.createdAt);
  }, [history, cycles, selectedId]);

  // Nombre de passages piétons = la valeur fiable envoyée par le device
  // (compteur_pietons), pas le nombre de lignes de journal (un seul passage
  // physique crée plusieurs lignes d'état). On prend le maximum vu.
  const totalPassages = deviceCycles.reduce(
    (max, c) => Math.max(max, Number(c.compteur) || 0),
    0
  );
  const dernierEtat = deviceCycles.length ? deviceCycles[deviceCycles.length - 1].etat : null;

  // Frise : chaque changement d'état est une bande [debut, fin[ colorée par état.
  // La dernière bande court jusqu'à maintenant pour refléter l'état en cours.
  const segments = useMemo(() => {
    if (deviceCycles.length === 0) return [];
    const fin = Date.now();
    const segs = [];
    for (let i = 0; i < deviceCycles.length; i++) {
      const c = deviceCycles[i];
      const debut = c.createdAt;
      const finSeg = i + 1 < deviceCycles.length ? deviceCycles[i + 1].createdAt : fin;
      segs.push({ debut, fin: finSeg, etat: c.etat, pedestrian: c.pedestrian, duree: finSeg - debut });
    }
    return segs;
  }, [deviceCycles]);

  // Temps total passé dans chaque état (en secondes), pour les pastilles de synthèse.
  const tempsParEtat = useMemo(() => {
    const t = { 0: 0, 1: 0, 2: 0 };
    for (const s of segments) t[s.etat] = (t[s.etat] || 0) + s.duree;
    return t;
  }, [segments]);

  const device = devices.find((d) => String(d.id) === selectedId) || null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">📈 Cycles du feu</h2>
        <div className="flex flex-wrap items-center gap-2">
          {device && (
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">{device.name}</span>
          )}
          <button
            onClick={refresh}
            disabled={busy || !selectedId}
            className="rounded-xl bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            ⟳ Rafraîchir
          </button>
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              disabled={busy || !selectedId}
              className="rounded-xl bg-amber-500/15 px-3 py-1.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
            >
              ↺ Remettre à 0
            </button>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">Effacer l'historique ?</span>
              <button
                onClick={resetCycles}
                disabled={busy}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
              >
                Oui
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                disabled={busy}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-slate-700"
              >
                Non
              </button>
            </span>
          )}
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {devices.filter((d) => d.datastreams.some((s) => s.key === 'feu')).length > 1 && (
        <div className="mb-4 min-w-[240px]">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          >
            {devices.filter((d) => d.datastreams.some((s) => s.key === 'feu')).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      {!device && (
        <div className="rounded-3xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
          Aucun device « Feu intelligent » trouvé. Crée-le depuis l'onglet 🚦 Tableau de bord.
        </div>
      )}

      {device && (
        <div className="space-y-5">
          {/* Ligne 1 : compteurs */}
          <div className="grid gap-5 sm:grid-cols-3">
            <div className={tile}>
              <p className="text-[11px] uppercase tracking-wider text-slate-500">Passages piétons</p>
              <p className="mt-1 text-4xl font-black text-cyan-300">{totalPassages}</p>
            </div>
            <div className={tile}>
              <p className="text-[11px] uppercase tracking-wider text-slate-500">Cycles enregistrés</p>
              <p className="mt-1 text-4xl font-black text-slate-100">{deviceCycles.length}</p>
            </div>
            <div className={tile}>
              <p className="text-[11px] uppercase tracking-wider text-slate-500">État actuel</p>
              <p className={`mt-1 text-4xl font-black ${ETAT[dernierEtat]?.cls || 'text-slate-400'}`}>
                {ETAT[dernierEtat]?.label || '—'}
              </p>
            </div>
          </div>

          {/* Ligne 2 : frise chronologique des cycles (Gantt temporel) */}
          <div className={tile}>
            <h3 className="mb-3 flex items-center gap-2 font-semibold">📊 Frise des cycles du feu</h3>
            {segments.length > 0 ? (
              <FriseCycles segments={segments} etatMap={ETAT} fmtTime={fmtTime} />
            ) : (
              <p className="text-sm text-slate-500">En attente des premiers cycles… (le simulateur / l'ESP32 doit tourner)</p>
            )}
            {/* Légende : temps cumulé dans chaque état */}
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              {[0, 1, 2].map((e) => (
                <span key={e} className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: ETAT[e].dot }} />
                  <span className="text-slate-400">{ETAT[e].label} :</span>
                  <span className="font-semibold text-slate-200">{(tempsParEtat[e] / 1000).toFixed(0)} s</span>
                </span>
              ))}
            </div>
          </div>

          {/* Ligne 3 : journal persistant des cycles */}
          <div className={tile}>
            <h3 className="mb-3 flex items-center gap-2 font-semibold">📋 Journal des cycles</h3>
            <div className="max-h-96 overflow-y-auto pr-1">
              {deviceCycles.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun cycle enregistré pour l'instant.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900 text-[11px] uppercase tracking-wider text-slate-500">
                    <tr className="text-left">
                      <th className="py-2 pr-4">Heure</th>
                      <th className="py-2 pr-4">État</th>
                      <th className="py-2 pr-4">Piéton</th>
                      <th className="py-2 pr-4">Distance</th>
                      <th className="py-2">Compteur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deviceCycles.slice(-200).reverse().map((c, i) => (
                      <tr key={c.createdAt + '-' + i} className="border-t border-slate-800">
                        <td className="py-2 pr-4 text-slate-400">{fmtTime(c.createdAt)}</td>
                        <td className={`py-2 pr-4 font-semibold ${ETAT[c.etat]?.cls || 'text-slate-300'}`}>
                          {ETAT[c.etat]?.label || c.etat}
                        </td>
                        <td className="py-2 pr-4">
                          {c.pedestrian === 1
                            ? <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-300">oui</span>
                            : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="py-2 pr-4 text-slate-300">
                          {c.distance != null ? `${Number(c.distance).toFixed(1)} cm` : '—'}
                        </td>
                        <td className="py-2 text-slate-300">
                          {c.compteur != null ? Number(c.compteur) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Frise (Gantt) des cycles : bandes colorées par état, positionnées en temps réel
 * sur une piste horizontale. La dernière bande s'étire jusqu'à « maintenant ».
 * Beaucoup plus lisible qu'un LineChart pour des états discrets.
 */
function FriseCycles({ segments, etatMap, fmtTime }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const t0 = segments[0].debut;
  const tFin = Math.max(now, segments[segments.length - 1].fin);
  const total = Math.max(1, tFin - t0);
  const pct = (t) => `${((t - t0) / total) * 100}%`;

  return (
    <div className="space-y-1">
      <div className="relative h-16 w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        {segments.map((s, i) => (
          <div
            key={i}
            title={`${etatMap[s.etat]?.label || s.etat} — ${fmtTime(s.debut)} — ${(s.duree / 1000).toFixed(1)} s${s.pedestrian === 1 ? ' — 🚸 piéton' : ''}`}
            className="group absolute top-0 h-full"
            style={{
              left: pct(s.debut),
              width: `calc(${pct(s.fin)} - ${pct(s.debut)})`,
              minWidth: 3,
              background: etatMap[s.etat]?.dot || '#64748b',
              opacity: 0.85,
            }}
          />
        ))}
        {/* curseur « maintenant » */}
        <div
          className="absolute top-0 h-full w-px bg-slate-300/70"
          style={{ left: pct(tFin) }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{fmtTime(t0)}</span>
        <span>{fmtTime(tFin)}</span>
      </div>
    </div>
  );
}
