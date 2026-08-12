// ============================================================
// YOUXIS IOT — Émissions WebSocket
// Le serveur décide qui reçoit quoi (jamais le client).
// Chaque utilisateur est dans la room 'user:<id>'.
// ============================================================

function emitToUser(io, userId, event, payload) {
  io.to('user:' + userId).emit(event, payload);
}

module.exports = { emitToUser };