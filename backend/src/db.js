// ============================================================
// YOUXIS IOT — Connexion à la base SQLite (node:sqlite intégré)
// Aucune dépendance native : zéro installation/compilation.
// Crée le fichier de base + exécute le schéma au démarrage.
// ============================================================
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// Emplacement de la base SQLite. Par défaut : ./data/yousis.db (persistante,
// à côté du code). Peut être surchargé via DB_PATH (ex. /tmp/yousis.db sur un
// hébergeur en lecture seule).
const DB_PATH = process.env.DB_PATH || './data/yousis.db';
const absPath = path.resolve(__dirname, '..', DB_PATH);

// Crée le dossier data/ s'il n'existe pas
fs.mkdirSync(path.dirname(absPath), { recursive: true });

// Ouvre (ou crée) la base
const db = new DatabaseSync(absPath);

// Applique le schéma (CREATE TABLE IF NOT EXISTS)
const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;