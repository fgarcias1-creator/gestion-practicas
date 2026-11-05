/**
 * SERVICIO DE IDENTIDAD Y USUARIOS (puerto 3001) - PostgreSQL
 * Responsabilidad: autenticación (login -> JWT) y gestión de usuarios por rol.
 *
 * Flujo del login (pantalla 9.1 del documento):
 *  1. El frontend envía email + password a POST /api/v1/auth/login.
 *  2. Se busca el usuario y se compara el hash bcrypt de la contraseña.
 *  3. Se consulta al Servicio de Prácticas (vía REST interno) cuál es el id de su perfil
 *     (estudiante/tutor/docente/director), porque esas tablas pertenecen a ese servicio.
 *     (el rol «administrador» no tiene perfil: perfil_id queda en null).
 *  4. Se firma un JWT con { sub, rol, perfil_id, ... } y se devuelve al cliente.
 *  Si algo falla, el mensaje es siempre el mismo ("Credenciales inválidas") para no revelar
 *  cuál dato es incorrecto.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { crearApp, arrancar } = require('./lib/servidor');
const { HttpError, asyncHandler, validar } = require('./lib/errors');
const { autenticar, requerirRol, firmarToken } = require('./lib/auth');
const { query } = require('./lib/pg');
const { llamar } = require('./lib/http');
const { registrar } = require('./lib/audit');
const { urls, puertos } = require('./lib/config');

const app = crearApp('identidad');
const r = express.Router();
const HASH_FALSO = bcrypt.hashSync('relleno', 10); // evita revelar por tiempo si el correo existe

// ---------- POST /auth/login ----------
const esquemaLogin = z.object({ email: z.string().email(), password: z.string().min(1) });

r.post('/auth/login', validar(esquemaLogin), asyncHandler(async (req, res) => {
  const email = req.body.email.toLowerCase();
  const { rows: [u] } = await query('SELECT * FROM usuarios WHERE email=$1', [email]);
  const ok = await bcrypt.compare(req.body.password, u ? u.password_hash : HASH_FALSO);

  if (!u || !ok || u.estado !== 'activo') {
    await registrar({ usuario_id: u?.id, servicio_origen: 'identidad', accion: 'login', resultado: 'fallido', detalle: { email } });
    throw new HttpError(401, 'Credenciales inválidas');
  }

  let perfil_id = null;
  try {
    perfil_id = (await llamar(urls.practicas, `/api/v1/internal/perfil/${u.id}`, { interno: true })).perfil_id;
  } catch (e) { console.warn('[identidad] no se pudo obtener el perfil:', e.message); }

  const token = firmarToken({ sub: u.id, rol: u.rol, email: u.email, nombre: u.nombre_completo, perfil_id });
  await registrar({ usuario_id: u.id, servicio_origen: 'identidad', accion: 'login' });
  res.json({ token, usuario: { id: u.id, nombre: u.nombre_completo, email: u.email, rol: u.rol, perfil_id } });
}));

// ---------- GET /auth/me ----------
r.get('/auth/me', autenticar, (req, res) => {
  const { sub, rol, email, nombre, perfil_id } = req.usuario;
  res.json({ id: sub, rol, email, nombre, perfil_id });
});

// ---------- POST /auth/registro (solo administrador) ----------
const esquemaRegistro = z.object({
  nombre_completo: z.string().min(3), email: z.string().email(), password: z.string().min(8),
  rol: z.enum(['estudiante', 'tutor', 'docente', 'director', 'administrador']),
  // Datos del perfil según el rol (se validan en el Servicio de Prácticas, dueño de esas tablas)
  perfil: z.record(z.any()).default({}),
});

r.post('/auth/registro', autenticar, requerirRol('administrador'), validar(esquemaRegistro), asyncHandler(async (req, res) => {
  const d = req.body;
  const hash = await bcrypt.hash(d.password, 10);
  let u;
  try {
    ({ rows: [u] } = await query(
      'INSERT INTO usuarios(nombre_completo,email,password_hash,rol) VALUES($1,$2,$3,$4) RETURNING id,nombre_completo,email,rol',
      [d.nombre_completo, d.email.toLowerCase(), hash, d.rol]));
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Ya existe un usuario con ese correo'); // email UNIQUE
    throw e;
  }
  try {
    // El administrador no tiene perfil académico (no hay tabla en Prácticas): solo tiene cuenta.
    if (d.rol !== 'administrador') {
      await llamar(urls.practicas, '/api/v1/internal/perfil', { method: 'POST', interno: true, body: { usuario_id: u.id, rol: d.rol, datos: d.perfil } });
    }
  } catch (e) {
    // Acción compensatoria: sin transacción distribuida, deshacemos el usuario si el perfil falló.
    await query('DELETE FROM usuarios WHERE id=$1', [u.id]);
    throw e;
  }
  await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'identidad', accion: 'usuario_creado', detalle: { usuario_id: u.id, rol: d.rol } });
  res.status(201).json(u);
}));

// ---------- GET /usuarios (solo administrador) ----------
r.get('/usuarios', autenticar, requerirRol('administrador'), asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT id,nombre_completo,email,rol,estado,fecha_creacion FROM usuarios ORDER BY id');
  res.json(rows);
}));

// ---------- PATCH /usuarios/:id/estado (solo administrador): activar / desactivar una cuenta ----------
// Un usuario inactivo no puede iniciar sesión (el login ya exige estado = 'activo'). Nadie puede desactivarse a sí mismo.
r.patch('/usuarios/:id(\\d+)/estado', autenticar, requerirRol('administrador'),
  validar(z.object({ estado: z.enum(['activo', 'inactivo']) })),
  asyncHandler(async (req, res) => {
    if (Number(req.params.id) === req.usuario.sub) throw new HttpError(409, 'No puede cambiar el estado de su propia cuenta');
    const { rows: [u] } = await query('UPDATE usuarios SET estado=$2 WHERE id=$1 RETURNING id,nombre_completo,email,rol,estado', [req.params.id, req.body.estado]);
    if (!u) throw new HttpError(404, 'Usuario no encontrado');
    await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'identidad', accion: req.body.estado === 'activo' ? 'usuario_activado' : 'usuario_desactivado', detalle: { usuario_id: u.id } });
    res.json(u);
  }));

// ---------- PATCH /usuarios/:id/password (solo administrador): restablecer contraseña ----------
r.patch('/usuarios/:id(\\d+)/password', autenticar, requerirRol('administrador'),
  validar(z.object({ password: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const hash = await bcrypt.hash(req.body.password, 10);
    const { rows: [u] } = await query('UPDATE usuarios SET password_hash=$2 WHERE id=$1 RETURNING id,email', [req.params.id, hash]);
    if (!u) throw new HttpError(404, 'Usuario no encontrado');
    await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'identidad', accion: 'password_restablecida', detalle: { usuario_id: u.id } });
    res.json({ id: u.id, email: u.email });
  }));

/**
 * Arranque: deja al día las bases creadas con versiones anteriores (sin perder datos).
 *  1) amplía el CHECK de usuarios.rol para aceptar 'administrador';
 *  2) si NO existe ningún administrador y están definidas ADMIN_EMAIL y ADMIN_PASSWORD, crea el primero.
 * Así una base antigua obtiene su administrador sin reiniciar los datos, y en producción la contraseña no queda en el código.
 */
async function asegurarAdministrador() {
  await query('ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check');
  await query("ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('estudiante','tutor','docente','director','administrador'))");
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  const { rows: [h] } = await query("SELECT COUNT(*)::int AS n FROM usuarios WHERE rol='administrador'");
  if (h.n > 0) return;
  await query("INSERT INTO usuarios(nombre_completo,email,password_hash,rol) VALUES($1,$2,$3,'administrador') ON CONFLICT (email) DO UPDATE SET rol='administrador', estado='activo'",
    [ADMIN_NOMBRE || 'Administrador del sistema', ADMIN_EMAIL.toLowerCase(), await bcrypt.hash(ADMIN_PASSWORD, 10)]);
  console.log(`[identidad] administrador inicial creado: ${ADMIN_EMAIL}`);
}
asegurarAdministrador().catch((e) => console.warn('[identidad] no se pudo preparar el administrador:', e.message));

app.use('/api/v1', r);
arrancar(app, 'identidad', puertos.identidad);
