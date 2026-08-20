// ============================================================
// YOUXIS IOT — Routes des widgets du dashboard (JWT utilisateur)
// ============================================================
const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');
const { lastOf } = require('../cache');

const router = express.Router();
router.use(authRequired);

const TYPES = ['gauge', 'chart', 'button', 'slider'];

function safeJson(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch (_) {
    return {};
  }
}

// Un widget + les infos utiles (device, datastream) — visible par tous (sans login)
function getWidget(req) {
  return db
    .prepare(
      `SELECT w.*, d.name AS device_name, ds.key AS ds_key, ds.unit, ds.data_type
       FROM widgets w
       JOIN devices d    ON d.id  = w.device_id
       JOIN datastreams ds ON ds.id = w.datastream_id
       WHERE w.id = ?`
    )
    .get(Number(req.params.id));
}

// ==== Liste des widgets (+ dernière valeur connue) ====
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT w.*, d.name AS device_name, ds.key AS ds_key, ds.unit, ds.data_type
       FROM widgets w
       JOIN devices d    ON d.id  = w.device_id
       JOIN datastreams ds ON ds.id = w.datastream_id
       ORDER BY w.position, w.id`
    )
    .all();

  res.json(rows.map((w) => ({ ...w, config: safeJson(w.config), last: lastOf(w.datastream_id) })));
});

// ==== Créer un widget ====
router.post('/', (req, res) => {
  const { device_id, datastream_id, type, label, config } = req.body || {};
  if (!TYPES.includes(type)) {
    return res.status(400).json({ error: `Type de widget invalide (${TYPES.join(', ')})` });
  }

  // Le datastream doit exister (sans login : tous les datastreams sont accessibles)
  const ds = db
    .prepare(
      'SELECT ds.* FROM datastreams ds JOIN devices d ON d.id = ds.device_id WHERE ds.id = ?'
    )
    .get(Number(datastream_id));
  if (!ds) return res.status(400).json({ error: 'Datastream introuvable' });

  // … et correspondre au device choisi
  if (Number(device_id) !== ds.device_id) {
    return res.status(400).json({ error: 'Le datastream n\'appartient pas à ce device' });
  }

  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM widgets WHERE user_id = ?').get(req.user.id).p;

  const info = db
    .prepare(
      'INSERT INTO widgets (user_id, device_id, datastream_id, type, label, config, position) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(req.user.id, ds.device_id, ds.id, type, String(label || ''), JSON.stringify(config || {}), pos);

  req.params.id = info.lastInsertRowid;
  res.status(201).json(getWidget(req));
});

// ==== Modifier un widget ====
router.patch('/:id', (req, res) => {
  const widget = getWidget(req);
  if (!widget) return res.status(404).json({ error: 'Widget introuvable' });

  const label = req.body?.label !== undefined ? String(req.body.label) : widget.label;
  const config = req.body?.config !== undefined ? JSON.stringify(req.body.config) : widget.config;

  db.prepare('UPDATE widgets SET label = ?, config = ? WHERE id = ?').run(label, config, widget.id);
  res.json(getWidget(req));
});

// ==== Supprimer un widget ====
router.delete('/:id', (req, res) => {
  const widget = getWidget(req);
  if (!widget) return res.status(404).json({ error: 'Widget introuvable' });
  db.prepare('DELETE FROM widgets WHERE id = ?').run(widget.id);
  res.status(204).end();
});

module.exports = router;