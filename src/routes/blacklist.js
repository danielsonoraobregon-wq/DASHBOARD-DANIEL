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
router.get('/comentarios', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  try {
    const token = process.env.META_PAGE_ACCESS_TOKEN;
    const pageId = process.env.META_PAGE_ID;
    const comentarios = [];

    // Facebook posts
    try {
      const postsRes = await axios.get(`https://graph.facebook.com/v19.0/${pageId}/posts`, {
        params: { fields: 'id,message,created_time,permalink_url', limit: 10, access_token: token }
      });
      for (const post of (postsRes.data.data || []).slice(0, 5)) {
        try {
          const commRes = await axios.get(`https://graph.facebook.com/v19.0/${post.id}/comments`, {
            params: { fields: 'id,message,from{id,name},created_time,is_hidden', limit: 20, access_token: token }
          });
          for (const c of commRes.data.data || []) {
            comentarios.push({
              id: c.id,
              plataforma: 'facebook',
              post_id: post.id,
              post_msg: (post.message || '').slice(0, 60),
              post_url: post.permalink_url || `https://www.facebook.com/${post.id}`,
              mensaje: c.message,
              usuario: c.from?.name || 'Usuario',
              usuario_id: c.from?.id,
              oculto: c.is_hidden,
              created_time: c.created_time,
            });
          }
        } catch {}
      }
    } catch {}

    // Instagram posts
    try {
      const igPageRes = await axios.get(`https://graph.facebook.com/v19.0/${pageId}`, {
        params: { fields: 'instagram_business_account', access_token: token }
      });
      const igId = igPageRes.data.instagram_business_account?.id;
      if (igId) {
        const mediaRes = await axios.get(`https://graph.facebook.com/v19.0/${igId}/media`, {
          params: { fields: 'id,caption,timestamp,permalink', limit: 5, access_token: token }
        });
        for (const media of (mediaRes.data.data || []).slice(0, 4)) {
          try {
            const commRes = await axios.get(`https://graph.facebook.com/v19.0/${media.id}/comments`, {
              params: { fields: 'id,text,username,timestamp,hidden', limit: 15, access_token: token }
            });
            for (const c of commRes.data.data || []) {
              comentarios.push({
                id: c.id,
                plataforma: 'instagram',
                post_id: media.id,
                post_msg: (media.caption || '').slice(0, 60),
                post_url: media.permalink || `https://www.instagram.com/`,
                mensaje: c.text,
                usuario: c.username || 'usuario',
                usuario_id: null,
                oculto: c.hidden,
                created_time: c.timestamp,
              });
            }
          } catch {}
        }
      }
    } catch {}

    comentarios.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));
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
