// Colección sesiones_practica (sección 8.3 del documento). Referencias lógicas a PostgreSQL por id numérico.
const mongoose = require('mongoose');
const evidencia = new mongoose.Schema({
  tipo: { type: String, enum: ['documento', 'imagen'], required: true },
  nombre: String,
  url: { type: String, required: true },
  // RNF02: marca de tiempo generada por el servidor e inmutable.
  fecha_carga_servidor: { type: Date, default: Date.now, immutable: true },
}, { _id: false });

const sesion = new mongoose.Schema({
  asignacion_id: { type: Number, required: true, index: true },
  estudiante_id: { type: Number, required: true, index: true },
  tutor_id: { type: Number, required: true },
  fecha_sesion: { type: String, required: true },          // 'YYYY-MM-DD'
  horas: { type: Number, required: true, min: 1, max: 12 },
  resumen: { type: String, required: true },
  evidencias: { type: [evidencia], default: [] },
  estado_validacion: {
    type: String, index: true, default: 'borrador',
    enum: ['borrador', 'pendiente_validacion', 'validada_tutor', 'confirmada_automatica', 'requiere_correccion'],
  },
  fecha_envio: Date,                                        // asignada por el servidor al enviar
  fecha_validacion: Date,
  validacion_automatica: { type: Boolean, default: false },
  observacion: String,                                      // motivo del rechazo del tutor
  reenviada: { type: Boolean, default: false },
  reenvio_de: mongoose.Schema.Types.ObjectId,
}, { timestamps: true });
module.exports = mongoose.model('SesionPractica', sesion, 'sesiones_practica');
