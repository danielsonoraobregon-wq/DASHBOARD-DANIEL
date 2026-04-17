require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { init } = require('./services/db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/webhook', require('./routes/webhook'));
app.use('/api/terrenos', require('./routes/terrenos'));
app.use('/api/stats', require('./routes/stats'));
app.get('/health', (req, res) => res.json({ status: 'ok', bot: 'TerrenosBot activo 24/7' }));

const PORT = process.env.PORT || 3000;

init().then(() => {
  app.listen(PORT, () => console.log(`🚀 TerrenosBot corriendo en puerto ${PORT}`));
}).catch(err => {
  console.error('Error iniciando DB:', err);
  process.exit(1);
});
