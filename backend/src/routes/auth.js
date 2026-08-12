// ============================================================
// YOUXIS IOT — Routes d'authentification
// ============================================================
const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, signToken, authRequired } = require('../auth');

const router = express.Router();

function sanitizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

// Inscription
router.post('/register', async (req, res) => {
  const email = sanitizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) {
    return res.status(409).json({ error: 'Cet email est déjà utilisé' });
  }

  const hash = await hashPassword(password);
  const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
  const token = signToken(info.lastInsertRowid);

  res.status(201).json({ token, user: { id: Number(info.lastInsertRowid), email } });
});

// Connexion
router.post('/login', async (req, res) => {
  const email = sanitizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }

  res.json({ token: signToken(row.id), user: { id: row.id, email: row.email } });
});

// Infos de l'utilisateur connecté
router.get('/me', authRequired, (req, res) => {
  const row = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ user: row });
});

module.exports = router;