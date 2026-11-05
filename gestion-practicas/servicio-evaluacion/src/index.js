/**
 * SERVICIO DE EVALUACIÓN Y CALIFICACIÓN (puerto 3004) - PostgreSQL
 * RF06 (documento del proyecto):
 *   1. El tutor evalúa el desempeño (SIN asignar nota).
 *   2. El docente consulta las sesiones validadas (REST a Seguimiento) y califica CADA UNA de 0.0 a 5.0 con retroalimentación.
 *   3. Cuando todas están calificadas, el sistema calcula la NOTA FINAL como promedio; el docente la confirma y la publica.
 *   4. Todo se guarda con fecha de registro y NO se modifica una vez publicado: solo cambia mediante una CORRECCIÓN
 *      explícita (individual o final) que exige justificación y queda en el log de auditoría.
 * Las calificaciones son de solo inserción: la vigente es la más reciente; las anteriores quedan como historial.
 */
const express = require('express');
const { z } = require('zod');
const { crearApp, arrancar } = require('./lib/servidor');
const { query, tx } = require('./lib/pg');
const { HttpError, asyncHandler, validar } = require('./lib/errors');
const { autenticar, requerirRol } = require('./lib/auth');
const { llamar } = require('./lib/http');
const { registrar } = require('./lib/audit');
const { notificar } = require('./lib/notificar');
const { urls, puertos } = require('./lib/config');

const app = crearApp('evaluacion');
const r = express.Router();
const A = autenticar;

/** Migración idempotente: tabla de calificaciones por sesión (bases creadas con versiones anteriores). */
async function asegurarEsquema() {
  await query(`CREATE TABLE IF NOT EXISTS calificaciones_sesion (
    id SERIAL PRIMARY KEY,
    asignacion_id INTEGER NOT NULL REFERENCES asignaciones(id),
    sesion_id VARCHAR(24) NOT NULL,
    docente_id INTEGER NOT NULL REFERENCES docentes(id),
    nota NUMERIC(3,1) NOT NULL CHECK (nota BETWEEN 0.0 AND 5.0),
    retroalimentacion TEXT NOT NULL,
    fecha_registro TIMESTAMP DEFAULT NOW(),
    es_correccion BOOLEAN DEFAULT FALSE,
    justificacion TEXT,
    CHECK (es_correccion = FALSE OR justificacion IS NOT NULL))`);
  await query('CREATE INDEX IF NOT EXISTS ix_calsesion ON calificaciones_sesion(asignacion_id, sesion_id, id DESC)');
  await query(`CREATE OR REPLACE FUNCTION bloquear_modificacion_calificacion() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'Las calificaciones publicadas no pueden modificarse ni eliminarse; registre una corrección' USING ERRCODE = 'P0001'; END;
    $$ LANGUAGE plpgsql`);
  await query('DROP TRIGGER IF EXISTS trg_calsesion_inmutables ON calificaciones_sesion');
  await query(`CREATE TRIGGER trg_calsesion_inmutables BEFORE UPDATE OR DELETE ON calificaciones_sesion
    FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_calificacion()`);
}
asegurarEsquema().catch((e) => console.warn('[evaluacion] no se pudo actualizar el esquema:', e.message));

const asignacionDe = (req, id) => llamar(urls.practicas, `/api/v1/asignaciones/${id}`, { token: req.token }); // 404 si no tiene acceso
const cambiarEstado = (req, id, estado) =>
  llamar(urls.practicas, `/api/v1/asignaciones/${id}/estado`, { method: 'PATCH', token: req.token, body: { estado } });
const sesionesValidadas = (req, id) =>
  llamar(urls.seguimiento, `/api/v1/sesiones?asignacion_id=${id}&estado=validadas`, { token: req.token });

/** Calificación FINAL vigente = el registro más reciente (las correcciones se agregan, nunca sobrescriben). */
async function calificaciones(asignacionId) {
  const { rows } = await query('SELECT * FROM calificaciones WHERE asignacion_id=$1 ORDER BY id DESC', [asignacionId]);
  return { vigente: rows[0] || null, historial: rows };
}

/** Nota vigente de cada sesión (la más reciente por sesión). */
async function vigentesSesion(asignacionId, cliente = { query }) {
  const { rows } = await cliente.query(
    'SELECT DISTINCT ON (sesion_id) * FROM calificaciones_sesion WHERE asignacion_id=$1 ORDER BY sesion_id, id DESC', [asignacionId]);
  return rows;
}

/** Cuántas sesiones validadas están calificadas, cuáles faltan y el promedio (1 decimal, redondeo hacia arriba en .x5). */
function resumenNotas(sesiones, vigentes) {
  const porSesion = Object.fromEntries(vigentes.map((v) => [v.sesion_id, v]));
  const calificadas = sesiones.filter((s) => porSesion[String(s._id)]);
  const faltan = sesiones.filter((s) => !porSesion[String(s._id)]);
  const suma = calificadas.reduce((t, s) => t + porSesion[String(s._id)].nota, 0);
  const promedio = calificadas.length ? Math.round((suma / calificadas.length + 1e-9) * 10) / 10 : null;
  return { total: sesiones.length, calificadas: calificadas.length, faltan, promedio, completo: sesiones.length > 0 && faltan.length === 0 };
}
const fechaCorta = (s) => String(s.fecha_sesion).slice(0, 10);

// ---------- Tutor: evaluación de desempeño (NO asigna nota) ----------
const esquemaEval = z.object({
  asignacion_id: z.number().int(), disposicion: z.number().int().min(1).max(5),
  cumplimiento: z.number().int().min(1).max(5), observaciones: z.string().optional(),
});
r.post('/evaluaciones', A, requerirRol('tutor'), validar(esquemaEval), asyncHandler(async (req, res) => {
  const d = req.body;
  const asg = await asignacionDe(req, d.asignacion_id);
  if (!['en_curso', 'evaluado'].includes(asg.estado)) throw new HttpError(409, 'La práctica no está en un estado evaluable');
  const { rows: [e] } = await query(
    'INSERT INTO evaluaciones_tutor(asignacion_id,tutor_id,disposicion,cumplimiento,observaciones) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [d.asignacion_id, req.usuario.perfil_id, d.disposicion, d.cumplimiento, d.observaciones]);
  if (asg.estado === 'en_curso') await cambiarEstado(req, d.asignacion_id, 'evaluado');
  await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'evaluacion', accion: 'evaluacion_tutor_registrada', detalle: { asignacion_id: d.asignacion_id } });
  res.status(201).json(e);
}));

/** Pasos 1-8 del diagrama de secuencia: evaluación del tutor + sesiones validadas (REST a Seguimiento) + notas por sesión + nota final. */
r.get('/evaluaciones/:asignacionId(\\d+)', A, requerirRol('docente', 'tutor', 'director'), asyncHandler(async (req, res) => {
  const id = req.params.asignacionId;
  const asignacion = await asignacionDe(req, id);
  const { rows: evaluaciones } = await query('SELECT * FROM evaluaciones_tutor WHERE asignacion_id=$1 ORDER BY id', [id]);
  const sesiones = await sesionesValidadas(req, id);
  const notas_sesion = await vigentesSesion(id);
  const { faltan, ...resumen } = resumenNotas(sesiones, notas_sesion);
  res.json({ asignacion, evaluaciones, sesiones, notas_sesion, resumen: { ...resumen, faltan: faltan.length }, ...(await calificaciones(id)) });
}));

// ---------- Docente: calificar cada sesión (RF06) ----------
const esquemaNotaSesion = z.object({
  asignacion_id: z.number().int(), sesion_id: z.string().min(1).max(24),
  nota: z.number().min(0, 'La nota va de 0.0 a 5.0').max(5, 'La nota va de 0.0 a 5.0'),
  retroalimentacion: z.string().min(5, 'La retroalimentación es obligatoria'),
  justificacion: z.string().min(5, 'La justificación es obligatoria').optional(),
});

/**
 * Registra la nota de UNA sesión. Antes de publicar la nota final es un borrador (se puede volver a calificar: queda el historial).
 * Después de publicada es una CORRECCIÓN INDIVIDUAL: exige justificación y recalcula y publica una nueva nota final.
 */
r.post('/calificaciones/sesiones', A, requerirRol('docente'), validar(esquemaNotaSesion), asyncHandler(async (req, res) => {
  const d = req.body;
  const asg = await asignacionDe(req, d.asignacion_id); // el docente debe ser el de esa asignación
  const sesiones = await sesionesValidadas(req, d.asignacion_id);
  const sesion = sesiones.find((s) => String(s._id) === d.sesion_id);
  if (!sesion) throw new HttpError(404, 'La sesión no existe o aún no está validada por el tutor');
  const { rows: [final] } = await query('SELECT id FROM calificaciones WHERE asignacion_id=$1 AND es_correccion=FALSE', [d.asignacion_id]);
  const publicada = Boolean(final);
  if (publicada && !d.justificacion) {
    throw new HttpError(400, 'Datos inválidos', [{ campo: 'justificacion', mensaje: 'La nota final ya fue publicada: corregir una sesión exige justificación' }]);
  }

  const resultado = await tx(async (c) => {
    const { rows: [ns] } = await c.query(
      `INSERT INTO calificaciones_sesion(asignacion_id,sesion_id,docente_id,nota,retroalimentacion,es_correccion,justificacion)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [d.asignacion_id, d.sesion_id, req.usuario.perfil_id, d.nota, d.retroalimentacion, publicada, publicada ? d.justificacion : null]);
    if (!publicada) return { calificacion_sesion: ns };
    const { promedio } = resumenNotas(sesiones, await vigentesSesion(d.asignacion_id, c));
    const { rows: [nf] } = await c.query(
      `INSERT INTO calificaciones(asignacion_id,docente_id,nota,retroalimentacion,es_correccion,calificacion_original_id,justificacion)
       VALUES($1,$2,$3,$4,TRUE,$5,$6) RETURNING *`,
      [d.asignacion_id, req.usuario.perfil_id, promedio, `Nota final recalculada por la corrección de la sesión del ${fechaCorta(sesion)}`, final.id, d.justificacion]);
    return { calificacion_sesion: ns, nota_final: nf };
  });

  await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'evaluacion', accion: publicada ? 'calificacion_sesion_corregida' : 'calificacion_sesion_registrada',
    detalle: { asignacion_id: d.asignacion_id, sesion_id: d.sesion_id, nota: d.nota, ...(publicada && { justificacion: d.justificacion, nota_final: resultado.nota_final.nota }) } });
  if (publicada) {
    await notificar([{ usuario_id: asg.estudiante_usuario_id, tipo: 'calificacion', titulo: 'Su calificación fue corregida',
      mensaje: `Se corrigió la sesión del ${fechaCorta(sesion)} y su nota final quedó en ${resultado.nota_final.nota}. Justificación: ${d.justificacion}` }]);
  }
  res.status(201).json(resultado);
}));

// ---------- Docente: confirmar y publicar la nota final (promedio) ----------
r.post('/calificaciones', A, requerirRol('docente'),
  validar(z.object({ asignacion_id: z.number().int(), retroalimentacion: z.string().min(5, 'La retroalimentación final es obligatoria') })),
  asyncHandler(async (req, res) => {
    const d = req.body;
    const asg = await asignacionDe(req, d.asignacion_id);
    const { rows: [{ n }] } = await query('SELECT COUNT(*)::int AS n FROM evaluaciones_tutor WHERE asignacion_id=$1', [d.asignacion_id]);
    if (!n) throw new HttpError(409, 'No se puede calificar sin la evaluación del tutor');
    const sesiones = await sesionesValidadas(req, d.asignacion_id);
    if (!sesiones.length) throw new HttpError(409, 'No hay sesiones validadas para calificar');
    const { faltan, promedio } = resumenNotas(sesiones, await vigentesSesion(d.asignacion_id));
    if (faltan.length) {
      throw new HttpError(409, `Faltan ${faltan.length} sesión(es) por calificar antes de publicar la nota final`,
        faltan.map((s) => `Sesión del ${fechaCorta(s)}`));
    }
    const { rows: [c] } = await query( // el índice único parcial impide una segunda calificación "original"
      'INSERT INTO calificaciones(asignacion_id,docente_id,nota,retroalimentacion) VALUES($1,$2,$3,$4) RETURNING *',
      [d.asignacion_id, req.usuario.perfil_id, promedio, d.retroalimentacion]);
    await cambiarEstado(req, d.asignacion_id, 'calificado');
    await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'evaluacion', accion: 'calificacion_registrada', detalle: { asignacion_id: d.asignacion_id, nota: promedio, sesiones: sesiones.length } });
    await notificar([{ usuario_id: asg.estudiante_usuario_id, tipo: 'calificacion', titulo: 'Calificación publicada',
      mensaje: `Su calificación final de la práctica en ${asg.institucion} ya está disponible: ${promedio}.` }]);
    res.status(201).json(c);
  }));

/** Corrección FINAL explícita: NUEVO registro (es_correccion = true) con justificación obligatoria. El original no se toca. */
r.post('/calificaciones/:id(\\d+)/correccion', A, requerirRol('docente'),
  validar(z.object({
    nota: z.number().min(0, 'La nota va de 0.0 a 5.0').max(5, 'La nota va de 0.0 a 5.0'),
    retroalimentacion: z.string().min(5, 'La retroalimentación es obligatoria'), justificacion: z.string().min(5, 'La justificación es obligatoria'),
  })),
  asyncHandler(async (req, res) => {
    const { rows: [orig] } = await query('SELECT * FROM calificaciones WHERE id=$1', [req.params.id]);
    if (!orig) throw new HttpError(404, 'Calificación no encontrada');
    const asg = await asignacionDe(req, orig.asignacion_id);
    const raizId = orig.es_correccion ? orig.calificacion_original_id : orig.id;
    const d = req.body;
    const { rows: [c] } = await query(
      `INSERT INTO calificaciones(asignacion_id,docente_id,nota,retroalimentacion,es_correccion,calificacion_original_id,justificacion)
       VALUES($1,$2,$3,$4,TRUE,$5,$6) RETURNING *`,
      [orig.asignacion_id, req.usuario.perfil_id, d.nota, d.retroalimentacion, raizId, d.justificacion]);
    await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'evaluacion', accion: 'calificacion_corregida',
      detalle: { asignacion_id: orig.asignacion_id, nota_anterior: orig.nota, nota_nueva: d.nota, justificacion: d.justificacion } });
    await notificar([{ usuario_id: asg.estudiante_usuario_id, tipo: 'calificacion', titulo: 'Su calificación fue corregida',
      mensaje: `Nueva nota: ${d.nota}. Justificación del docente: ${d.justificacion}` }]);
    res.status(201).json(c);
  }));

// Calificaciones vigentes de todas las asignaciones (insumo del Servicio de Reportes)
r.get('/calificaciones', A, requerirRol('director'), asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT DISTINCT ON (asignacion_id) * FROM calificaciones ORDER BY asignacion_id, id DESC');
  res.json(rows);
}));

/** Lo que ve el estudiante (y los demás roles con acceso) una vez publicada la nota final: nota, historial y notas por sesión. */
r.get('/calificaciones/:asignacionId(\\d+)', A, asyncHandler(async (req, res) => {
  await asignacionDe(req, req.params.asignacionId); // control de acceso por rol
  const c = await calificaciones(req.params.asignacionId);
  if (!c.vigente) throw new HttpError(404, 'Aún no hay calificación publicada');
  res.json({ ...c, sesiones: await vigentesSesion(req.params.asignacionId) });
}));

app.use('/api/v1', r);
arrancar(app, 'evaluacion', puertos.evaluacion);
