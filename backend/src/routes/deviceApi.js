// ============================================================
// YOUXIS IOT — API des appareils (authentification par TOKEN)
// C'est ce que le simulateur Python ou un vrai ESP32 appelle :
//
//   POST /api/data              en-tête: X-Device-Token
//   GET  /api/devices/:token/latest
//   GET  /api/devices/:token/history?key=&limit=
//
// Pas de JWT ici : le device s'identifie par son token unique.
// ============================================================
const express = require('express');
const db = require('../db');
const { remember, lastOf } = require('../cache');
const { isOnline } = require('../constants');
const { emitToUser } = require('../emit');

const router = express.Router();

function deviceFromToken(req) {
  const token = req.headers['x-device-token'];
  if (!token) return null;
  return db.prepare('SELECT * FROM devices WHERE token = ?').get(token);
}

// Vérifie les seuils d'un datastream ; renvoie un objet d'alerte ou null
function thresholdAlert(ds, value) {
  if (ds.max_threshold !== null && ds.max_threshold !== undefined && value > ds.max_threshold) {
    return { threshold: ds.max_threshold, message: `${ds.key} dépasse ${ds.max_threshold}${ds.unit ? ' ' + ds.unit : ''}` };
  }
  if (ds.min_threshold !== null && ds.min_threshold !== undefined && value < ds.min_threshold) {
    return { threshold: ds.min_threshold, message: `${ds.key} passe sous ${ds.min_threshold}${ds.unit ? ' ' + ds.unit : ''}` };
  }
  return null;
}

// ==== Réception d'une valeur de capteur (appelée par le device) ====
router.post('/data', (req, res) => {
  const device = deviceFromToken(req);
  if (!device) return res.status(401).json({ error: 'Token device invalide' });

  const key = String(req.body?.key || '').trim();
  const value = Number(req.body?.value);
  if (!key || !Number.isFinite(value)) {
    return res.status(400).json({ error: 'Champs "key" et "value" (numérique) requis' });
  }

  const ds = db.prepare('SELECT * FROM datastreams WHERE device_id = ? AND key = ?').get(device.id, key);
  if (!ds) return res.status(404).json({ error: `Datastream '${key}' inconnu pour ce device` });

  const now = Date.now();

  // 1) Sauvegarde + cache + dernière activité
  db.prepare('INSERT INTO data_points (datastream_id, value, created_at) VALUES (?, ?, ?)').run(ds.id, value, now);
  db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now, device.id);
  remember(ds.id, value, now);

  // 2) Diffusion temps réel à l'utilisateur propriétaire et au device
  const io = req.app.locals.io;
  const payload = { datastreamId: ds.id, deviceId: device.id, value, createdAt: now };
  emitToUser(io, device.user_id, 'data:update', payload);

  // 3) Alerte si un seuil est dépassé
  const alert = thresholdAlert(ds, value);
  if (alert) {
    emitToUser(io, device.user_id, 'alert', { datastreamId: ds.id, value, ...alert });
  }

  res.status(201).json({ ok: true, key, value });
});

// ==== Dernier état de chaque datastream (pour un device qui "pulls") ====
router.get('/devices/:token/latest', (req, res) => {
  const device = db.prepare('SELECT * FROM devices WHERE token = ?').get(req.params.token);
  if (!device) return res.status(404).json({ error: 'Device introuvable' });

  const streams = db.prepare('SELECT * FROM datastreams WHERE device_id = ? ORDER BY id').all(device.id);
  const datastreams = streams.map((s) => {
    const last = lastOf(s.id);
    // Pour une sortie (ex: led), la valeur à renvoyer est la dernière commande reçue
    const cmd = db.prepare('SELECT value FROM device_commands WHERE datastream_id = ? ORDER BY id DESC LIMIT 1').get(s.id);
    return {
      key: s.key,
      unit: s.unit,
      data_type: s.data_type,
      value: cmd ? cmd.value : last ? last.value : null,
      lastSeenAt: last ? last.createdAt : null,
      online: isOnline(device.last_seen_at),
    };
  });

  res.json({ device: { id: device.id, name: device.name, type: device.type }, datastreams });
});

// ==== Historique d'un datastream (pour un device) ====
router.get('/devices/:token/history', (req, res) => {
  const device = db.prepare('SELECT * FROM devices WHERE token = ?').get(req.params.token);
  if (!device) return res.status(404).json({ error: 'Device introuvable' });

  const key = String(req.query.key || '').trim();
  const ds = db.prepare('SELECT * FROM datastreams WHERE device_id = ? AND key = ?').get(device.id, key);
  if (!ds) return res.status(404).json({ error: 'Datastream inconnu' });

  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
  const rows = db
    .prepare('SELECT value, created_at AS createdAt FROM data_points WHERE datastream_id = ? ORDER BY id DESC LIMIT ?')
    .all(ds.id, limit);

  res.json(rows.reverse());
});

module.exports = router;