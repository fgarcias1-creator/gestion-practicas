// Colección logs_auditoria (RNF03): insert-only. Se bloquean actualizaciones y borrados a nivel de modelo.
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  usuario_id: Number,
  servicio_origen: { type: String, required: true },
  accion: { type: String, required: true },
  fecha_hora: { type: Date, default: Date.now, immutable: true },
  resultado: { type: String, enum: ['exitoso', 'fallido'], default: 'exitoso' },
  detalle: mongoose.Schema.Types.Mixed,
});
const bloquear = function () { throw new Error('El historial de auditoría es de solo inserción'); };
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'deleteOne', 'deleteMany', 'replaceOne']
  .forEach((op) => schema.pre(op, bloquear));
module.exports = mongoose.model('LogAuditoria', schema, 'logs_auditoria');
