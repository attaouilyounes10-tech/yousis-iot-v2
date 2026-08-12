// ============================================================
// YOUXIS IOT — Constantes partagées
// ============================================================

// Fenêtre (ms) au-delà de laquelle un device est considéré hors ligne
// si aucune donnée n'a été reçue.
const ONLINE_WINDOW_MS = 15000;

function isOnline(lastSeenAt) {
  return !!lastSeenAt && (Date.now() - lastSeenAt) < ONLINE_WINDOW_MS;
}

module.exports = { ONLINE_WINDOW_MS, isOnline };