const axios = require('axios');

const BASE = 'https://graph.facebook.com/v19.0';

async function responderComentario(comentarioId, mensaje) {
  const res = await axios.post(
    `${BASE}/${comentarioId}/replies`,
    { message: mensaje },
    { params: { access_token: process.env.META_PAGE_ACCESS_TOKEN } }
  );
  return res.data;
}

async function bloquearUsuario(usuarioId) {
  const res = await axios.post(
    `${BASE}/${process.env.META_PAGE_ID}/blocked`,
    { uid: usuarioId },
    { params: { access_token: process.env.META_PAGE_ACCESS_TOKEN } }
  );
  return res.data;
}

async function ocultarComentario(comentarioId) {
  const res = await axios.post(
    `${BASE}/${comentarioId}`,
    { is_hidden: true },
    { params: { access_token: process.env.META_PAGE_ACCESS_TOKEN } }
  );
  return res.data;
}

async function getAdSetDeComentario(postId) {
  try {
    const res = await axios.get(`${BASE}/${postId}`, {
      params: {
        fields: 'adset_name,message',
        access_token: process.env.META_PAGE_ACCESS_TOKEN
      }
    });
    return res.data.adset_name || null;
  } catch {
    return null;
  }
}

async function sincronizarAdSets(run, get) {
  try {
    const adAccountId = process.env.AD_ACCOUNT_ID;
    if (!adAccountId) return;
    const res = await axios.get(`${BASE}/${adAccountId}/adsets`, {
      params: {
        fields: 'id,name,effective_status',
        limit: 100,
        access_token: process.env.META_PAGE_ACCESS_TOKEN
      }
    });
    const adsets = res.data.data || [];
    for (const adset of adsets) {
      const existe = await get('SELECT id FROM terrenos WHERE id = ?', [adset.id]);
      const estado = adset.effective_status === 'ACTIVE' ? 'Disponible' : 'Pausado';
      if (!existe) {
        await run(
          'INSERT INTO terrenos (id,nombre,adset,estado,info) VALUES (?,?,?,?,?)',
          [adset.id, adset.name, adset.name, estado, `Ad Set de ${adset.name}. Actualizado automáticamente desde Meta Ads.`]
        );
        console.log('✅ Terreno creado desde adset:', adset.name);
      } else {
        await run('UPDATE terrenos SET nombre=?, adset=?, estado=? WHERE id=? AND estado NOT IN ("Vendido")',
          [adset.name, adset.name, estado, adset.id]);
      }
    }
    console.log(`🔄 Sync Meta Ads: ${adsets.length} adsets procesados`);
  } catch (e) {
    console.error('Error sincronizando adsets:', e.response?.data || e.message);
  }
}

module.exports = { responderComentario, bloquearUsuario, ocultarComentario, getAdSetDeComentario, sincronizarAdSets };
