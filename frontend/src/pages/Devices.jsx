// ============================================================
// YOUXIS IOT — Page « Mes appareils »
// Création de devices + liste avec token et statut en ligne.
// ============================================================
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLiveData } from '../hooks/useLiveData.jsx';
import DeviceCard from '../components/DeviceCard.jsx';

export default function Devices() {
  const { deviceStatus } = useLiveData() || {};
  const [devices, setDevices] = useState([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setDevices(await api.getDevices());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Donne un nom au device');
    setBusy(true);
    setError('');
    try {
      await api.createDevice({ name, type });
      setName('');
      setType('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Le statut temps réel (WebSocket) prime sur la valeur chargée
  function online(id) {
    if (deviceStatus && id in deviceStatus) return deviceStatus[id];
    const d = devices.find((x) => x.id === id);
    return d ? d.online : false;
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold">Mes appareils</h2>

      <form
        onSubmit={create}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"
      >
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs text-slate-400">Nom du device</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Feu intelligent, ESP32 salon…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
        </div>
        <div className="w-40">
          <label className="mb-1 block text-xs text-slate-400">Type</label>
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="Ex : esp32, relais…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit" disabled={busy}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
        >
          + Ajouter
        </button>
      </form>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {devices.map((d) => (
          <DeviceCard key={d.id} device={{ ...d, online: online(d.id) }} />
        ))}
      </div>

      {devices.length === 0 && (
        <p className="text-sm text-slate-500">
          Aucun device pour l'instant — crée-en un avec le formulaire ci-dessus.
        </p>
      )}
    </div>
  );
}