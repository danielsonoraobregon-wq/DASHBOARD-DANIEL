const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/terrenosbot.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new sqlite3.Database(DB_PATH);

const run = (sql, params = []) => new Promise((res, rej) =>
  db.run(sql, params, function(err) { err ? rej(err) : res(this); }));

const get = (sql, params = []) => new Promise((res, rej) =>
  db.get(sql, params, (err, row) => err ? rej(err) : res(row)));

const all = (sql, params = []) => new Promise((res, rej) =>
  db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

async function init() {
  await run(`CREATE TABLE IF NOT EXISTS terrenos (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    adset TEXT,
    estado TEXT DEFAULT 'Disponible',
    info TEXT,
    comentarios INTEGER DEFAULT 0,
    respondidos INTEGER DEFAULT 0,
    bloqueados INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS actividad (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT,
    plataforma TEXT,
    accion TEXT,
    mensaje TEXT,
    terreno_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS bloqueados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id TEXT UNIQUE,
    usuario_nombre TEXT,
    plataforma TEXT,
    razon TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const count = await get('SELECT COUNT(*) as c FROM terrenos');
  if (count.c === 0) {
    await run(`INSERT INTO terrenos (id,nombre,adset,estado,info) VALUES (?,?,?,?,?)`,
      ['1','Lote El Pinar #3','Lote El Pinar #3','Disponible',
       'Lote de 200m² en Girardot, Cundinamarca. Precio $45.000.000. Servicios de agua, luz y gas. Vía pavimentada, vista al río, escritura lista.']);
    await run(`INSERT INTO terrenos (id,nombre,adset,estado,info) VALUES (?,?,?,?,?)`,
      ['2','Finca Villa Rosa','Finca Villa Rosa','Reservado',
       'Finca de 5.000m² en La Mesa, Cundinamarca. Precio $320.000.000. Agua propia, luz y pozo. Apta para parcelación, acceso vía principal.']);
    await run(`INSERT INTO terrenos (id,nombre,adset,estado,info) VALUES (?,?,?,?,?)`,
      ['3','Lote Campestre #7','Lote Campestre Anapoima','Disponible',
       'Lote de 350m² en Anapoima, Cundinamarca. Precio $68.000.000. Agua y luz. Zona residencial exclusiva, listo para construir.']);
  }
}

module.exports = { db, run, get, all, init };
