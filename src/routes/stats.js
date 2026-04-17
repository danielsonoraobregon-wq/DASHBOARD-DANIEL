const express = require('express');
const router = express.Router();
const { run, get, all } = require('../services/db');

router.get('/', async (req, res) => {
  const [comentarios, respondidos, bloqueados, disponibles, actividad, listaBloqueados] = await Promise.all([
    get('SELECT SUM(comentarios) as t FROM terrenos'),
    get('SELECT SUM(respondidos) as t FROM terrenos'),
    get('SELECT COUNT(*) as t FROM bloqueados'),
    get('SELECT COUNT(*) as t FROM terrenos WHERE estado = "Disponible"'),
    all('SELECT * FROM actividad ORDER BY created_at DESC LIMIT 20'),
    all('SELECT * FROM bloqueados ORDER BY created_at DESC'),
  ]);

  res.json({
    totalComentarios: comentarios.t || 0,
    totalRespondidos: respondidos.t || 0,
    totalBloqueados:  bloqueados.t || 0,
    totalDisponibles: disponibles.t || 0,
    actividad,
    bloqueados: listaBloqueados,
  });
});

router.delete('/bloqueados/:id', async (req, res) => {
  await run('DELETE FROM bloqueados WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
