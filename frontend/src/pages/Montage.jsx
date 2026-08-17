// ============================================================
// YOUXIS IOT — Page « Montage » (type Wokwi)
// ------------------------------------------------------------
// Affiche le code Arduino qui tourne sur l'ESP32 + le schéma de
// câblage. Le .ino est importé en texte brut via l'import Vite « ?raw »
// (aucune dépendance ajoutée, fonctionne en dev comme en prod).
// ============================================================
import { useState } from 'react';
import feuCode from '../../../arduino/esp32_youxis_feu.ino?raw';
import { btn, copierSansBug } from '../lib/feu.jsx';

const BROCHES = [
  { pin: 25, nom: 'ROUGE', role: 'Feu voitures', couleur: '#ef4444' },
  { pin: 26, nom: 'ORANGE', role: 'Feu voitures', couleur: '#f59e0b' },
  { pin: 27, nom: 'VERT', role: 'Feu voitures', couleur: '#10b981' },
  { pin: 32, nom: 'ROUGE', role: 'Feu piétons', couleur: '#ef4444' },
  { pin: 33, nom: 'VERT', role: 'Feu piétons', couleur: '#10b981' },
  { pin: 14, nom: 'BOUTON', role: 'Poussoir (pull-up)', couleur: '#22d3ee' },
  { pin: 4, nom: 'TRIG', role: 'HC-SR04 (ultrason)', couleur: '#a78bfa' },
  { pin: 35, nom: 'ECHO', role: 'HC-SR04 (ultrason)', couleur: '#a78bfa' },
  { pin: 12, nom: 'BUZZER', role: 'Buzzer piéton', couleur: '#f43f5e' },
];

const tile = 'rounded-3xl border border-slate-800 bg-slate-900/70 p-6';

export default function Montage() {
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(true);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">🔧 Montage &amp; code</h2>
        <button onClick={() => copierSansBug(feuCode, setCopied)} className={`${btn} bg-slate-800 hover:bg-slate-700`}>
          {copied ? '✓ Code copié' : '📋 Copier le code'}
        </button>
      </div>

      <p className="mb-5 text-sm text-slate-400">
        Câblage et programme de l'ESP32 « Feu intelligent ». Le sketch mesure la distance (HC-SR04),
        comptabilise les passages piétons, lit les commandes du tableau de bord et pilote le feu tricolore.
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Schéma de câblage */}
        <div className={tile}>
          <h3 className="flex items-center gap-2 font-semibold">🔌 Schéma de câblage</h3>
          <div className="mt-4 overflow-x-auto">
            <svg viewBox="0 0 520 360" className="h-auto w-full min-w-[460px]" role="img" aria-label="Schéma de câblage ESP32">
              {/* ESP32 */}
              <rect x="200" y="120" width="120" height="150" rx="10" fill="#0f172a" stroke="#334155" strokeWidth="2" />
              <text x="260" y="112" textAnchor="middle" fill="#22d3ee" fontSize="13" fontWeight="700">ESP32</text>
              {/* Broches ESP32 (gauche) */}
              {[0, 1, 2, 3, 4].map((i) => (
                <g key={`lg${i}`}>
                  <circle cx="200" cy={150 + i * 28} r="4" fill="#64748b" />
                </g>
              ))}
              {/* Broches ESP32 (droite) */}
              {[0, 1, 2, 3, 4].map((i) => (
                <g key={`ld${i}`}>
                  <circle cx="320" cy={150 + i * 28} r="4" fill="#64748b" />
                </g>
              ))}

              {/* Feu voitures (gauche) */}
              <rect x="20" y="40" width="120" height="70" rx="10" fill="#1e293b" stroke="#334155" />
              <text x="80" y="34" textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="700">FEU VOITURES</text>
              <circle cx="48" cy="62" r="9" fill="#ef4444" />
              <circle cx="80" cy="62" r="9" fill="#f59e0b" />
              <circle cx="112" cy="62" r="9" fill="#10b981" />
              <text x="80" y="92" textAnchor="middle" fill="#94a3b8" fontSize="9">25 · 26 · 27</text>
              <line x1="48" y1="71" x2="200" y2="150" stroke="#ef4444" strokeWidth="2" />
              <line x1="80" y1="71" x2="200" y2="178" stroke="#f59e0b" strokeWidth="2" />
              <line x1="112" y1="71" x2="200" y2="206" stroke="#10b981" strokeWidth="2" />

              {/* Feu piétons (haut gauche) */}
              <rect x="20" y="150" width="120" height="60" rx="10" fill="#1e293b" stroke="#334155" />
              <text x="80" y="144" textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="700">FEU PIÉTONS</text>
              <circle cx="64" cy="172" r="9" fill="#ef4444" />
              <circle cx="96" cy="172" r="9" fill="#10b981" />
              <text x="80" y="200" textAnchor="middle" fill="#94a3b8" fontSize="9">32 · 33</text>
              <line x1="64" y1="181" x2="200" y2="234" stroke="#ef4444" strokeWidth="2" />
              <line x1="96" y1="181" x2="200" y2="262" stroke="#10b981" strokeWidth="2" />

              {/* Bouton (bas gauche) */}
              <rect x="20" y="250" width="120" height="50" rx="10" fill="#1e293b" stroke="#334155" />
              <text x="80" y="244" textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="700">BOUTON</text>
              <circle cx="80" cy="272" r="10" fill="#22d3ee" />
              <text x="80" y="296" textAnchor="middle" fill="#94a3b8" fontSize="9">GPIO 14 (pull-up)</text>
              <line x1="80" y1="262" x2="200" y2="290" stroke="#22d3ee" strokeWidth="2" />

              {/* HC-SR04 (droite) */}
              <rect x="380" y="40" width="120" height="70" rx="10" fill="#1e293b" stroke="#334155" />
              <text x="440" y="34" textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="700">HC-SR04</text>
              <circle cx="412" cy="62" r="9" fill="#a78bfa" />
              <circle cx="468" cy="62" r="9" fill="#a78bfa" />
              <text x="440" y="92" textAnchor="middle" fill="#94a3b8" fontSize="9">TRIG 4 · ECHO 35</text>
              <line x1="412" y1="71" x2="320" y2="150" stroke="#a78bfa" strokeWidth="2" />
              <line x1="468" y1="71" x2="320" y2="178" stroke="#a78bfa" strokeWidth="2" />

              {/* Buzzer (droite bas) */}
              <rect x="380" y="150" width="120" height="50" rx="10" fill="#1e293b" stroke="#334155" />
              <text x="440" y="144" textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="700">BUZZER</text>
              <circle cx="440" cy="172" r="11" fill="#f43f5e" />
              <text x="440" y="196" textAnchor="middle" fill="#94a3b8" fontSize="9">GPIO 12</text>
              <line x1="440" y1="183" x2="320" y2="234" stroke="#f43f5e" strokeWidth="2" />
            </svg>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3">Broche</th>
                  <th className="py-2 pr-3">Composant</th>
                  <th className="py-2">Rôle</th>
                </tr>
              </thead>
              <tbody>
                {BROCHES.map((b) => (
                  <tr key={b.pin} className="border-t border-slate-800">
                    <td className="py-2 pr-3">
                      <span className="inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: b.couleur }} />{' '}
                      <span className="font-mono text-slate-200">GPIO {b.pin}</span>
                    </td>
                    <td className="py-2 pr-3 font-medium text-slate-300">{b.nom}</td>
                    <td className="py-2 text-slate-400">{b.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Code Arduino */}
        <div className={tile}>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">⚙️ Code Arduino (.ino)</h3>
            <button onClick={() => setShowCode((s) => !s)} className={`${btn} bg-slate-800 hover:bg-slate-700`}>
              {showCode ? 'Masquer' : 'Afficher'}
            </button>
          </div>
          {showCode && (
            <pre className="mt-4 max-h-[460px] overflow-auto rounded-xl bg-slate-950 p-4 text-[12px] leading-relaxed text-slate-300">
              <code>{feuCode}</code>
            </pre>
          )}
          <p className="mt-3 text-[11px] text-slate-500">
            À adapter dans le sketch : <code className="text-cyan-300">WIFI_SSID</code>,{' '}
            <code className="text-cyan-300">WIFI_PASS</code>,{' '}
            <code className="text-cyan-300">BACKEND_HOST</code> et{' '}
            <code className="text-cyan-300">DEVICE_TOKEN</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
