const express = require('express');
const router = express.Router();
const axios = require('axios');
const { run, get, all } = require('../services/db');

async function getGastoMeta() {
  try {
    const token = process.env.META_ADS_TOKEN;
    const adAccount = process.env.AD_ACCOUNT_ID;
    if (!token || !adAccount) return null;
    const [hoy, semana, mes] = await Promise.all([
      axios.get(`https://graph.facebook.com/v19.0/${adAccount}/insights`, {
        params: { fields: 'spend,impressions,clicks', date_preset: 'today', access_token: token }
      }),
      axios.get(`https://graph.facebook.com/v19.0/${adAccount}/insights`, {
        params: { fields: 'spend,impressions,clicks', date_preset: 'last_7d', access_token: token }
      }),
      axios.get(`https://graph.facebook.com/v19.0/${adAccount}/insights`, {
        params: { fields: 'spend,impressions,clicks', date_preset: 'last_30d', access_token: token }
      }),
    ]);
    return {
      hoy: hoy.data.data[0] || { spend: '0', impressions: '0', clicks: '0' },
      semana: semana.data.data[0] || { spend: '0', impressions: '0', clicks: '0' },
      mes: mes.data.data[0] || { spend: '0', impressions: '0', clicks: '0' },
    };
  } catch (e) {
    console.error('Error gasto Meta:', e.response?.data || e.message);
    return null;
  }
}

router.get('/', async (req, res) => {
  const [comentarios, respondidos, bloqueados, disponibles, actividad, listaBloqueados, gasto] = await Promise.all([
    get('SELECT SUM(comentarios) as t FROM terrenos'),
    get('SELECT SUM(respondidos) as t FROM terrenos'),
    get('SELECT COUNT(*) as t FROM bloqueados'),
    get("SELECT COUNT(*) as t FROM terrenos WHERE estado = 'Disponible'"),
    all('SELECT * FROM actividad ORDER BY created_at DESC LIMIT 20'),
    all('SELECT * FROM bloqueados ORDER BY created_at DESC'),
    getGastoMeta(),
  ]);

  res.json({
    totalComentarios: comentarios.t || 0,
    totalRespondidos: respondidos.t || 0,
    totalBloqueados:  bloqueados.t || 0,
    totalDisponibles: disponibles.t || 0,
    actividad,
    bloqueados: listaBloqueados,
    gasto,
  });
});

router.delete('/bloqueados/:id', async (req, res) => {
  await run('DELETE FROM bloqueados WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
