/**
 * RNF03 - Trazabilidad. Envía un evento al servicio de Seguimiento, que lo guarda en la
 * colección MongoDB `logs_auditoria` (insert-only). Es "fire and forget": si la auditoría
 * falla, no se tumba la operación del usuario (consistencia eventual), pero queda en consola.
 */
const { urls } = require('./config');
const { llamar } = require('./http');

async function registrar({ usuario_id, servicio_origen, accion, resultado = 'exitoso', detalle = {} }) {
  try {
    await llamar(urls.seguimiento, '/api/v1/auditoria', {
      method: 'POST', interno: true,
      body: { usuario_id: usuario_id ?? 0, servicio_origen, accion, resultado, detalle },
    });
  } catch (e) {
    console.warn(`[auditoria] no se pudo registrar "${accion}":`, e.message);
  }
}

module.exports = { registrar };
