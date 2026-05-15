const express = require('express');
const router = express.Router();
const axios = require('axios');
const { run, all } = require('../services/db');
const { bloquearUsuario } = require('../services/meta');

// Blacklist CRUD
router.get('/', async (req, res) => {
  const lista = await all('SELECT * FROM blacklist ORDER BY created_at DESC');
  res.json(lista);
});

router.post('/', async (req, res) => {
  const { palabra, adset } = req.body;
  if (!palabra) return res.status(400).json({ error: 'Falta palabra' });
  await run('INSERT INTO blacklist (palabra, adset) VALUES (?,?) ON CONFLICT DO NOTHING',
    [palabra.toLowerCase().trim(), adset || null]);
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  await run('DELETE FROM blacklist WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// Bloquear usuario desde dashboard
router.post('/usuarios/:userId/bloquear', async (req, res) => {
  try {
    const { nombre, plataforma } = req.body;
    await bloquearUsuario(req.params.userId);
    await run('INSERT INTO bloqueados (usuario_id,usuario_nombre,plataforma,razon) VALUES (?,?,?,?) ON CONFLICT (usuario_id) DO NOTHING',
      [req.params.userId, nombre || req.params.userId, plataforma || 'facebook', 'Bloqueado manualmente desde dashboard']);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// Comentarios de FB + IG
// Todas las llamadas a Meta se hacen EN PARALELO con timeout, para que el
// endpoint responda en ~segundos en vez de minutos (antes era secuencial y
// el frontend lo volvia a pedir antes de terminar -> bucle de "Cargando").
router.get('/comentarios', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  const GRAPH = 'https://graph.facebook.com/v19.0';
  const TIMEOUT = 8000;
  const comentarios = [];
  const errores = [];

  const getFbComments = postId => axios.get(`${GRAPH}/${postId}/comments`, {
    params: { fields: 'id,message,from{id,name},created_time,is_hidden', limit: 50, access_token: token, order: 'reverse_chronological' },
    timeout: TIMEOUT,
  });
  const getIgComments = mediaId => axios.get(`${GRAPH}/${mediaId}/comments`, {
    params: { fields: 'id,text,username,timestamp,hidden', limit: 15, access_token: token },
    timeout: TIMEOUT,
  });

  try {
    // 1. Recolectar las fuentes de posts en paralelo
    const [postsRes, terrenosRows, igAccountRes] = await Promise.all([
      axios.get(`${GRAPH}/${pageId}/published_posts`, {
        params: { fields: 'id,message,created_time,permalink_url', limit: 20, access_token: token },
        timeout: TIMEOUT,
      }).catch(e => { errores.push('posts FB: ' + e.message); return null; }),
      all("SELECT post_ids FROM terrenos WHERE post_ids IS NOT NULL AND post_ids != ''")
        .catch(e => { errores.push('db terrenos: ' + e.message); return []; }),
      axios.get(`${GRAPH}/${pageId}`, {
        params: { fields: 'instagram_business_account', access_token: token },
        timeout: TIMEOUT,
      }).catch(e => { errores.push('IG account: ' + e.message); return null; }),
    ]);

    const fbPosts = (postsRes?.data?.data || []).slice(0, 15);
    const fbPostMeta = {};
    fbPosts.forEach(p => { fbPostMeta[p.id] = p; });

    const adPostIds = [...new Set(
      terrenosRows.flatMap(t => (t.post_ids || '').split(',')).filter(Boolean)
    )];
    const allFbPostIds = [...new Set([...fbPosts.map(p => p.id), ...adPostIds])];

    let igMedia = [];
    const igId = igAccountRes?.data?.instagram_business_account?.id;
    if (igId) {
      const mediaRes = await axios.get(`${GRAPH}/${igId}/media`, {
        params: { fields: 'id,caption,timestamp,permalink', limit: 12, access_token: token },
        timeout: TIMEOUT,
      }).catch(e => { errores.push('IG media: ' + e.message); return null; });
      igMedia = (mediaRes?.data?.data || []).slice(0, 12);
    }

    // 2. Traer TODOS los comentarios en paralelo
    const [fbResults, igResults] = await Promise.all([
      Promise.allSettled(allFbPostIds.map(getFbComments)),
      Promise.allSettled(igMedia.map(m => getIgComments(m.id))),
    ]);

    // 3. Procesar resultados de Facebook
    fbResults.forEach((r, i) => {
      const postId = allFbPostIds[i];
      if (r.status !== 'fulfilled') { errores.push('FB ' + postId + ': ' + r.reason.message); return; }
      const meta = fbPostMeta[postId];
      for (const c of r.value.data.data || []) {
        comentarios.push({
          id: c.id,
          plataforma: 'facebook',
          post_id: postId,
          post_msg: meta ? (meta.message || '').slice(0, 60) : '(anuncio)',
          post_url: meta?.permalink_url || `https://www.facebook.com/${postId}`,
          mensaje: c.message,
          usuario: c.from?.name || 'Usuario',
          usuario_id: c.from?.id,
          oculto: c.is_hidden,
          created_time: c.created_time,
        });
      }
    });

    // 4. Procesar resultados de Instagram
    igResults.forEach((r, i) => {
      const media = igMedia[i];
      if (r.status !== 'fulfilled') { errores.push('IG ' + media.id + ': ' + r.reason.message); return; }
      for (const c of r.value.data.data || []) {
        comentarios.push({
          id: c.id,
          plataforma: 'instagram',
          post_id: media.id,
          post_msg: (media.caption || '').slice(0, 60),
          post_url: media.permalink || 'https://www.instagram.com/',
          mensaje: c.text,
          usuario: c.username || 'usuario',
          usuario_id: null,
          oculto: c.hidden,
          created_time: c.timestamp,
        });
      }
    });

    comentarios.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));
    if (comentarios.length === 0 && errores.length > 0) {
      return res.status(502).json({ error: 'No se pudieron obtener comentarios', detalles: errores });
    }
    res.json(comentarios.slice(0, limit));
  } catch (e) {
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// Ocultar comentario
router.post('/comentarios/:id/ocultar', async (req, res) => {
  try {
    await axios.post(`https://graph.facebook.com/v19.0/${req.params.id}`,
      { is_hidden: true },
      { params: { access_token: process.env.META_PAGE_ACCESS_TOKEN } }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// Eliminar comentario
router.delete('/comentarios/:id', async (req, res) => {
  try {
    await axios.delete(`https://graph.facebook.com/v19.0/${req.params.id}`,
      { params: { access_token: process.env.META_PAGE_ACCESS_TOKEN } }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

module.exports = router;
