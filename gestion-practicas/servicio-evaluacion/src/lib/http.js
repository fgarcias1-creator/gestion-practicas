/**
 * Cliente REST para la comunicación SÍNCRONA entre servicios (sección 5.2 del documento).
 * Ningún servicio toca la base de datos de otro: siempre pasa por su API.
 */
const { internalKey } = require('./config');
const { HttpError } = require('./errors');

/**
 * @param {string} base   URL base del servicio (config.urls.xxx)
 * @param {string} ruta   Ruta, p. ej. '/api/v1/asignaciones/mia'
 * @param {object} opts   { method, token (reenvía el JWT del usuario), interno (usa x-service-key), body }
 */
async function llamar(base, ruta, { method = 'GET', token, interno = false, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (interno) headers['x-service-key'] = internalKey;
  let res;
  try {
    res = await fetch(base + ruta, {
      method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new HttpError(503, `Servicio no disponible (${base})`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new HttpError(res.status, data?.error || 'Error en el servicio remoto', data?.detalle);
  return data;
}

module.exports = { llamar };
