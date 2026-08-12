// ============================================================
// YOUXIS IOT — Carte d'un device (avec son token à copier)
// ============================================================
import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function DeviceCard({ device }) {
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <Link to={`/devices/${device.id}`} className="font-semibold hover:text-cyan-300">
          {device.name}
        </Link>
        <span
          className={
            'rounded-full px-2 py-0.5 text-xs ' +
            (device.online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500')
          }
        >
          {device.online ? '● en ligne' : '○ hors ligne'}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">Type : {device.type || '—'}</p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-slate-950 px-2 py-1 text-xs text-cyan-300">
          {device.token}
        </code>
        <button
          onClick={copyToken}
          className="text-xs text-slate-400 transition-colors hover:text-white"
        >
          {copied ? '✓ Copié' : 'Copier'}
        </button>
      </div>
    </div>
  );
}