// Script de debug local : reproduit POST /api/devices comme le frontend.
process.env.DB_PATH = './_debug_yousis.db';
process.env.PORT = '3099';

const { createServer } = require('http');
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

require('./backend/src/db'); // init DB
app.use('/api/auth', require('./backend/src/routes/auth'));
app.use('/api/devices', require('./backend/src/routes/devices').devicesRouter);
app.use('/api/datastreams', require('./backend/src/routes/devices').datastreamsRouter);

const server = createServer(app);
server.listen(3099, async () => {
  const base = 'http://localhost:3099';
  try {
    // 1) register
    const r1 = await fetch(base + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'debug' + Date.now() + '@test.com', password: 'secret1' }),
    });
    const j1 = await r1.json();
    console.log('REGISTER', r1.status, JSON.stringify(j1));
    const token = j1.token;
    if (!token) { console.log('PAS DE TOKEN, arret'); process.exit(1); }

    // 2) create device (comme le frontend)
    const r2 = await fetch(base + '/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ name: 'Feu intelligent', type: 'esp32' }),
    });
    const t2 = await r2.text();
    console.log('CREATE DEVICE', r2.status, t2);

    let dId = null;
    try { dId = JSON.parse(t2).id; } catch (_) {}
    if (dId) {
      for (const ds of [
        { key: 'distance', unit: 'cm' },
        { key: 'pedestrian', unit: '', data_type: 'boolean' },
        { key: 'feu', unit: '', data_type: 'number' },
        { key: 'duree_vert', unit: 's' },
        { key: 'mode', unit: '' },
        { key: 'bouton_pieton', unit: '' },
        { key: 'compteur_pietons', unit: '' },
      ]) {
        const r3 = await fetch(base + '/api/devices/' + dId + '/datastreams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify(ds),
        });
        console.log('ADD DATASTREAM', JSON.stringify(ds), r3.status, await r3.text());
      }
    }
    console.log('DEBUG TERMINE OK');
  } catch (e) {
    console.log('EXCEPTION SCRIPT', e && e.stack ? e.stack : e);
  } finally {
    server.close();
    process.exit(0);
  }
});
