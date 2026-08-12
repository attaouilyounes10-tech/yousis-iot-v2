// ============================================================
// YOUXIS IOT — Widget : SLIDER (envoie une valeur 0..100)
// ============================================================
import { useEffect, useState } from 'react';

export default function SliderWidget({ label, unit, config, value, onCommand }) {
  const min = config?.min ?? 0;
  const max = config?.max ?? 100;
  const step = config?.step ?? 1;

  const [local, setLocal] = useState(value ?? min);
  const [sending, setSending] = useState(false);

  // Resynchronisation quand la vraie valeur revient (et pas en plein envoi)
  useEffect(() => {
    if (value !== null && value !== undefined && !sending) setLocal(value);
  }, [value, sending]);

  async function change(v) {
    setLocal(v);
    setSending(true);
    try {
      await onCommand(v);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="font-bold text-cyan-300">
          {local}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        onChange={(e) => change(Number(e.target.value))}
        className="w-full accent-cyan-400"
      />
    </div>
  );
}