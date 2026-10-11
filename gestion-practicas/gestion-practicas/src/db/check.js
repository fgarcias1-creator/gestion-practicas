// Verifica la conexión a PostgreSQL y a MongoDB y muestra qué encontró. Uso: npm run check
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cfg = require('../config/env');
const { pool, query } = require('../config/pg');

(async () => {
  const envOk = fs.existsSync(path.join(__dirname, '..', '..', '.env'));
  console.log(envOk ? '✔ Archivo .env encontrado' : '✘ No existe el archivo .env (copie .env.example como .env); se usan valores por defecto');
  let fallos = 0;
  try {
    const v = (await query('SHOW server_version')).rows[0].server_version;
    const t = (await query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'")).rows[0].n;
    console.log(`✔ PostgreSQL ${v} en ${cfg.pg.host}:${cfg.pg.port}/${cfg.pg.database} — ${t} tablas`);
    if (!t) console.log('  ! Sin tablas: ejecute npm run db:init');
  } catch (e) {
    fallos++;
    console.log(`✘ PostgreSQL (${cfg.pg.host}:${cfg.pg.port}): ${e.message}`);
    if (/autentifica|password|authentication/i.test(e.message)) console.log('  ! Puede estar conectándose a otro PostgreSQL instalado en su equipo. Revise PG_PORT en .env y el puerto en docker-compose.yml (5433).');
    if (/ECONNREFUSED/.test(e.message)) console.log('  ! Docker no está levantado: ejecute docker compose up -d');
  }
  try {
    await mongoose.connect(cfg.mongoUri, { serverSelectionTimeoutMS: 5000 });
    const cols = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
    console.log(`✔ MongoDB en ${cfg.mongoUri} — colecciones: ${cols.join(', ') || '(ninguna todavía)'}`);
  } catch (e) {
    fallos++;
    console.log(`✘ MongoDB (${cfg.mongoUri}): ${e.message}`);
    console.log('  ! Verifique que el contenedor mongo esté Up con docker ps');
  }
  await pool.end().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(fallos ? 1 : 0);
})();
