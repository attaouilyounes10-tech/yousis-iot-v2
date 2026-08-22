// ============================================================
// YOUXIS IOT — Helpers partagés du feu intelligent
// Réutilisés par les pages « Feu » (visionnage) et « TableauDeBord »
// (commandes). Centralise la convention d'état pour éviter les
// divergences entre les pages, le simulateur et l'Arduino.
//
// Convention :
//   feu   : 0=vert · 1=orange · 2=rouge · 3=maintenance
//   mode  : 0=auto · 1=vert forcé · 2=rouge forcé · 3=maintenance
// ============================================================
import { fmtTime } from './format.js';

// Seuil de détection piéton (doit suivre --seuil du simulateur par défaut)
export const SEUIL_DEFAUT = 80;

// Plage réelle d'un capteur ultrasonique HC-SR04 (en cm).
// Sert de cadre au domaine Y du graphe de distance : le minimum est fermement
// borné à la limite basse physique du capteur (≈ 2 cm), le maximum à sa portée
// fiable en conditions réelles (≈ 250 cm, au-delà les mesures sont peu fiables).
export const CAPTEUR_ULTRASON_MIN = 0;    // limite basse de l'échelle (le capteur ne descend pas sous ~2 cm)
export const CAPTEUR_ULTRASON_MAX = 250;  // portée fiable réaliste d'un HC-SR04
export const CAPTEUR_MARGE_CM = 15;       // marge autour des valeurs détectées

// Descriptif de chaque état du feu (voitures)
export const FEU_INFO = {
  0: { label: 'Feu vert — les voitures roulent',   cls: 'text-emerald-300', lamp: 'vert' },
  1: { label: 'Feu orange — les voitures s’arrêtent', cls: 'text-amber-300',  lamp: 'orange' },
  2: { label: 'Feu rouge — le piéton traverse',    cls: 'text-red-300',     lamp: 'rouge' },
  3: { label: '🔧 Feu en maintenance',             cls: 'text-amber-300',   lamp: 'maintenance' },
};

// Boutons du mode système (commandés depuis le tableau de bord)
export const MODE_BTNS = [
  { v: 0, label: 'Auto',        active: 'bg-cyan-500 text-slate-950' },
  { v: 1, label: 'Vert forcé',  active: 'bg-emerald-500 text-slate-950' },
  { v: 2, label: 'Rouge forcé', active: 'bg-red-500 text-slate-950' },
  { v: 3, label: 'Maintenance', active: 'bg-amber-500 text-slate-950' },
];

// Couleur du texte d'un événement du journal
export const toneCls = {
  danger: 'text-red-300',
  rouge: 'text-red-300',
  orange: 'text-amber-300',
  ok: 'text-emerald-300',
  vert: 'text-emerald-300',
  maint: 'text-amber-300',
};

export const btn = 'rounded-xl px-4 py-2 text-sm font-semibold transition-colors';

/** Copie du texte sans casser sur les connexions http:// (iPhone) : fallback execCommand. */
export async function copierSansBug(text, setCopied) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
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
    /* ignore : la copie reste impossible sur cette origine */
  }
}

/** Une lampe de feu tricolore (allumée avec un halo, sinon éteinte).
 *  `color='maintenance'` → clignote en orange (animée). */
export function Lamp({ on, color, icon }) {
  const colors = {
    rouge:  'border-red-400 bg-red-500 shadow-[0_0_26px_rgba(239,68,68,0.9)]',
    orange: 'border-amber-400 bg-amber-500 shadow-[0_0_26px_rgba(245,158,11,0.9)]',
    vert:   'border-emerald-400 bg-emerald-500 shadow-[0_0_26px_rgba(16,185,129,0.9)]',
    maintenance: 'border-amber-400 bg-amber-500 animate-pulse shadow-[0_0_26px_rgba(245,158,11,0.9)]',
  };
  const styled = 'flex h-14 w-14 items-center justify-center rounded-full border-2 text-xl transition-all duration-300 sm:h-16 sm:w-16 sm:text-2xl ' +
    (on ? colors[color] || colors.rouge : 'border-slate-700 bg-slate-950 text-slate-700');
  return <div className={styled}>{on ? icon : ''}</div>;
}

/** Libellé « maintenant » formaté pour les journaux. */
export function nowLabel() {
  return fmtTime(Date.now());
}
