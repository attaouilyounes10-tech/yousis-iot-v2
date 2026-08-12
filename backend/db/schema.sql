-- ============================================================
-- YOUXIS IOT — Schéma de la base SQLite
-- Exécuté automatiquement au démarrage du serveur (db.js)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Utilisateurs (un seul rôle : simple)
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

-- Appareils : chaque device a un token unique (pour envoyer ses données)
CREATE TABLE IF NOT EXISTS devices (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT,               -- ex: 'sensor', 'relay', 'esp32'
  token        TEXT UNIQUE NOT NULL,
  last_seen_at INTEGER             -- epoch ms -> statut online/hors ligne calculé
);

-- Flux de données d'un device (1 device -> N datastreams)
CREATE TABLE IF NOT EXISTS datastreams (
  id            INTEGER PRIMARY KEY,
  device_id     INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,     -- ex: 'distance', 'feu', 'led'
  unit          TEXT DEFAULT '',
  data_type     TEXT DEFAULT 'number',  -- 'number' | 'boolean' (bouton 0/1)
  min_threshold REAL,               -- alerte si valeur < min (optionnel)
  max_threshold REAL,               -- alerte si valeur > max (optionnel)
  UNIQUE(device_id, key)
);

-- Historique des valeurs envoyées par les capteurs
CREATE TABLE IF NOT EXISTS data_points (
  id            INTEGER PRIMARY KEY,
  datastream_id INTEGER NOT NULL REFERENCES datastreams(id) ON DELETE CASCADE,
  value         REAL NOT NULL,
  created_at    INTEGER NOT NULL   -- epoch ms
);
CREATE INDEX IF NOT EXISTS idx_points_ds_time ON data_points(datastream_id, created_at DESC);

-- Commandes envoyées vers un device (actionneurs : bouton/slider)
CREATE TABLE IF NOT EXISTS device_commands (
  id            INTEGER PRIMARY KEY,
  datastream_id INTEGER NOT NULL REFERENCES datastreams(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  value         REAL NOT NULL,     -- bouton 0/1, slider 0..100
  created_at    INTEGER NOT NULL
);

-- Widgets du dashboard (chaque widget est lié à un datastream)
CREATE TABLE IF NOT EXISTS widgets (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id     INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  datastream_id INTEGER NOT NULL REFERENCES datastreams(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,     -- 'gauge' | 'chart' | 'button' | 'slider'
  label         TEXT DEFAULT '',
  config        TEXT DEFAULT '{}', -- JSON {min,max,step} pour le slider
  position      INTEGER DEFAULT 0
);
