// Conexión a MongoDB (datos no relacionales: sesiones, bitácora, notificaciones y auditoría).
const mongoose = require('mongoose');
const cfg = require('./env');
module.exports = async function connectMongo() {
  await mongoose.connect(cfg.mongoUri);
  console.log('Conectado a MongoDB');
};
