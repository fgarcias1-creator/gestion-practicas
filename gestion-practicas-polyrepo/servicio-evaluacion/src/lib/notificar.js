/**
 * Envía avisos a los usuarios (campana de notificaciones). Los guarda el Servicio de Seguimiento (MongoDB, colección `notificaciones`).
 * "Fire and forget": si el aviso falla no se tumba la operación del usuario; queda un warning en consola.
 * @param {Array<{usuario_id:number, tipo:string, titulo:string, mensaje:string}>} lista
 */
const { urls } = require('./config');
const { llamar } = require('./http');

async function notificar(lista) {
  const notificaciones = lista.filter((n) => n && n.usuario_id);
  if (!notificaciones.length) return;
  try {
    await llamar(urls.seguimiento, '/api/v1/internal/notificaciones', { method: 'POST', interno: true, body: { notificaciones } });
  } catch (e) {
    console.warn('[notificaciones] no se pudo enviar:', e.message);
  }
}

module.exports = { notificar };
