// ============================================================
// YOUXIS IOT — Client WebSocket (socket.io)
// Se connecte sur le même hôte (le proxy Vite renvoie /socket.io
// vers le backend en dev ; en prod, même serveur).
// ============================================================
import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(token) {
  if (socket) socket.disconnect();
  socket = io({ auth: { token } });
  return socket;
}

export function getSocket() {
  return socket;
}