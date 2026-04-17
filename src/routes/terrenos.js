const express = require('express');
const router = express.Router();
const { run, get, all } = require('../services/db');
const { randomUUID } = require('crypto');

router.get('/', async (req, res) => {
  const terrenos = await all('SELECT * FROM terrenos ORDER BY created_at DESC');
  res.json(terrenos);
});

router.post('/', async (req, res) => {
  const { nombre, adset, estado, info } = req.body;
  if (!nombre || !info) return res.status(400).json({ error: 'nombre e info requeridos' });
  const id = randomUUID();
  await run(`INSERT INTO terrenos (id,nombre,adset,estado,info) VALUES (?,?,?,?,?)`,
    [id, nombre, adset || nombre, estado || 'Disponible', info]);
  res.json(await get('SELECT * FROM terrenos WHERE id = ?', [id]));
});

router.put('/:id', async (req, res) => {
  const { nombre, adset, estado, info } = req.body;
  await run(`UPDATE terrenos SET nombre=?,adset=?,estado=?,info=? WHERE id=?`,
    [nombre, adset, estado, info, req.params.id]);
  res.json(await get('SELECT * FROM terrenos WHERE id = ?', [req.params.id]));
});

router.delete('/:id', async (req, res) => {
  await run('DELETE FROM terrenos WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
