// ============================================================
// YOUXIS IOT — Client WebSocket (socket.io)
// Se connecte sur le même hôte (le proxy Vite renvoie /socket.io
// vers le backend en dev ; en prod, même serveur).
// En mode « sans login », on passe token=null : le backend bascule sur
// l'utilisateur public et diffuse les données de tous les devices.
// ============================================================
import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(token) {
  if (socket) socket.disconnect();
  socket = io({ auth: { token: token || null } });
  return socket;
}

export function getSocket() {
  return socket;
}