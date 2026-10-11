// Servicio de Identidad: autenticación (JWT) y gestión de usuarios por rol.
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const cfg = require('../../config/env');
const { query, tx } = require('../../config/pg');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { HttpError, ah } = require('../../utils/http');
const { audit } = require('../../utils/audit');

const SELECT_USUARIO = `
  SELECT u.*, COALESCE(e.id, t.id, d.id, di.id) AS ref
  FROM usuarios u
  LEFT JOIN estudiantes e ON e.usuario_id = u.id
  LEFT JOIN tutores t ON t.usuario_id = u.id
  LEFT JOIN docentes d ON d.usuario_id = u.id
  LEFT JOIN directores di ON di.usuario_id = u.id`;

// POST /auth/login -> { token, usuario }
router.post('/auth/login', validate(z.object({ email: z.string().email(), password: z.string().min(1) })), ah(async (req, res) => {
  const { rows } = await query(`${SELECT_USUARIO} WHERE lower(u.email) = lower($1)`, [req.body.email]);
  const u = rows[0];
  if (!u || u.estado !== 'activo' || !(await bcrypt.compare(req.body.password, u.password_hash))) {
    await audit({ user: u ? { sub: u.id } : null }, 'identidad', 'login_fallido', { email: req.body.email }, 'fallido');
    throw new HttpError(401, 'Credenciales inválidas'); // no revela cuál dato falló
  }
  const token = jwt.sign({ sub: u.id, rol: u.rol, ref: u.ref, nombre: u.nombre_completo }, cfg.jwtSecret, { expiresIn: cfg.jwtExpires });
  await audit({ user: { sub: u.id } }, 'identidad', 'login');
  res.json({ token, usuario: { id: u.id, nombre: u.nombre_completo, email: u.email, rol: u.rol, ref: u.ref } });
}));

router.get('/auth/me', auth(), ah(async (req, res) => {
  const { rows } = await query(`${SELECT_USUARIO} WHERE u.id = $1`, [req.user.sub]);
  const { password_hash, ...u } = rows[0];
  res.json(u);
}));

// Alta de usuarios con su perfil de rol (solo el director).
const base = { nombre_completo: z.string().min(3), email: z.string().email(), password: z.string().min(8) };
const alta = z.discriminatedUnion('rol', [
  z.object({ ...base, rol: z.literal('estudiante'), codigo_estudiantil: z.string(), programa: z.string(), semestre: z.number().int().min(1), porcentaje_creditos: z.number().min(0).max(100) }),
  z.object({ ...base, rol: z.literal('tutor'), institucion_id: z.number().int(), cargo: z.string().optional(), telefono: z.string().optional() }),
  z.object({ ...base, rol: z.literal('docente'), area: z.string().optional() }),
  z.object({ ...base, rol: z.literal('director'), programa_academico: z.string().optional() }),
]);
router.post('/usuarios', auth('director'), validate(alta), ah(async (req, res) => {
  const b = req.body;
  const out = await tx(async (c) => {
    const hash = await bcrypt.hash(b.password, 10);
    const u = (await c.query('INSERT INTO usuarios (nombre_completo,email,password_hash,rol) VALUES ($1,$2,$3,$4) RETURNING id,nombre_completo,email,rol', [b.nombre_completo, b.email, hash, b.rol])).rows[0];
    if (b.rol === 'estudiante') await c.query('INSERT INTO estudiantes (usuario_id,codigo_estudiantil,programa,semestre,porcentaje_creditos) VALUES ($1,$2,$3,$4,$5)', [u.id, b.codigo_estudiantil, b.programa, b.semestre, b.porcentaje_creditos]);
    if (b.rol === 'tutor') await c.query('INSERT INTO tutores (usuario_id,institucion_id,cargo,telefono) VALUES ($1,$2,$3,$4)', [u.id, b.institucion_id, b.cargo, b.telefono]);
    if (b.rol === 'docente') await c.query('INSERT INTO docentes (usuario_id,area) VALUES ($1,$2)', [u.id, b.area]);
    if (b.rol === 'director') await c.query('INSERT INTO directores (usuario_id,programa_academico) VALUES ($1,$2)', [u.id, b.programa_academico]);
    return u;
  });
  await audit(req, 'identidad', 'usuario_creado', { usuario_id: out.id, rol: out.rol });
  res.status(201).json(out);
}));

router.get('/usuarios', auth('director'), ah(async (req, res) => {
  const { rows } = await query('SELECT id,nombre_completo,email,rol,estado FROM usuarios ORDER BY id');
  res.json(rows);
}));

// Actualización y baja de usuarios (CRUD completo de la tabla usuarios). La baja falla con 409 si el usuario ya tiene datos asociados.
router.patch('/usuarios/:id', auth('director'), validate(z.object({ nombre_completo: z.string().min(3).optional(), estado: z.enum(['activo', 'inactivo']).optional() })), ah(async (req, res) => {
  const b = req.body;
  const { rows } = await query('UPDATE usuarios SET nombre_completo = COALESCE($1, nombre_completo), estado = COALESCE($2, estado) WHERE id = $3 RETURNING id,nombre_completo,email,rol,estado',
    [b.nombre_completo ?? null, b.estado ?? null, req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Usuario no encontrado');
  await audit(req, 'identidad', 'usuario_modificado', { usuario_id: rows[0].id });
  res.json(rows[0]);
}));
router.delete('/usuarios/:id', auth('director'), ah(async (req, res) => {
  const r = await query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
  if (!r.rowCount) throw new HttpError(404, 'Usuario no encontrado');
  await audit(req, 'identidad', 'usuario_eliminado', { usuario_id: +req.params.id });
  res.status(204).end();
}));
module.exports = router;
