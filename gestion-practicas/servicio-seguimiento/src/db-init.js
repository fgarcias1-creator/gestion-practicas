/** npm run db:init - crea las colecciones e índices de MongoDB (sesiones_practica, bitacoras_resumen, logs_auditoria). */
const mongoose = require('mongoose');
const { mongoUrl } = require('./lib/config');
const { Sesion, Bitacora, Log, Notificacion } = require('./models');
(async () => {
  await mongoose.connect(mongoUrl);
  for (const M of [Sesion, Bitacora, Log, Notificacion]) { await M.createCollection().catch(() => {}); await M.syncIndexes(); }
  console.log('MongoDB listo: colecciones e índices creados.');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
