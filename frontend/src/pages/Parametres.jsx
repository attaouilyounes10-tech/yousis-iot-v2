// ============================================================
// YOUXIS IOT — Page « Paramètres » du feu
// Réglage FIN et EXACT des durées des feux tricolores (VERT / ORANGE /
// ROUGE), directement depuis le site, sans recompiler le simulateur.
//
// Les durées sont envoyées comme commandes sur les datastreams
// 'duree_vert' / 'duree_orange' / 'duree_rouge' (route générique
// POST /devices/:id/commands). Le simulateur (ou l'ESP32) les lit via
// GET /latest à chaque seconde et les applique. Comme elles sont stockées
// en base (device_commands), elles persistent et survivent à un
// redémarrage — on ne retombe plus jamais dans le défaut disproportionné.
// ============================================================
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Bornes réalistes d'un feu de carrefour (cohérentes avec le simulateur) :
//   VERT  : 1–60 s  (laisser passer les voitures)
//   ORANGE: 1–10 s  (ambre — standard FR ≈ 3 s)
//   ROUGE : 2–60 s  (temps de traversée piéton + sécurité)
const PARAMS = [
  {
    key: 'duree_vert',
    label: 'Feu VERT',
    desc: "Temps laissé aux voitures avant qu'un piéton puisse déclencher l'orange.",
    min: 1, max: 60, step: 1, def: 5, color: 'emerald',
  },
  {
    key: 'duree_orange',
    label: 'Feu ORANGE (ambre)',
    desc: 'Temps de l\'ambre : les voitures s\'arrêtent, durée fixe standard.',
    min: 1, max: 10, step: 1, def: 3, color: 'amber',
  },
  {
    key: 'duree_rouge',
    label: 'Feu ROUGE',
    desc: 'Temps de traversée du piéton (rouge = piéton traverse).',
    min: 2, max: 60, step: 1, def: 8, color: 'red',
  },
];

const RING = {
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
  red: 'text-red-300',
};
const ACCENT = {
  emerald: 'accent-emerald-500',
  amber: 'accent-amber-500',
  red: 'accent-red-500',
};

const tile = 'rounded-3xl border border-slate-800 bg-slate-900/70 p-6';

export default function Parametres() {
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [values, setValues] = useState({});   // key -> valeur courante (number)
  const [dirty, setDirty] = useState({});      // key -> modifié mais pas encore envoyé
  const [saving, setSaving] = useState({});    // key -> en cours d'envoi
  const [saved, setSaved] = useState(null);     // 'ok' | 'err' | message
  const [error, setError] = useState('');

  // ---- Chargement : devices + leurs datastreams (mapper clé → id) ----
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
      const next = saved && feuOnes.some((d) => String(d.id) === saved)
        ? saved
        : (feuOnes[0] ? String(feuOnes[0].id) : '');
      setSelectedId(next);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  const device = devices.find((d) => String(d.id) === selectedId) || null;

  // ---- Recharge les dernières valeurs envoyées à chaque changement de device ----
  useEffect(() => {
    if (!device?.token) return undefined;
    let annule = false;
    api.getLatest(device.token)
      .then((l) => {
        if (annule) return;
        const cmd = {};
        for (const s of (l.datastreams || [])) cmd[s.key] = s.value;
        const init = {};
        for (const p of PARAMS) {
          const v = cmd[p.key];
          init[p.key] = (v !== null && v !== undefined) ? Number(v) : p.def;
        }
        setValues(init);
        setDirty({});
      })
      .catch(() => {});
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id, device?.token]);

  function onSlide(p, val) {
    setValues((v) => ({ ...v, [p.key]: val }));
    setDirty((d) => ({ ...d, [p.key]: true }));
    setSaved(null);
  }

  async function appliquerUne(p) {
    if (!selectedId) return;
    setSaving((s) => ({ ...s, [p.key]: true }));
    setError('');
    try {
      await api.setDuree(selectedId, p.key, values[p.key]);
      setDirty((d) => ({ ...d, [p.key]: false }));
      setSaved(`✓ ${p.label} réglé à ${values[p.key]} s`);
    } catch (e) {
      setError(e.message);
      setSaved(null);
    } finally {
      setSaving((s) => ({ ...s, [p.key]: false }));
    }
  }

  async function toutAppliquer() {
    for (const p of PARAMS) {
      if (dirty[p.key]) await appliquerUne(p);
    }
  }

  const uneModif = Object.values(dirty).some(Boolean);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">⚙️ Paramètres du feu</h2>
        {device && (
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">{device.name}</span>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {devices.filter((d) => d.hasFeu).length > 1 && (
        <div className="mb-4 min-w-[240px]">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          >
            {devices.filter((d) => d.hasFeu).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      {!device && (
        <div className="rounded-3xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
          Aucun device « Feu intelligent » trouvé. Crée-le depuis l'onglet 🔧 Montage.
        </div>
      )}

      {device && (
        <div className="space-y-5">
          <p className="text-sm text-slate-400">
            Réglez les durées de chaque phase en secondes. Les valeurs sont
            envoyées au simulateur en temps réel et <span className="text-slate-200">persistent</span> :
            elles restent actives même après un redémarrage.
          </p>

          {PARAMS.map((p) => {
            const val = values[p.key] ?? p.def;
            return (
              <div key={p.key} className={tile}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-sm font-semibold ${RING[p.color]}`}>{p.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{p.desc}</p>
                  </div>
                  <span className="shrink-0 rounded-xl bg-slate-950 px-3 py-1.5 text-lg font-black tabular-nums text-slate-100">
                    {val} s
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <span className="w-10 text-right text-xs text-slate-500">{p.min}s</span>
                  <input
                    type="range"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={val}
                    onChange={(e) => onSlide(p, Number(e.target.value))}
                    className={`w-full ${ACCENT[p.color]}`}
                  />
                  <span className="w-10 text-xs text-slate-500">{p.max}s</span>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-slate-600">
                    Bornes réalistes : {p.min}–{p.max} s
                  </span>
                  {dirty[p.key] && (
                    <button
                      onClick={() => appliquerUne(p)}
                      disabled={saving[p.key]}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
                    >
                      {saving[p.key] ? 'Envoi…' : 'Appliquer'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-3 pt-1">
            {saved && <span className="text-sm text-emerald-300">{saved}</span>}
            {!saved && <span />}
            <button
              onClick={toutAppliquer}
              disabled={!uneModif}
              className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Tout appliquer
            </button>
          </div>

          <p className="text-xs leading-relaxed text-slate-500">
            💡 Conseil : pour un feu équilibré et réaliste, gardez le VERT
            majoritaire (les voitures passent), l'ORANGE court (≈ 3 s), et le
            ROUGE suffisant pour la traversée (≈ 6–10 s). Le cycle tourne
            automatiquement : plus besoin de recompiler le simulateur.
          </p>
        </div>
      )}
    </div>
  );
}
