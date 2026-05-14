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
  if (body.object !== 'page' && body.object !== 'instagram') return;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const comentario = normalizarComentario(change);
      if (comentario) {
        procesarComentario(comentario).catch(e => console.error('❌', e.message));
      }
    }
  }
});

// Normaliza comentarios de Facebook (feed) e Instagram (comments) al mismo formato.
// Sin esto, los comentarios de Instagram nunca se procesan porque llegan en field 'comments'.
function normalizarComentario(change) {
  const v = change.value;
  if (!v) return null;
  if (change.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
    return {
      plataforma: 'facebook',
      comentarioId: v.comment_id,
      postId: v.post_id,
      usuarioId: v.from?.id,
      usuarioNombre: v.from?.name,
      texto: v.message,
    };
  }
  if (change.field === 'comments') {
    return {
      plataforma: 'instagram',
      comentarioId: v.id,
      postId: v.media?.id,
      usuarioId: v.from?.id,
      usuarioNombre: v.from?.username,
      texto: v.text,
    };
  }
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function procesarComentario(c) {
  // Delay aleatorio 45-90 segundos para parecer humano
  const delay = (45 + Math.floor(Math.random() * 45)) * 1000;
  await sleep(delay);
  const { comentarioId, postId, usuarioId, usuarioNombre, texto, plataforma } = c;

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
  if (!terreno) {
    console.log(adsetName
      ? `⚠️ Adset "${adsetName}" sin terreno asociado — usando terreno por defecto`
      : '⚠️ Comentario sin adset detectado — usando terreno por defecto');
    terreno = await get("SELECT * FROM terrenos WHERE estado = 'Disponible' LIMIT 1");
  }
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
