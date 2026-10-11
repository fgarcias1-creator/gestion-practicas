const cfg = require('./config/env');
const app = require('./app');
const connectMongo = require('./config/mongo');
const { pool } = require('./config/pg');
const iniciarJobs = require('./jobs/autoconfirm');

(async () => {
  await pool.query('SELECT 1');
  console.log('Conectado a PostgreSQL');
  await connectMongo();
  app.listen(cfg.port, () => console.log(`API escuchando en http://localhost:${cfg.port}/api/v1`));
  iniciarJobs();
})().catch((e) => { console.error('No se pudo iniciar:', e.message); process.exit(1); });
