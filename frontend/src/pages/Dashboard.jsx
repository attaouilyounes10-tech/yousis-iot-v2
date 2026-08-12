// ============================================================
// YOUXIS IOT — Page « Dashboard »  (le cœur, comme Blynk)
// Grille de widgets mise à jour en temps réel (WebSocket).
// ============================================================
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import WidgetCard from '../components/WidgetCard.jsx';
import AddWidgetModal from '../components/AddWidgetModal.jsx';

export default function Dashboard() {
  const [widgets, setWidgets] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setWidgets(await api.getWidgets());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id) {
    try {
      await api.deleteWidget(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  // Pilote un actionneur : bouton/slider → API commande du device
  async function handleCommand(widget, value) {
    try {
      await api.sendCommand(widget.device_id, { key: widget.ds_key, value });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
        >
          + Ajouter un widget
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {widgets && widgets.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
          Aucun widget pour l'instant.
          <br />
          Clique sur <span className="text-cyan-400">« + Ajouter un widget »</span> pour créer ta première jauge
          (par exemple sur le datastream <code className="text-slate-300">value</code> de ton device).
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {widgets?.map((w) => (
          <WidgetCard key={w.id} widget={w} onDelete={handleDelete} onCommand={handleCommand} />
        ))}
      </div>

      {adding && (
        <AddWidgetModal
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </div>
  );
}