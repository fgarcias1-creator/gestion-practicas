// Colección bitacoras_resumen: caché agregada de avance por estudiante (RF05).
const mongoose = require('mongoose');
module.exports = mongoose.model('BitacoraResumen', new mongoose.Schema({
  estudiante_id: { type: Number, required: true, unique: true },
  horas_acumuladas: { type: Number, default: 0 },
  horas_requeridas: { type: Number, default: 160 },
  estado_general: String,
  ultima_actualizacion: Date,
}), 'bitacoras_resumen');
