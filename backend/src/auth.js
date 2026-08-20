// ============================================================
// YOUXIS IOT — Sécurité : hash des mots de passe + jetons JWT
// bcryptjs (pur JS, aucune compilation) + jsonwebtoken
// ============================================================
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = process.env.JWT_SECRET || 'dev-secret-a-changer';

// Utilisateur « public » utilisé quand aucun token n'est fourni (mode sans login).
// Le site est ouvert à tout le monde : un token absent ou invalide bascule sur cet
// utilisateur au lieu de renvoyer 401.
const DEFAULT_USER_ID = Number(process.env.PUBLIC_USER_ID || 1);

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: '7d' });
}

// Middleware Express : en mode sécurisé, un token JWT valide utilise son
// utilisateur, sinon on renvoie 401 (login requis).
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    try {
      const payload = jwt.verify(token, SECRET);
      const userId = Number(payload.sub);
      const db = require('./db');
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (user) {
        req.user = { id: userId, public: false };
        return next();
      }
    } catch (_) {
      /* token invalide -> on continue vers la 401 ci-dessous */
    }
  }

  // Aucun token ou token invalide -> 401 avec message clair
  res.status(401).json({ error: 'Authentification requise' });
}

// Vérifie un token pour socket.io : renvoie l'utilisateur (public par défaut si absent/invalide).
// Le site est ouvert : pas de token = utilisateur public.
function verifySocketToken(token) {
  if (!token) return { id: DEFAULT_USER_ID, public: true };
  try {
    const payload = jwt.verify(String(token), SECRET);
    const db = require('./db');
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(payload.sub));
    if (user) return { id: Number(payload.sub), public: false };
  } catch (_) {
    /* token invalide -> mode public */
  }
  return { id: DEFAULT_USER_ID, public: true };
}

module.exports = { hashPassword, verifyPassword, signToken, authRequired, verifySocketToken, DEFAULT_USER_ID };