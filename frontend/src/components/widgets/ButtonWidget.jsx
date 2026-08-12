// ============================================================
// YOUXIS IOT — Widget : BOUTON ON/OFF (pilote un actionneur)
// Envoie 1 ou 0 vers le datastream via l'API commande.
// ============================================================
import { useEffect, useState } from 'react';

export default function ButtonWidget({ label, value, onCommand }) {
  const isOn = !!value;
  const [optimistic, setOptimistic] = useState(null);
  const shown = optimistic !== null ? optimistic : isOn;

  // Dès que la vraie valeur revient (WebSocket), on resynchronise
  useEffect(() => {
    setOptimistic(null);
  }, [value]);

  function toggle() {
    const next = !shown;
    setOptimistic(next); // mise à jour immédiate (optimiste)
    onCommand(next ? 1 : 0);
  }

  return (
    <button
      onClick={toggle}
      className={
        'w-full rounded-lg px-4 py-3 font-semibold transition-colors ' +
        (shown
          ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
          : 'bg-slate-800 text-slate-300 hover:bg-slate-700')
      }
    >
      {label} : {shown ? 'ON' : 'OFF'}
    </button>
  );
}