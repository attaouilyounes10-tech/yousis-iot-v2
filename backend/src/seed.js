// backend/src/seed.js
// Semi-auto : au tout premier lancement du serveur, crée le compte groupe 9
// (et, S'IL N'EXISTE PAS DÉJÀ, le device « Feu intelligent » + ses datastreams).
// Idempotent : peut être relancé sans doublon. Essentiel pour un déploiement
// cloud (Railway/Render) où la base SQLite est recréée à chaque déploiement.
require('dotenv').config();
const { hashPassword } = require('./auth');
const db = require('./db');

// Configuration du device de démo « Feu intelligent » (doit refléter le
// simulateur send_data.py). Le token est fixe afin que le simulateur/ESP32
// puisse pointer dessus sans étape de création manuelle.
const DEMO_DEVICE = {
  name: 'Feu intelligent',
  type: 'esp32',
  token: process.env.DEMO_DEVICE_TOKEN || 'e0bceb90a5bb9c568b097c2fc21c0fb2',
  datastreams: [
    { key: 'value', unit: '', data_type: 'number' },
    { key: 'temperature', unit: 'degC', data_type: 'number' },
    { key: 'humidity', unit: '%', data_type: 'number' },
    { key: 'distance', unit: 'cm', data_type: 'number' },
    { key: 'feu', unit: '', data_type: 'number' },
    { key: 'pedestrian', unit: '', data_type: 'number' },
    { key: 'compteur_pietons', unit: '', data_type: 'number' },
    { key: 'mode', unit: '', data_type: 'number' },
    { key: 'duree_vert', unit: 's', data_type: 'number' },
    { key: 'bouton_pieton', unit: '', data_type: 'number' },
  ],
};

async function seed() {
  const email = process.env.ADMIN_EMAIL || 'groupe9@youis.local';
  const password = process.env.ADMIN_PASSWORD || 'Groupe92026!';

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('❌ ADMIN_EMAIL invalide dans .env');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('❌ Mot de passe trop court (min 6)');
    process.exit(1);
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  let userId;
  if (exists) {
    userId = exists.id;
    console.log(`✓ Compte déjà existant : ${email} (id=${userId})`);
  } else {
    const hash = await hashPassword(password);
    const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
    userId = Number(info.lastInsertRowid);
    console.log(`✓ Compte créé automatiquement : ${email} (id=${userId})`);
    console.log('   Mot de passe par défaut :', password);
  }

  // ---- Device de démo « Feu intelligent » (idempotent) ----
  const devRow = db.prepare('SELECT id FROM devices WHERE token = ?').get(DEMO_DEVICE.token);
  let deviceId;
  if (devRow) {
    deviceId = devRow.id;
    console.log(`✓ Device déjà existant : « ${DEMO_DEVICE.name} » (id=${deviceId}, token=${DEMO_DEVICE.token})`);
  } else {
    const info = db.prepare('INSERT INTO devices (user_id, name, type, token) VALUES (?, ?, ?, ?)')
      .run(userId, DEMO_DEVICE.name, DEMO_DEVICE.type, DEMO_DEVICE.token);
    deviceId = Number(info.lastInsertRowid);
    console.log(`✓ Device créé automatiquement : « ${DEMO_DEVICE.name} » (id=${deviceId}, token=${DEMO_DEVICE.token})`);
  }

  const dsCount = db.prepare('SELECT COUNT(*) AS n FROM datastreams WHERE device_id = ?').get(deviceId).n;
  if (dsCount === 0) {
    const stmt = db.prepare(
      'INSERT INTO datastreams (device_id, key, unit, data_type) VALUES (?, ?, ?, ?)'
    );
    for (const ds of DEMO_DEVICE.datastreams) {
      stmt.run(deviceId, ds.key, ds.unit, ds.data_type);
    }
    console.log(`✓ ${DEMO_DEVICE.datastreams.length} datastreams créés pour le device`);
  } else {
    console.log(`✓ Datastreams déjà présents (${dsCount}) pour le device`);
  }
}

seed().catch(err => {
  console.error('❌ Erreur seed :', err && err.message ? err.message : err);
  process.exit(1);
});