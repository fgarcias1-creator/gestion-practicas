// Mantiene sincronizados los estados que dependen de la fecha actual.
const { query } = require('../config/pg');
async function refrescarEstados() {
  // Estado del convenio según su vigencia (RF03): vencido / próximo a vencer (60 días) / vigente.
  await query(`UPDATE convenios SET estado = CASE
      WHEN fecha_fin < CURRENT_DATE THEN 'vencido'
      WHEN fecha_fin < CURRENT_DATE + 60 THEN 'proximo_a_vencer' ELSE 'vigente' END`);
  // RF02: en la fecha de inicio la práctica pasa de «asignado» a «en curso».
  await query(`UPDATE asignaciones SET estado = 'en_curso' WHERE estado = 'asignado' AND fecha_inicio_practica <= CURRENT_DATE`);
}
module.exports = { refrescarEstados };
