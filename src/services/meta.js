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

module.exports = { responderComentario, bloquearUsuario, ocultarComentario, getAdSetDeComentario };
