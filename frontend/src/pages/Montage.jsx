// ============================================================
// YOUXIS IOT — Page « Montage » (type Wokwi)
// ------------------------------------------------------------
// Affiche le code Arduino qui tourne sur l'ESP32 + le schéma de
// câblage. Le .ino est servi depuis /public (fetch au runtime),
// pas importé via « ?raw » : cela évite tout chemin relatif fragile
// qui casse le build sur un hébergeur (Railway/Docker) où le dossier
// arduino/ n'est pas au même endroit que sur la machine de dev.
// ============================================================
import { useEffect, useState } from 'react';
import { btn, copierSansBug } from '../lib/feu.jsx';

// Schéma de câblage (image du projet) importé via Vite (optimisée au build).
import schemaImg from '../assets/schema-du-mini-projet.png';

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
  const [feuCode, setFeuCode] = useState('// Chargement du code Arduino…');

  // Le sketch est servi depuis /public/arduino/ (fichier statique), donc il
  // n'y a aucun import relatif à casser au build. Chargement au montage.
  useEffect(() => {
    let annule = false;
    fetch('/arduino/esp32_youxis_feu.ino')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
      .then((txt) => { if (!annule) setFeuCode(txt); })
      .catch(() => { if (!annule) setFeuCode('// Code Arduino indisponible.'); });
    return () => { annule = true; };
  }, []);

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
        {/* Schéma de câblage (image du projet) */}
        <div className={tile}>
          <h3 className="flex items-center gap-2 font-semibold">🔌 Schéma de câblage</h3>
          <div className="mt-4 overflow-x-auto">
            <img
              src={schemaImg}
              alt="Schéma de câblage du mini-projet (ESP32, feux, HC-SR04, bouton, buzzer)"
              className="h-auto w-full min-w-[320px] rounded-xl border border-slate-800"
            />
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
