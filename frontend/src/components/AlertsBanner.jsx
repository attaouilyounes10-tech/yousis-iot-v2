// ============================================================
// YOUXIS IOT — Bannière d'alertes (seuil dépassé)
// ============================================================
import { useLiveData } from '../hooks/useLiveData.jsx';

export default function AlertsBanner() {
  const { alerts } = useLiveData() || {};

  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-medium text-red-200"
        >
          <span>⚠️</span> {a.message}
        </div>
      ))}
    </div>
  );
}