/** npm run check - verifica la conexión a PostgreSQL y MongoDB. */
require('dotenv').config();
const mongoose = require('mongoose');
const { Client } = require('pg');
(async () => {
  try {
    const c = new Client({ connectionString: process.env.PG_URL || 'postgres://practicas:practicas@localhost:5433/practicas' });
    await c.connect(); console.log('PostgreSQL OK ->', (await c.query('SELECT version()')).rows[0].version.split(',')[0]); await c.end();
    await mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/practicas_seguimiento', { serverSelectionTimeoutMS: 4000 });
    console.log('MongoDB OK    ->', mongoose.connection.name);
    process.exit(0);
  } catch (e) { console.error('Fallo de conexión:', e.message); process.exit(1); }
})();
