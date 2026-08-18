import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Configuration Vite + Tailwind v4
// En dev, le frontend (port 5173) renvoie /api et /socket.io
// vers le backend Express (port 3001). Ainsi tout est "same-origin".
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Permet de lire le sketch Arduino situé À LA RACINE du repo
  // (frontend/src/pages/Montage.jsx l'importe via « ../../../arduino/...?raw »).
  // '..' seul ne suffit PAS : Vite n'autorise que le 1er niveau, or l'arduino/
  // est 3 niveaux au-dessus. Sans ça, l'import ?raw échoue et FAIT PLANTER
  // TOUT le bundle en prod (écran blanc sur /feu, /montage, etc.).
  server: {
    port: 5173,
    fs: {
      // Racine du monorepo (3 niveaux au-dessus de frontend/) pour autoriser
      // la lecture de ../arduino/... depuis le code du frontend.
      allow: [path.resolve(__dirname, '..')],
    },
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});