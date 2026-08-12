// ============================================================
// YOUXIS IOT — Détail d'un device
// Token, datastreams, seuils d'alerte, suppression.
// ============================================================
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLiveData } from '../hooks/useLiveData.jsx';
import { fmtTime, fmtValue } from '../lib/format.js';

export default function DeviceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { liveData, deviceStatus } = useLiveData() || {};

  const [device, setDevice] = useState(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [newDs, setNewDs] = useState({ key: '', unit: '', data_type: 'number' });
  const [thresholds, setThresholds] = useState({}); // dsId -> {min, max}

  async function load() {
    const d = await api.getDevice(id);
    setDevice(d);
    setName(d.name);
    setType(d.type || '');
    const th = {};
    for (const ds of d.datastreams) th[ds.id] = { min: ds.min_threshold ?? '', max: ds.max_threshold ?? '' };
    setThresholds(th);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id]);

  async function copyToken() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(device.token);
      } else {
        const ta = document.createElement('textarea');
        ta.value = device.token;
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
      /* origine non sécurisée sans presse-papiers : on ne fait rien */
    }
  }

  async function saveInfos(e) {
    e.preventDefault();
    try {
      await api.updateDevice(id, { name, type });
      setNotice('Enregistré ✓');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addDs(e) {
    e.preventDefault();
    if (!newDs.key.trim()) return;
    setError('');
    try {
      await api.addDatastream(id, newDs);
      setNewDs({ key: '', unit: '', data_type: 'number' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveThresholds(dsId) {
    const t = thresholds[dsId];
    try {
      await api.setThresholds(dsId, { min: t.min === '' ? null : Number(t.min), max: t.max === '' ? null : Number(t.max) });
      setNotice('Seuils enregistrés ✓');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeDevice() {
    if (!window.confirm('Supprimer ce device et toutes ses données ?')) return;
    await api.deleteDevice(id);
    navigate('/devices');
  }

  if (!device) {
    return <p className="text-slate-500">{error || 'Chargement…'}</p>;
  }

  const online = deviceStatus && id in deviceStatus ? deviceStatus[id] : device.online;

  return (
    <div className="max-w-3xl">
      <button onClick={() => navigate('/devices')} className="mb-4 text-sm text-slate-400 hover:text-white">
        ← Retour aux devices
      </button>

      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{device.name}</h2>
          <span
            className={
              'rounded-full px-2 py-0.5 text-xs ' +
              (online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500')
            }
          >
            {online ? '● en ligne' : '○ hors ligne'}
          </span>
        </div>

        <form onSubmit={saveInfos} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs text-slate-400">Nom</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs text-slate-400">Type</label>
            <input value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700">
            Enregistrer
          </button>
        </form>

        <div className="mt-4">
          <label className="mb-1 block text-xs text-slate-400">
            Token (à copier dans le simulateur ou l'ESP32)
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-slate-950 px-3 py-2 text-sm text-cyan-300">{device.token}</code>
            <button onClick={copyToken} className="rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700">
              {copied ? '✓ Copié' : 'Copier'}
            </button>
          </div>
        </div>
      </div>

      {/* Datastreams */}
      <h3 className="mb-3 text-lg font-semibold">Datastreams ({device.datastreams.length})</h3>
      <div className="space-y-3">
        {device.datastreams.map((ds) => {
          const live = liveData?.[ds.id];
          const value = live ? live.value : null;
          return (
            <div key={ds.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{ds.key}</span>
                  {ds.unit && <span className="ml-1 text-slate-500">{ds.unit}</span>}
                  <span className="ml-2 rounded bg-slate-950 px-1.5 py-0.5 text-xs text-slate-400">{ds.data_type}</span>
                </div>
                <div className="text-sm text-slate-300">
                  Valeur : <span className="font-bold text-cyan-300">{fmtValue(value)}</span>
                  <span className="ml-2 text-xs text-slate-500">{live ? fmtTime(live.createdAt) : ''}</span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="w-28">
                  <label className="mb-1 block text-[10px] text-slate-500">Alerte si &lt; min</label>
                  <input
                    type="number"
                    value={thresholds[ds.id]?.min ?? ''}
                    onChange={(e) => setThresholds((p) => ({ ...p, [ds.id]: { ...p[ds.id], min: e.target.value } }))}
                    placeholder="—"
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-[10px] text-slate-500">Alerte si &gt; max</label>
                  <input
                    type="number"
                    value={thresholds[ds.id]?.max ?? ''}
                    onChange={(e) => setThresholds((p) => ({ ...p, [ds.id]: { ...p[ds.id], max: e.target.value } }))}
                    placeholder="—"
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
                  />
                </div>
                <button onClick={() => saveThresholds(ds.id)} className="rounded bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700">
                  Appliquer seuils
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ajout datastream */}
      <form onSubmit={addDs} className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-slate-700 p-4">
        <div className="flex-1 min-w-[120px]">
          <label className="mb-1 block text-xs text-slate-400">Nouveau datastream (clé)</label>
          <input
            value={newDs.key}
            onChange={(e) => setNewDs((p) => ({ ...p, key: e.target.value }))}
            placeholder="ex : distance"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
        </div>
        <div className="w-24">
          <label className="mb-1 block text-xs text-slate-400">Unité</label>
          <input value={newDs.unit} onChange={(e) => setNewDs((p) => ({ ...p, unit: e.target.value }))} placeholder="cm" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs text-slate-400">Type</label>
          <select value={newDs.data_type} onChange={(e) => setNewDs((p) => ({ ...p, data_type: e.target.value }))} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm">
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">
          + Ajouter
        </button>
      </form>

      {notice && <p className="mt-3 text-sm text-emerald-400">{notice}</p>}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <button onClick={removeDevice} className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300 hover:bg-red-500/20">
        Supprimer ce device
      </button>
    </div>
  );
}