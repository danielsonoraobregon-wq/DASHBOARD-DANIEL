const axios = require('axios');
const { get } = require('./db');

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

// Busca a qué adset pertenece un comentario, usando el post_id guardado en la
// tabla terrenos durante sincronizarAdSets. El campo adset_name NO existe en el
// nodo de un post de la API de Meta, por eso se resuelve contra la DB local.
async function getAdSetDeComentario(postId) {
  if (!postId) return null;
  try {
    const terreno = await get(
      "SELECT adset FROM terrenos WHERE post_ids LIKE ? AND estado != 'Vendido'",
      [`%${postId}%`]
    );
    return terreno?.adset || null;
  } catch (e) {
    console.error('⚠️ getAdSetDeComentario error:', e.message);
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

      // Obtiene los post_id de los anuncios del adset para poder mapear
      // comentarios entrantes al terreno correcto.
      let postIds = '';
      try {
        const adsRes = await axios.get(`${BASE}/${adset.id}/ads`, {
          params: {
            fields: 'creative{object_story_id}',
            limit: 50,
            access_token: process.env.META_PAGE_ACCESS_TOKEN
          }
        });
        postIds = (adsRes.data.data || [])
          .map(ad => ad.creative?.object_story_id)
          .filter(Boolean)
          .join(',');
      } catch (e) {
        console.error('Error obteniendo post_ids del adset', adset.id, '—', e.response?.data?.error?.message || e.message);
      }

      if (!existe) {
        await run(
          'INSERT INTO terrenos (id,nombre,adset,estado,info,post_ids) VALUES (?,?,?,?,?,?)',
          [adset.id, adset.name, adset.id, estado, `Ad Set de ${adset.name}. Actualizado automáticamente desde Meta Ads.`, postIds]
        );
        console.log('✅ Terreno creado desde adset:', adset.name);
      } else {
        await run("UPDATE terrenos SET nombre=?, adset=?, estado=?, post_ids=? WHERE id=? AND estado NOT IN ('Vendido')",
          [adset.name, adset.id, estado, postIds, adset.id]);
      }
    }
    console.log(`🔄 Sync Meta Ads: ${adsets.length} adsets procesados`);
  } catch (e) {
    console.error('Error sincronizando adsets:', e.response?.data || e.message);
  }
}

module.exports = { responderComentario, bloquearUsuario, ocultarComentario, getAdSetDeComentario, sincronizarAdSets };
