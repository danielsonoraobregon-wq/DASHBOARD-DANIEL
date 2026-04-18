require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { init, run, get } = require('./services/db');
const { sincronizarAdSets } = require('./services/meta');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/webhook', require('./routes/webhook'));
app.use('/api/terrenos', require('./routes/terrenos'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/blacklist', require('./routes/blacklist'));
app.use('/api/analizar', require('./routes/analizar'));
app.get('/health', (req, res) => res.json({ status: 'ok', bot: 'TerrenosBot activo 24/7' }));

app.get('/sync', async (req, res) => {
  if (req.query.secret !== 'daniel2024') return res.status(403).json({ error: 'No autorizado' });
  try {
    const { all } = require('./services/db');
    await run("DELETE FROM terrenos WHERE id IN ('1','2','3')");
    await sincronizarAdSets(run, get);
    const terrenos = await all('SELECT * FROM terrenos');
    res.json({ ok: true, terrenos: terrenos.length, data: terrenos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;

// Escuchar ANTES de init() para que el healthcheck de Railway responda inmediato
app.listen(PORT, () => {
  console.log(`🚀 TerrenosBot corriendo en puerto ${PORT}`);
  init().then(() => {
    console.log('✅ DB conectada');
    sincronizarAdSets(run, get);
    setInterval(() => sincronizarAdSets(run, get), 3600000);
  }).catch(err => {
    console.error('Error DB:', err.message);
  });
});
