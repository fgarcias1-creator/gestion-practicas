// Autenticación JWT y control de acceso por rol.
const jwt = require('jsonwebtoken');
const cfg = require('../config/env');
const { HttpError } = require('../utils/http');

/** auth() exige sesión válida; auth('director','docente') además restringe por rol. */
const auth = (...roles) => (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Token requerido'));
  try {
    req.user = jwt.verify(token, cfg.jwtSecret); // { sub, rol, ref, nombre }
  } catch {
    return next(new HttpError(401, 'Token inválido o vencido'));
  }
  if (roles.length && !roles.includes(req.user.rol)) return next(new HttpError(403, 'No tiene permiso para esta acción'));
  next();
};
module.exports = auth;
