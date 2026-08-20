// backend/src/seed.js
// Semi-auto : au tout premier lancement du serveur, crée le compte groupe 9
// s'il n'existe pas déjà. Lancez avec : node src/seed.js  (ou ajoutez le
// call dans server.js ci-dessous).
require('dotenv').config();
const { hashPassword } = require('./auth');
const db = require('./db');

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
  if (exists) {
    console.log(`✓ Compte déjà existant : ${email} (id=${exists.id})`);
    return;
  }

  const hash = await hashPassword(password);
  const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
  console.log(`✓ Compte créé automatiquement : ${email} (id=${info.lastInsertRowid})`);
  console.log('   Mot de passe par défaut :', password);
}

seed().catch(err => {
  console.error('❌ Erreur seed :', err && err.message ? err.message : err);
  process.exit(1);
});