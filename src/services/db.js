const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Convierte ? a $1, $2... para compatibilidad con el resto del código
function toParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const run = (sql, params = []) => pool.query(toParams(sql), params);

const get = async (sql, params = []) => {
  const r = await pool.query(toParams(sql), params);
  return r.rows[0] || null;
};

const all = async (sql, params = []) => {
  const r = await pool.query(toParams(sql), params);
  return r.rows;
};

async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS terrenos (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    adset TEXT,
    estado TEXT DEFAULT 'Disponible',
    info TEXT,
    comentarios INTEGER DEFAULT 0,
    respondidos INTEGER DEFAULT 0,
    bloqueados INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS actividad (
    id SERIAL PRIMARY KEY,
    usuario TEXT,
    plataforma TEXT,
    accion TEXT,
    mensaje TEXT,
    terreno_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS bloqueados (
    id SERIAL PRIMARY KEY,
    usuario_id TEXT UNIQUE,
    usuario_nombre TEXT,
    plataforma TEXT,
    razon TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS blacklist (
    id SERIAL PRIMARY KEY,
    palabra TEXT NOT NULL,
    adset TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Índice único que maneja NULLs correctamente
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_blacklist
    ON blacklist (palabra, COALESCE(adset, ''))
  `);

  // Datos iniciales solo si la tabla está vacía
  const count = await get('SELECT COUNT(*) as c FROM terrenos');
  if (parseInt(count.c) === 0) {
    await pool.query(`INSERT INTO terrenos (id,nombre,adset,estado,info) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      ['1','Lote El Pinar #3','Lote El Pinar #3','Disponible',
       'Lote de 200m² en Girardot, Cundinamarca. Precio $45.000.000. Servicios de agua, luz y gas. Vía pavimentada, vista al río, escritura lista.']);
    await pool.query(`INSERT INTO terrenos (id,nombre,adset,estado,info) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      ['2','Finca Villa Rosa','Finca Villa Rosa','Reservado',
       'Finca de 5.000m² en La Mesa, Cundinamarca. Precio $320.000.000. Agua propia, luz y pozo. Apta para parcelación, acceso vía principal.']);
    await pool.query(`INSERT INTO terrenos (id,nombre,adset,estado,info) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      ['3','Lote Campestre #7','Lote Campestre Anapoima','Disponible',
       'Lote de 350m² en Anapoima, Cundinamarca. Precio $68.000.000. Agua y luz. Zona residencial exclusiva, listo para construir.']);
  }

  console.log('✅ PostgreSQL conectado y tablas listas');
}

module.exports = { pool, run, get, all, init };
