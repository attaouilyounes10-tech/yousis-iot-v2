// ============================================================
// YOUXIS IOT — Émissions WebSocket
// Le serveur décide qui reçoit quoi (jamais le client).
// Chaque utilisateur est dans la room 'user:<id>'.
// Le site est « ouvert à tout le monde » : les données d'un device sont
// diffusées à son propriétaire ET à l'utilisateur public, afin qu'un
// visiteur non connecté (socket en mode public, room 'user:<DEFAULT_USER_ID>')
// voie quand même les feux / compteurs en temps réel.
// ============================================================
const { DEFAULT_USER_ID } = require('./auth');

function emitToUser(io, userId, event, payload) {
  io.to('user:' + userId).emit(event, payload);
  // Diffusion supplémentaire vers la room publique (sauf si le destinataire
  // est déjà le public) : garantit que n'importe quel visiteur voit les données.
  if (userId !== DEFAULT_USER_ID) {
    io.to('user:' + DEFAULT_USER_ID).emit(event, payload);
  }
}

module.exports = { emitToUser };