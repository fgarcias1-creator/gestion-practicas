// Manejo central de errores: convierte errores de PostgreSQL, multer y de negocio en respuestas JSON.
module.exports = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let status = err.status || 500, message = err.message, details = err.details;
  if (err.code === '23505') { status = 409; message = 'Ya existe un registro con ese valor único'; }
  else if (err.code === '23503') { status = 409; message = 'Referencia inválida o registro en uso'; }
  else if (err.code === '23514') { status = 400; message = 'El valor viola una restricción de la base de datos'; }
  else if (err.code === 'LIMIT_FILE_SIZE') { status = 400; message = 'La evidencia supera el tamaño máximo de 5 MB'; }
  else if (err.name === 'CastError') { status = 400; message = 'Identificador inválido'; }
  else if (/inmutables/.test(message || '')) { status = 409; }
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : message, ...(details ? { details } : {}) });
};
