/**
 * Autenticación JWT y control de acceso por rol.
 * Payload del token: { sub: usuario_id, rol, email, nombre, perfil_id }
 * (perfil_id = id en la tabla estudiantes/tutores/docentes/directores según el rol).
 */
const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpires, internalKey } = require('./config');
const { HttpError } = require('./errors');

const firmarToken = (payload) => jwt.sign(payload, jwtSecret, { expiresIn: jwtExpires });

/** Exige un header "Authorization: Bearer <token>" válido. Deja el payload en req.usuario. */
function autenticar(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) return next(new HttpError(401, 'Token requerido'));
  try {
    req.usuario = jwt.verify(token, jwtSecret);
    req.token = token; // se reenvía en llamadas servicio-a-servicio
    next();
  } catch {
    next(new HttpError(401, 'Token inválido o expirado'));
  }
}

/** Restringe una ruta a ciertos roles. Uso: requerirRol('director', 'docente') */
const requerirRol = (...roles) => (req, res, next) =>
  roles.includes(req.usuario?.rol) ? next() : next(new HttpError(403, 'No tiene permisos para esta acción'));

/** Para rutas /internal: solo otros servicios (comparten INTERNAL_KEY). El Gateway nunca las expone. */
function claveInterna(req, res, next) {
  if (req.headers['x-service-key'] !== internalKey) return next(new HttpError(403, 'Acceso interno denegado'));
  next();
}

module.exports = { firmarToken, autenticar, requerirRol, claveInterna };
