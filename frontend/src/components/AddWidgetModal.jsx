// ============================================================
// YOUXIS IOT — Modale « Ajouter un widget »
// Choix : device → datastream → type de widget → label → config
// ============================================================
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const TYPES = [
  { value: 'gauge', label: '📊 Jauge — afficher une valeur' },
  { value: 'chart', label: '📈 Graphique — historique dans le temps' },
  { value: 'button', label: '🔘 Bouton ON/OFF — actionneur' },
  { value: 'slider', label: '🎚️ Slider — envoyer une valeur' },
];

export default function AddWidgetModal({ onClose, onCreated }) {
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [datastreams, setDatastreams] = useState([]);
  const [dsId, setDsId] = useState('');
  const [type, setType] = useState('gauge');
  const [label, setLabel] = useState('');
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(100);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getDevices().then(setDevices).catch((e) => setError(e.message));
  }, []);

  async function onDeviceChange(id) {
    setDeviceId(id);
    setDsId('');
    if (!id) return setDatastreams([]);
    try {
      const d = await api.getDevice(id);
      setDatastreams(d.datastreams || []);
    } catch (e) {
      setError(e.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!deviceId || !dsId) return setError('Choisis un device et un datastream');
    setBusy(true);
    setError('');
    try {
      const config = type === 'slider' ? { min: Number(min), max: Number(max), step: Number(step) } : {};
      await api.createWidget({ device_id: Number(deviceId), datastream_id: Number(dsId), type, label, config });
      onCreated();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold">Ajouter un widget</h3>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Appareil</label>
            <select
              value={deviceId}
              onChange={(e) => onDeviceChange(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            >
              <option value="">— Choisir —</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Datastream</label>
            <select
              value={dsId}
              onChange={(e) => setDsId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            >
              <option value="">— Choisir —</option>
              {datastreams.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.key}
                  {ds.unit ? ` (${ds.unit})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Type de widget</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Étiquette (optionnel)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex : Distance piéton"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          {type === 'slider' && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Min</label>
                <input type="number" value={min} onChange={(e) => setMin(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Max</label>
                <input type="number" value={max} onChange={(e) => setMax(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Pas</label>
                <input type="number" value={step} onChange={(e) => setStep(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm" />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white">
              Annuler
            </button>
            <button type="submit" disabled={busy} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50">
              {busy ? '…' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}