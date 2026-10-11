// Registro de auditoría (RNF03) y notificaciones. Nunca interrumpe la operación principal.
const Log = require('../modules/auditoria/log.model');
const Notificacion = require('../modules/auditoria/notificacion.model');

/** Registra una acción relevante asociada al usuario autenticado. */
async function audit(req, servicio, accion, detalle = {}, resultado = 'exitoso') {
  try {
    await Log.create({ usuario_id: req.user ? req.user.sub : null, servicio_origen: servicio, accion, resultado, detalle });
  } catch (e) { console.error('No se pudo registrar auditoría:', e.message); }
}
/** Envía una notificación interna a un usuario. */
async function notificar(usuarioId, mensaje) {
  try { if (usuarioId) await Notificacion.create({ usuario_id: usuarioId, mensaje }); }
  catch (e) { console.error('No se pudo notificar:', e.message); }
}
module.exports = { audit, notificar };
