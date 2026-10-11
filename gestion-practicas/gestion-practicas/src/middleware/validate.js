// Validación del cuerpo de la solicitud con zod.
const { HttpError } = require('../utils/http');
module.exports = (schema) => (req, res, next) => {
  const r = schema.safeParse(req.body);
  if (!r.success) {
    const details = r.error.issues.map((i) => `${i.path.join('.') || 'cuerpo'}: ${i.message}`);
    return next(new HttpError(400, 'Datos inválidos', details));
  }
  req.body = r.data;
  next();
};
