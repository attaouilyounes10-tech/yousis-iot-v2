import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Configuration Vite + Tailwind v4
// En dev, le frontend (port 5173) renvoie /api et /socket.io
// vers le backend Express (port 3001). Ainsi tout est "same-origin".
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Permet de lire le sketch Arduino situé À LA RACINE du repo
  // (frontend/src/pages/Montage.jsx l'importe via « ../../../arduino/...?raw »).
  server: {
    port: 5173,
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});