// ============================================================
// YOUXIS IOT — Widget : JAUGE (affichage d'une valeur)
// ============================================================
import { fmtValue } from '../../lib/format.js';

export default function Gauge({ label, unit, value }) {
  const v = value ?? null;
  // Barre indicative (valeur brute, bornée 0..100 pour la démo)
  const pct = v === null ? 0 : Math.max(0, Math.min(100, v));

  return (
    <div className="text-center">
      <div className="text-4xl font-bold">
        {fmtValue(v)} <span className="text-lg font-normal text-slate-400">{unit}</span>
      </div>
      <div className="mx-auto mt-3 h-2 w-4/5 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-cyan-400 transition-all duration-500"
          style={{ width: pct + '%' }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">{label}</p>
    </div>
  );
}