/** Pool de PostgreSQL + helper de transacciones. */
const { Pool, types } = require('pg');
const { pgUrl } = require('./config');

types.setTypeParser(1082, (v) => v);          // DATE -> 'YYYY-MM-DD' (sin problemas de zona horaria)
types.setTypeParser(1700, (v) => parseFloat(v)); // NUMERIC -> number

const pool = new Pool({ connectionString: pgUrl });

/** Ejecuta fn(client) dentro de BEGIN/COMMIT; si lanza error hace ROLLBACK. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query: (t, p) => pool.query(t, p), tx };
