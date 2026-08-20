// ============================================================
// YOUXIS IOT — Serveur principal (Express + WebSocket)
// Lancement : npm run dev      (dossier backend/)
// Port : 3001
// ============================================================
require('dotenv').config();
const path = require('path');
const http = require('http');
const os = require('os');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

// Initialise la base + compte utilisateur (seed auto)
require('./db');
require('./seed');

// Origines autorisées pour l'API device (appelée par le simulateur / ESP32
// depuis une autre machine). Le frontend lui-même est servi en same-origin par
// ce backend, donc le CORS le concerne peu. Par défaut on autorise tout (`*`)
// — l'API device est protégée par token, pas par cookie/session.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : '*';

const app = express();
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ===== Routes (ordre : l'API device token avant le CRUD JWT) =====
app.use('/api', require('./routes/deviceApi'));               // POST /api/data, latest, history
app.use('/api/auth', require('./routes/auth'));               // register / login / me
app.use('/api/devices', require('./routes/devices').devicesRouter);
app.use('/api/datastreams', require('./routes/devices').datastreamsRouter);
app.use('/api/widgets', require('./routes/widgets'));

// ===== En production : sert aussi le build frontend sur le même port =====
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(dist));

// Routage SPA : toute URL GET inconnue (non-API) → index.html du build.
// Nécessaire pour react-router quand on ouvre http://<IP>:3001/feu directement
// (à partir de l'iPhone ou d'un autre PC du réseau local).
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(dist, 'index.html'), (err) => {
    if (err) next(); // build absent → Express renvoie son 404 normal
  });
});

// ===== Gestionnaire d'erreurs global (affiche le vrai message au client) =====
// Sans ça, toute exception non gérée dans une route renvoie un 500 muet.
app.use((err, req, res, next) => {
  console.error('❌ ERREUR NON GÉRÉE :', err && err.stack ? err.stack : err);
  res.status(500).json({
    error: 'Erreur serveur',
    message: err && err.message ? err.message : String(err),
  });
});

// ===== WebSocket =====
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: allowedOrigins } });
app.locals.io = io;
require('./sockets')(io);

// ===== Démarrage =====
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  YOUXIS IOT — backend prêt !             ║');
  console.log(`║  API + WebSocket : http://localhost:${PORT} ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('Devices : POST /api/data avec en-tête X-Device-Token');
  const ips = adressesIp();
  if (ips.length) {
    console.log(`📱 Réseau local (même WiFi) : http://${ips.join('  ·  http://')}:${PORT}`);
  }
});

// Liste les adresses IPv4 locales (pour accéder à l'app depuis l'iPhone/PC du même WiFi)
function adressesIp() {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}