// ============================================================
// YOUXIS IOT — Routes des devices + datastreams (JWT utilisateur)
// Un device appartient à un seul utilisateur (vérifié à chaque route).
// ============================================================
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');
const { lastOf } = require('../cache');
const { isOnline } = require('../constants');
const { emitToUser } = require('../emit');

const devicesRouter = express.Router();
const datastreamsRouter = express.Router();
devicesRouter.use(authRequired);
datastreamsRouter.use(authRequired);

// ================= Doit appartenir à l'utilisateur =================
function getDeviceOr404(userId, deviceId) {
  return db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(Number(deviceId), userId);
}

function withStatus(device) {
  return { ...device, online: isOnline(device.last_seen_at) };
}

// ==== Liste des devices ====
devicesRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY id').all(req.user.id);
  res.json(rows.map(withStatus));
});

// ==== Créer un device (+ son token unique + un datastream 'value' par défaut) ====
devicesRouter.post('/', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const type = String(req.body?.type || '').trim();
  if (!name) return res.status(400).json({ error: 'Nom du device requis' });

  const token = crypto.randomBytes(16).toString('hex');
  const info = db
    .prepare('INSERT INTO devices (user_id, name, type, token) VALUES (?, ?, ?, ?)')
    .run(req.user.id, name, type || 'unknown', token);

  // Un datastream 'value' par défaut pour que le device puisse envoyer tout de suite
  db.prepare('INSERT INTO datastreams (device_id, key, unit, data_type) VALUES (?, ?, ?, ?)')
    .run(info.lastInsertRowid, 'value', '', 'number');

  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(withStatus(device));
});

// ==== Détail d'un device (+ datastreams + widgets) ====
devicesRouter.get('/:id', (req, res) => {
  const device = getDeviceOr404(req.user.id, req.params.id);
  if (!device) return res.status(404).json({ error: 'Device introuvable' });

  const datastreams = db.prepare('SELECT * FROM datastreams WHERE device_id = ? ORDER BY id').all(device.id);
  const widgets = db.prepare('SELECT * FROM widgets WHERE device_id = ? ORDER BY position').all(device.id);
  res.json(withStatus({ ...device, datastreams, widgets }));
});

// ==== Renommer / changer le type ====
devicesRouter.patch('/:id', (req, res) => {
  const device = getDeviceOr404(req.user.id, req.params.id);
  if (!device) return res.status(404).json({ error: 'Device introuvable' });

  const name = req.body?.name !== undefined ? String(req.body.name).trim() : device.name;
  const type = req.body?.type !== undefined ? String(req.body.type).trim() : device.type;
  db.prepare('UPDATE devices SET name = ?, type = ? WHERE id = ?').run(name, type, device.id);

  res.json(withStatus(db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id)));
});

// ==== Supprimer (cascade : datastreams + points + commandes + widgets) ====
devicesRouter.delete('/:id', (req, res) => {
  const device = getDeviceOr404(req.user.id, req.params.id);
  if (!device) return res.status(404).json({ error: 'Device introuvable' });
  db.prepare('DELETE FROM devices WHERE id = ?').run(device.id);
  res.status(204).end();
});

// ==== Historique des cycles du feu (JWT, vue « Cycles ») ====
devicesRouter.get('/:id/cycles', (req, res) => {
  const device = getDeviceOr404(req.user.id, req.params.id);
  if (!device) return res.status(404).json({ error: 'Device introuvable' });
  const limit = Math.min(parseInt(req.query.limit || '500', 10) || 500, 2000);
  const rows = db
    .prepare('SELECT etat, pedestrian, distance, compteur, created_at AS createdAt FROM feu_cycles WHERE device_id = ? ORDER BY id DESC LIMIT ?')
    .all(device.id, limit);
  res.json(rows.reverse());
});

// ==== Vider l'historique des cycles du feu (JWT, vue « Cycles ») ====
devicesRouter.delete('/:id/cycles', (req, res) => {
  const device = getDeviceOr404(req.user.id, req.params.id);
  if (!device) return res.status(404).json({ error: 'Device introuvable' });
  db.prepare('DELETE FROM feu_cycles WHERE device_id = ?').run(device.id);
  res.status(204).end();
});

// ==== Ajouter un datastream à un device ====
devicesRouter.post('/:id/datastreams', (req, res) => {
  const device = getDeviceOr404(req.user.id, req.params.id);
  if (!device) return res.status(404).json({ error: 'Device introuvable' });

  const key = String(req.body?.key || '').trim();
  if (!key) return res.status(400).json({ error: 'Clé du datastream requise' });

  const unit = String(req.body?.unit || '');
  const dataType = ['number', 'boolean'].includes(req.body?.data_type) ? req.body.data_type : 'number';
  const min = req.body?.min_threshold !== undefined && req.body.min_threshold !== '' ? Number(req.body.min_threshold) : null;
  const max = req.body?.max_threshold !== undefined && req.body.max_threshold !== '' ? Number(req.body.max_threshold) : null;

  try {
    const info = db
      .prepare('INSERT INTO datastreams (device_id, key, unit, data_type, min_threshold, max_threshold) VALUES (?, ?, ?, ?, ?, ?)')
      .run(device.id, key, unit, dataType, min, max);
    res.status(201).json(db.prepare('SELECT * FROM datastreams WHERE id = ?').get(info.lastInsertRowid));
  } catch (_) {
    res.status(409).json({ error: `Le datastream '${key}' existe déjà pour ce device` });
  }
});

// ==== Envoyer une commande vers un device (bouton/slider depuis le dashboard) ====
devicesRouter.post('/:id/commands', (req, res) => {
  const device = getDeviceOr404(req.user.id, req.params.id);
  if (!device) return res.status(404).json({ error: 'Device introuvable' });

  const key = String(req.body?.key || '').trim();
  const value = Number(req.body?.value);
  if (!key || !Number.isFinite(value)) {
    return res.status(400).json({ error: 'Clé et valeur numérique requises' });
  }

  const ds = db.prepare('SELECT * FROM datastreams WHERE device_id = ? AND key = ?').get(device.id, key);
  if (!ds) return res.status(404).json({ error: `Datastream '${key}' inconnu` });

  db.prepare('INSERT INTO device_commands (datastream_id, user_id, value, created_at) VALUES (?, ?, ?, ?)')
    .run(ds.id, req.user.id, value, Date.now());

  emitToUser(req.app.locals.io, req.user.id, 'command:update', {
    datastreamId: ds.id,
    value,
    createdAt: Date.now(),
  });

  res.status(201).json({ ok: true, key, value });
});

// ================= Routes datastreams =================

// Récupère un datastream en vérifiant qu'il appartient à l'utilisateur
function getDsOr404(userId, dsId) {
  return db
    .prepare('SELECT ds.* FROM datastreams ds JOIN devices d ON d.id = ds.device_id WHERE ds.id = ? AND d.user_id = ?')
    .get(Number(dsId), userId);
}

// ==== Régler les seuils d'alerte ====
datastreamsRouter.patch('/:dsId/thresholds', (req, res) => {
  const ds = getDsOr404(req.user.id, req.params.dsId);
  if (!ds) return res.status(404).json({ error: 'Datastream introuvable' });

  const min = req.body?.min !== undefined && req.body.min !== '' ? Number(req.body.min) : null;
  const max = req.body?.max !== undefined && req.body.max !== '' ? Number(req.body.max) : null;

  db.prepare('UPDATE datastreams SET min_threshold = ?, max_threshold = ? WHERE id = ?').run(min, max, ds.id);
  res.json(db.prepare('SELECT * FROM datastreams WHERE id = ?').get(ds.id));
});

// ==== Historique (points pour le graphique) ====
datastreamsRouter.get('/:dsId/history', (req, res) => {
  const ds = getDsOr404(req.user.id, req.params.dsId);
  if (!ds) return res.status(404).json({ error: 'Datastream introuvable' });

  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
  const rows = db
    .prepare('SELECT value, created_at AS createdAt FROM data_points WHERE datastream_id = ? ORDER BY id DESC LIMIT ?')
    .all(ds.id, limit);

  res.json(rows.reverse()); // du plus ancien au plus récent
});

module.exports = { devicesRouter, datastreamsRouter };