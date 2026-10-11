// Conexión a PostgreSQL (datos relacionales) con helper de transacciones.
const { Pool, types } = require('pg');
const cfg = require('./env');
types.setTypeParser(1082, (v) => v);             // DATE -> 'YYYY-MM-DD' (sin desfase de zona horaria)
types.setTypeParser(1700, (v) => parseFloat(v)); // NUMERIC -> number

const pool = new Pool(cfg.pg);
pool.on('error', (e) => console.error('Error en el pool de PostgreSQL:', e.message));

const query = (text, params) => pool.query(text, params);

/** Ejecuta fn(client) dentro de una transacción; hace ROLLBACK ante cualquier error. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
module.exports = { pool, query, tx };
