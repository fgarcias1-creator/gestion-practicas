// Colección notificaciones: avisos automáticos a usuarios (RF02, RF04, RF01).
const mongoose = require('mongoose');
module.exports = mongoose.model('Notificacion', new mongoose.Schema({
  usuario_id: { type: Number, required: true, index: true },
  mensaje: { type: String, required: true },
  leida: { type: Boolean, default: false },
  fecha: { type: Date, default: Date.now },
}), 'notificaciones');
