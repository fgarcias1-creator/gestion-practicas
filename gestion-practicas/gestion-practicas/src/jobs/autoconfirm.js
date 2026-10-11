// Tarea programada: cada 10 minutos confirma automáticamente las sesiones sin validar tras el plazo (RF04).
const { autoConfirmar } = require('../modules/seguimiento/seguimiento.service');
const { refrescarEstados } = require('../utils/estados');
module.exports = function iniciarJobs() {
  const tick = async () => {
    try {
      await refrescarEstados();
      const n = await autoConfirmar();
      if (n) console.log(`[job] ${n} sesión(es) confirmada(s) automáticamente`);
    } catch (e) { console.error('[job] error:', e.message); }
  };
  tick();
  return setInterval(tick, 10 * 60 * 1000);
};
