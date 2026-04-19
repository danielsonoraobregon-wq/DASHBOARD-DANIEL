const express = require('express');
const router = express.Router();
const { run, get, all } = require('../services/db');
const { generarRespuesta } = require('../services/claude');
const { responderComentario, bloquearUsuario, ocultarComentario, getAdSetDeComentario } = require('../services/meta');

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verificado');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post('/', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.object !== 'page') return;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === 'feed' && change.value?.item === 'comment' && change.value?.verb === 'add') {
        procesarComentario(change.value).catch(e => console.error('❌', e.message));
      }
    }
  }
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function procesarComentario(val) {
  // Delay aleatorio 45-90 segundos para parecer humano
  const delay = (45 + Math.floor(Math.random() * 45)) * 1000;
  await sleep(delay);
  const comentarioId = val.comment_id;
  const postId = val.post_id;
  const usuarioId = val.from?.id;
  const usuarioNombre = val.from?.name;
  const texto = val.message;
  const plataforma = val.post_id?.includes('_') ? 'facebook' : 'instagram';

  const bloqueado = await get('SELECT id FROM bloqueados WHERE usuario_id = ?', [usuarioId]);
  if (bloqueado) return;

  const adsetName = await getAdSetDeComentario(postId);

  // Verificar blacklist de palabras (global + por adset)
  const blacklist = await all(
    'SELECT palabra FROM blacklist WHERE adset IS NULL OR adset = ?',
    [adsetName || '']
  );
  const textoLower = (texto || '').toLowerCase();
  const enBlacklist = blacklist.some(b => textoLower.includes(b.palabra));
  if (enBlacklist) {
    await ocultarComentario(comentarioId);
    console.log(`🚫 Comentario oculto por blacklist: ${texto}`);
    return;
  }
  let terreno = adsetName
    ? await get("SELECT * FROM terrenos WHERE adset = ? AND estado != 'Vendido'", [adsetName])
    : null;
  if (!terreno) terreno = await get("SELECT * FROM terrenos WHERE estado = 'Disponible' LIMIT 1");
  if (!terreno) return;

  const respuesta = await generarRespuesta(texto, terreno, usuarioNombre);

  if (respuesta.trim() === 'BLOQUEAR') {
    await bloquearUsuario(usuarioId);
    await ocultarComentario(comentarioId);
    await run('INSERT INTO bloqueados (usuario_id,usuario_nombre,plataforma,razon) VALUES (?,?,?,?) ON CONFLICT (usuario_id) DO NOTHING',
      [usuarioId, usuarioNombre, plataforma, 'Comentario inapropiado detectado por bot']);
    await run('UPDATE terrenos SET bloqueados = bloqueados + 1 WHERE id = ?', [terreno.id]);
    await run('INSERT INTO actividad (usuario,plataforma,accion,mensaje,terreno_id) VALUES (?,?,?,?,?)',
      [usuarioNombre, plataforma, 'bloqueado', texto, terreno.id]);
  } else {
    await responderComentario(comentarioId, respuesta);
    await run('UPDATE terrenos SET comentarios = comentarios+1, respondidos = respondidos+1 WHERE id = ?', [terreno.id]);
    await run('INSERT INTO actividad (usuario,plataforma,accion,mensaje,terreno_id) VALUES (?,?,?,?,?)',
      [usuarioNombre, plataforma, 'respondido', respuesta, terreno.id]);
  }

  console.log(`✅ @${usuarioNombre} → ${terreno.nombre}`);
}

module.exports = router;
