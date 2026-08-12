// ============================================================
// YOUXIS IOT — Sécurité : hash des mots de passe + jetons JWT
// bcryptjs (pur JS, aucune compilation) + jsonwebtoken
// ============================================================
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = process.env.JWT_SECRET || 'dev-secret-a-changer';

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: '7d' });
}

// Middleware Express : exige un JWT valide (Authorization: Bearer <token>)
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });

  try {
    const payload = jwt.verify(token, SECRET);
    req.user = { id: Number(payload.sub) };
    next();
  } catch (_) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// Vérifie un token pour socket.io (retourne l'utilisateur ou null)
function verifySocketToken(token) {
  try {
    const payload = jwt.verify(String(token || ''), SECRET);
    return { id: Number(payload.sub) };
  } catch (_) {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signToken, authRequired, verifySocketToken };