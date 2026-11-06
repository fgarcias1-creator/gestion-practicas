/**
 * RF04: si el tutor no actúa en 24 horas desde la entrega, el sistema confirma la sesión
 * automáticamente y deja constancia de que fue automática (validacion_automatica = true).
 */
const cron = require('node-cron');
const { Sesion } = require('./models');
const { recalcularBitacora, auditar, notificar } = require('./servicios');
const { negocio } = require('./lib/config');

async function confirmarVencidas() {
  const limite = new Date(Date.now() - negocio.horasAutoConfirmacion * 3600 * 1000);
  const vencidas = await Sesion.find({ estado_validacion: 'pendiente', fecha_envio: { $lte: limite } });
  for (const s of vencidas) {
    // Condición en el filtro: si el tutor validó justo ahora, no se pisa su decisión.
    const r = await Sesion.updateOne({ _id: s._id, estado_validacion: 'pendiente' },
      { $set: { estado_validacion: 'confirmada_automatica', validacion_automatica: true, fecha_validacion: new Date() } });
    if (r.modifiedCount) {
      await recalcularBitacora(s.asignacion_id, s.estudiante_id);
      await auditar({ usuario_id: 0, accion: 'sesion_confirmada_automaticamente', detalle: { sesion_id: String(s._id), asignacion_id: s.asignacion_id } });
      await notificar([{ usuario_id: s.estudiante_usuario_id, tipo: 'sesion', titulo: 'Sesión confirmada automáticamente',
        mensaje: `Su tutor no respondió en ${negocio.horasAutoConfirmacion} h: la sesión del ${s.fecha_sesion.toISOString().slice(0, 10)} (${s.horas} h) se confirmó automáticamente y ya suma a su bitácora.` }]);
    }
  }
  return vencidas.length;
}

function iniciarJobs() {
  cron.schedule('*/5 * * * *', () => confirmarVencidas().catch((e) => console.error('[job confirmación]', e.message)));
}
module.exports = { iniciarJobs, confirmarVencidas };
