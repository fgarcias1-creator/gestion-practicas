// Lógica del Servicio de Seguimiento reutilizable por otros servicios (evaluación, reportes, job de confirmación).
const cfg = require('../../config/env');
const { query } = require('../../config/pg');
const Sesion = require('./sesion.model');
const Bitacora = require('./bitacora.model');
const { audit } = require('../../utils/audit');

const VALIDAS = ['validada_tutor', 'confirmada_automatica'];

/** Recalcula la bitácora consolidada: solo las sesiones validadas suman horas (RF04/RF05). */
async function recalcBitacora(estudianteId) {
  const agg = await Sesion.aggregate([
    { $match: { estudiante_id: estudianteId, estado_validacion: { $in: VALIDAS } } },
    { $group: { _id: null, horas: { $sum: '$horas' } } },
  ]);
  const a = (await query('SELECT horas_requeridas, estado FROM asignaciones WHERE estudiante_id = $1', [estudianteId])).rows[0];
  return Bitacora.findOneAndUpdate({ estudiante_id: estudianteId }, {
    horas_acumuladas: agg[0] ? agg[0].horas : 0,
    horas_requeridas: a ? a.horas_requeridas : cfg.horasRequeridas,
    estado_general: a ? a.estado : 'sin_asignacion',
    ultima_actualizacion: new Date(),
  }, { upsert: true, new: true });
}

/** Sesiones validadas de una asignación (insumo para la calificación, RF06). */
const sesionesValidadas = (asignacionId) => Sesion.find({ asignacion_id: asignacionId, estado_validacion: { $in: VALIDAS } }).sort({ fecha_sesion: 1 });

/** RF04: confirma automáticamente las sesiones que superan el plazo sin validación del tutor. */
async function autoConfirmar(horasPlazo = cfg.plazoValidacionHoras) {
  const limite = new Date(Date.now() - horasPlazo * 3600 * 1000);
  const vencidas = await Sesion.find({ estado_validacion: 'pendiente_validacion', fecha_envio: { $lte: limite } });
  for (const s of vencidas) {
    s.estado_validacion = 'confirmada_automatica';
    s.validacion_automatica = true; // constancia de que no fue una validación manual
    s.fecha_validacion = new Date();
    await s.save();
    await recalcBitacora(s.estudiante_id);
    await audit({ user: null }, 'seguimiento', 'validacion_automatica', { sesion_id: s._id, asignacion_id: s.asignacion_id });
  }
  return vencidas.length;
}
module.exports = { recalcBitacora, sesionesValidadas, autoConfirmar, VALIDAS };
