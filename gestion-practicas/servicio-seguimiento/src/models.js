/**
 * Modelos MongoDB (sección 8.3 del documento).
 * Las referencias a PostgreSQL (asignacion_id, estudiante_id, tutor_id) son LÓGICAS:
 * no hay llaves foráneas entre motores.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ESTADOS = ['borrador', 'pendiente', 'validada_tutor', 'confirmada_automatica', 'requiere_correccion'];
const VALIDAS = ['validada_tutor', 'confirmada_automatica']; // solo estas suman horas a la bitácora

// ---------- sesiones_practica (RF04, RNF01, RNF02) ----------
const sesionSchema = new Schema({
  asignacion_id: { type: Number, required: true, index: true },
  estudiante_id: { type: Number, required: true, index: true },
  tutor_id: { type: Number, required: true, index: true },
  estudiante_usuario_id: Number,   // para avisar al estudiante cuando el tutor valida o rechaza
  tutor_usuario_id: Number,        // para avisar al tutor cuando llega una sesión por validar
  fecha_sesion: { type: Date, required: true },
  horas: { type: Number, required: true, min: 0.5, max: 12 },
  resumen_actividades: { type: String, default: '' },
  evidencias: [{
    _id: false,
    tipo: { type: String, enum: ['documento', 'imagen', 'video', 'audio', 'otro'], required: true },
    nombre_original: String, archivo: { type: String, required: true }, mime: String, tamano: Number,
    // RNF02: marca de tiempo generada por el SERVIDOR y de solo lectura
    fecha_carga_servidor: { type: Date, required: true, immutable: true },
  }],
  estado_validacion: { type: String, enum: ESTADOS, default: 'borrador', index: true },
  fecha_envio: Date,                          // la asigna el servidor al enviar; no se edita después
  fecha_validacion: Date,
  validacion_automatica: { type: Boolean, default: false },
  observacion_tutor: String,                  // obligatoria al rechazar
  reemplaza_a: { type: Schema.Types.ObjectId, ref: 'Sesion' }, // corrección = NUEVA entrega; la original se conserva
}, { collection: 'sesiones_practica', timestamps: true });

// ---------- bitacoras_resumen (RF05) - caché agregada para lectura rápida ----------
const bitacoraSchema = new Schema({
  estudiante_id: { type: Number, required: true, unique: true },
  asignacion_id: Number,
  horas_acumuladas: { type: Number, default: 0 },
  horas_requeridas: { type: Number, required: true },
  estado_general: String,
  ultima_actualizacion: { type: Date, default: Date.now },
}, { collection: 'bitacoras_resumen' });

// ---------- logs_auditoria (RNF03) - INSERT-ONLY ----------
const logSchema = new Schema({
  usuario_id: { type: Number, required: true, index: true },
  servicio_origen: { type: String, required: true },
  accion: { type: String, required: true },
  fecha_hora: { type: Date, default: Date.now, index: true },
  resultado: { type: String, enum: ['exitoso', 'fallido'], default: 'exitoso' },
  detalle: Schema.Types.Mixed,
}, { collection: 'logs_auditoria', versionKey: false });
// Defensa en profundidad: aunque alguien lo intente desde código, el modelo rechaza update/delete.
logSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne'],
  function () { throw new Error('logs_auditoria es de solo inserción (RNF03)'); });

// ---------- notificaciones (campana de avisos del usuario) ----------
const notificacionSchema = new Schema({
  usuario_id: { type: Number, required: true, index: true },
  tipo: { type: String, required: true },          // solicitud | asignacion | sesion | calificacion
  titulo: { type: String, required: true },
  mensaje: { type: String, required: true },
  leida: { type: Boolean, default: false },
  fecha: { type: Date, default: Date.now, index: true },
}, { collection: 'notificaciones', versionKey: false });

module.exports = {
  ESTADOS, VALIDAS,
  Notificacion: mongoose.models.Notificacion || mongoose.model('Notificacion', notificacionSchema),
  Sesion: mongoose.models.Sesion || mongoose.model('Sesion', sesionSchema),
  Bitacora: mongoose.models.Bitacora || mongoose.model('Bitacora', bitacoraSchema),
  Log: mongoose.models.Log || mongoose.model('Log', logSchema),
};
