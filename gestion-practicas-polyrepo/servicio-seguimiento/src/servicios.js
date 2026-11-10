/** Lógica compartida del Servicio de Seguimiento. */
const { Sesion, Bitacora, Log, Notificacion, VALIDAS } = require('./models');
const { negocio } = require('./lib/config');

/** Inserta en logs_auditoria (llamada local; los demás servicios usan POST /auditoria). */
const auditar = ({ usuario_id, accion, resultado = 'exitoso', detalle = {} }) =>
  Log.create({ usuario_id, servicio_origen: 'seguimiento', accion, resultado, detalle });

/**
 * RF05: recalcula las horas acumuladas (solo sesiones validadas o confirmadas) y actualiza la caché.
 * Las horas requeridas dependen del PROGRAMA del estudiante: llegan desde el Servicio de Prácticas.
 */
async function recalcularBitacora(asignacion_id, estudiante_id, horasRequeridas) {
  const [t] = await Sesion.aggregate([
    { $match: { asignacion_id, estado_validacion: { $in: VALIDAS } } },
    { $group: { _id: null, horas: { $sum: '$horas' } } },
  ]);
  const base = { asignacion_id, horas_acumuladas: t ? t.horas : 0, ultima_actualizacion: new Date() };
  const update = horasRequeridas
    ? { $set: { ...base, horas_requeridas: horasRequeridas } }
    : { $set: base, $setOnInsert: { horas_requeridas: negocio.horasRequeridas } };
  return Bitacora.findOneAndUpdate({ estudiante_id }, update, { upsert: true, new: true });
}

/** Avisos locales (campana). No interrumpen la operación si fallan. */
const notificar = (lista) => Notificacion.insertMany(lista.filter((n) => n && n.usuario_id))
  .catch((e) => console.warn('[seguimiento] no se pudo guardar la notificación:', e.message));

module.exports = { auditar, recalcularBitacora, notificar };