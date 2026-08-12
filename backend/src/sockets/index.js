// ============================================================
// YOUXIS IOT — WebSocket (socket.io)
// - Connexion sécurisée : le client envoie son JWT (handshake.auth.token)
// - Chaque utilisateur rejoint la room 'user:<id>'
// - Un intervalle surveille le statut en ligne/hors ligne des devices
// ============================================================
const { verifySocketToken } = require('../auth');
const db = require('../db');
const { isOnline } = require('../constants');

module.exports = function attachSockets(io) {
  // 1) Authentification du socket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const user = token ? verifySocketToken(token) : null;
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join('user:' + userId);

    // Abonnement facultatif à un device précis (la propriété est re-vérifiée)
    socket.on('device:subscribe', (deviceId) => {
      const owns = db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').get(Number(deviceId), userId);
      if (owns) socket.join('device:' + deviceId);
    });
    socket.on('device:unsubscribe', (deviceId) => {
      socket.leave('device:' + deviceId);
    });
  });

  // 2) Surveille et diffuse les changements de statut en ligne/hors ligne
  const lastStatus = new Map(); // deviceId -> bool
  setInterval(() => {
    const rows = db.prepare('SELECT id, last_seen_at FROM devices').all();
    const now = Date.now();
    for (const d of rows) {
      const online = isOnline(d.last_seen_at);
      if (lastStatus.get(d.id) !== online) {
        lastStatus.set(d.id, online);
        io.emit('device:status', { deviceId: d.id, online });
      }
    }
  }, 5000);
};