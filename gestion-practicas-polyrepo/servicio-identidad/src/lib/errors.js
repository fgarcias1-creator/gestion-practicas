/**
 * Errores HTTP y utilidades de Express comunes a todos los servicios.
 */
const { ZodError } = require('zod');

class HttpError extends Error {
  constructor(status, mensaje, detalle) {
    super(mensaje);
    this.status = status;
    this.detalle = detalle;
  }
}

/** Envuelve handlers async para que los errores lleguen al manejador central. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Middleware: valida req[origen] con un esquema zod y reemplaza el valor por el dato ya limpio. */
const validar = (schema, origen = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[origen]);
  if (!r.success) {
    return next(new HttpError(400, 'Datos inválidos',
      r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message }))));
  }
  req[origen] = r.data;
  next();
};

/** Manejador central: traduce errores de PostgreSQL/multer/zod a respuestas JSON sin filtrar detalles internos. */
function manejadorErrores(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Datos inválidos', detalle: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })) });
  }
  if (err.status) return res.status(err.status).json({ error: err.message, detalle: err.detalle });
  if (err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo permitido' : err.message;
    return res.status(400).json({ error: msg });
  }
  // Códigos de PostgreSQL
  if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con ese valor único' });
  if (err.code === '23503') return res.status(409).json({ error: 'Referencia inválida: el registro relacionado no existe' });
  if (err.code === '23514') return res.status(400).json({ error: 'El valor no cumple una restricción de la base de datos' });
  if (err.code === 'P0001') return res.status(409).json({ error: err.message });
  console.error('[error]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
}

module.exports = { HttpError, asyncHandler, validar, manejadorErrores };
