// Petites fonctions d'affichage partagées
export function fmtTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtValue(v) {
  if (v === null || v === undefined) return '—';
  return Number.isInteger(v) ? String(v) : Number(v).toFixed(1);
}