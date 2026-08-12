// ============================================================
// YOUXIS IOT — Cache mémoire des dernières valeurs
// Évite de re-requêter la BDD à chaque rafraîchissement de jauge.
// ============================================================
const db = require('./db');

const lastByDatastream = new Map(); // datastreamId -> { value, createdAt }

function remember(dsId, value, createdAt) {
  lastByDatastream.set(dsId, { value, createdAt });
}

// Dernière valeur connue d'un datastream (cache, sinon BDD)
function lastOf(dsId) {
  const cached = lastByDatastream.get(dsId);
  if (cached) return cached;

  const row = db
    .prepare('SELECT value, created_at AS createdAt FROM data_points WHERE datastream_id = ? ORDER BY id DESC LIMIT 1')
    .get(dsId);
  if (row) {
    const val = { value: row.value, createdAt: row.createdAt };
    lastByDatastream.set(dsId, val);
    return val;
  }
  return null;
}

module.exports = { remember, lastOf };