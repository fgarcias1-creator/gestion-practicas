// Servicio de Evaluación y Calificación: evaluación del tutor y calificación del docente (RF06).
const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../../config/pg');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { HttpError, ah } = require('../../utils/http');
const { audit, notificar } = require('../../utils/audit');
const { refrescarEstados } = require('../../utils/estados');
// En la arquitectura distribuida esta consulta sería una llamada REST al Servicio de Seguimiento.
const { sesionesValidadas, recalcBitacora } = require('../seguimiento/seguimiento.service');

const asig = async (id) => (await query('SELECT * FROM asignaciones WHERE id = $1', [id])).rows[0];

// El tutor evalúa desempeño y cumplimiento; no asigna calificación.
const ev = z.object({ asignacion_id: z.number().int(), disposicion: z.number().int().min(1).max(5), cumplimiento: z.number().int().min(1).max(5), observaciones: z.string().optional() });
router.post('/evaluaciones', auth('tutor'), validate(ev), ah(async (req, res) => {
  await refrescarEstados();
  const b = req.body, a = await asig(b.asignacion_id);
  if (!a || a.tutor_id !== req.user.ref) throw new HttpError(403, 'La asignación no está a su cargo');
  if (!['en_curso', 'evaluado'].includes(a.estado)) throw new HttpError(409, `No se puede evaluar una práctica en estado «${a.estado}»`);
  const out = await tx(async (c) => {
    const r = (await c.query('INSERT INTO evaluaciones_tutor (asignacion_id,tutor_id,disposicion,cumplimiento,observaciones) VALUES ($1,$2,$3,$4,$5) RETURNING *', [a.id, a.tutor_id, b.disposicion, b.cumplimiento, b.observaciones])).rows[0];
    await c.query("UPDATE asignaciones SET estado = 'evaluado' WHERE id = $1 AND estado = 'en_curso'", [a.id]);
    return r;
  });
  const d = (await query('SELECT usuario_id FROM docentes WHERE id = $1', [a.docente_id])).rows[0];
  await notificar(d.usuario_id, 'El tutor registró la evaluación de un estudiante a su cargo.');
  await recalcBitacora(a.estudiante_id);
  await audit(req, 'evaluacion', 'evaluacion_tutor_registrada', { asignacion_id: a.id });
  res.status(201).json(out);
}));
router.get('/evaluaciones', auth('tutor', 'docente', 'director'), ah(async (req, res) => {
  const { rows } = await query(`SELECT ev.*, a.docente_id FROM evaluaciones_tutor ev JOIN asignaciones a ON a.id = ev.asignacion_id
    WHERE ($1::int IS NULL OR ev.asignacion_id = $1) ORDER BY ev.id`, [req.query.asignacion_id || null]);
  const propia = (r) => req.user.rol === 'director' || (req.user.rol === 'tutor' && r.tutor_id === req.user.ref) || (req.user.rol === 'docente' && r.docente_id === req.user.ref);
  res.json(rows.filter(propia));
}));

// RF06: vista consolidada para el docente: evaluación del tutor + sesiones validadas.
router.get('/calificaciones/consolidado/:asignacionId', auth('docente', 'director'), ah(async (req, res) => {
  const a = await asig(req.params.asignacionId);
  if (!a) throw new HttpError(404, 'Asignación no encontrada');
  if (req.user.rol === 'docente' && a.docente_id !== req.user.ref) throw new HttpError(403, 'La asignación no está a su cargo');
  const evaluaciones = (await query('SELECT * FROM evaluaciones_tutor WHERE asignacion_id = $1 ORDER BY id', [a.id])).rows;
  const sesiones = await sesionesValidadas(a.id);
  const calificaciones = (await query('SELECT * FROM calificaciones WHERE asignacion_id = $1 ORDER BY id', [a.id])).rows;
  res.json({ asignacion: a, evaluaciones, sesiones, horas_validadas: sesiones.reduce((t, s) => t + s.horas, 0), calificaciones });
}));

const nota = z.number().min(0).max(5).refine((n) => Math.round(n * 10) === n * 10, 'use un decimal (p. ej., 4.5)');
router.post('/calificaciones', auth('docente'), validate(z.object({ asignacion_id: z.number().int(), nota, retroalimentacion: z.string().min(3) })), ah(async (req, res) => {
  const b = req.body, a = await asig(b.asignacion_id);
  if (!a || a.docente_id !== req.user.ref) throw new HttpError(403, 'La asignación no está a su cargo');
  if (a.estado !== 'evaluado') throw new HttpError(409, a.estado === 'en_curso' ? 'El tutor aún no registra la evaluación del estudiante' : `La práctica está en estado «${a.estado}»; use una corrección si ya fue calificada`);
  if ((await sesionesValidadas(a.id)).length === 0) throw new HttpError(409, 'No hay sesiones validadas para fundamentar la calificación');
  const out = await tx(async (c) => {
    const r = (await c.query('INSERT INTO calificaciones (asignacion_id,docente_id,nota,retroalimentacion) VALUES ($1,$2,$3,$4) RETURNING *', [a.id, a.docente_id, b.nota, b.retroalimentacion])).rows[0];
    await c.query("UPDATE asignaciones SET estado = 'calificado' WHERE id = $1", [a.id]);
    return r;
  });
  const e = (await query('SELECT usuario_id FROM estudiantes WHERE id = $1', [a.estudiante_id])).rows[0];
  await notificar(e.usuario_id, `Su práctica fue calificada: ${b.nota}.`);
  await recalcBitacora(a.estudiante_id);
  await audit(req, 'evaluacion', 'calificacion_registrada', { asignacion_id: a.id, calificacion_id: out.id, nota: b.nota });
  res.status(201).json(out);
}));
// Una calificación publicada no se edita ni se borra: la corrección crea un registro nuevo, con justificación y auditoría.
router.post('/calificaciones/:id/correccion', auth('docente'), validate(z.object({ nota, retroalimentacion: z.string().min(3), justificacion: z.string().min(5) })), ah(async (req, res) => {
  const o = (await query('SELECT c.*, a.docente_id AS doc FROM calificaciones c JOIN asignaciones a ON a.id = c.asignacion_id WHERE c.id = $1', [req.params.id])).rows[0];
  if (!o) throw new HttpError(404, 'Calificación no encontrada');
  if (o.doc !== req.user.ref) throw new HttpError(403, 'La calificación no corresponde a un estudiante a su cargo');
  const vigente = (await query('SELECT id FROM calificaciones WHERE asignacion_id = $1 ORDER BY id DESC LIMIT 1', [o.asignacion_id])).rows[0];
  if (vigente.id !== o.id) throw new HttpError(409, 'Solo se puede corregir la calificación vigente');
  const b = req.body;
  const r = (await query(`INSERT INTO calificaciones (asignacion_id,docente_id,nota,retroalimentacion,es_correccion,calificacion_original_id,justificacion_correccion)
    VALUES ($1,$2,$3,$4,TRUE,$5,$6) RETURNING *`, [o.asignacion_id, o.docente_id, b.nota, b.retroalimentacion, o.id, b.justificacion])).rows[0];
  await audit(req, 'evaluacion', 'calificacion_corregida', { calificacion_id: r.id, original: o.id, justificacion: b.justificacion });
  res.status(201).json(r);
}));
router.get('/calificaciones', auth(), ah(async (req, res) => {
  const { rows } = await query(`SELECT c.*, a.estudiante_id, a.docente_id AS doc FROM calificaciones c JOIN asignaciones a ON a.id = c.asignacion_id
    WHERE ($1::int IS NULL OR c.asignacion_id = $1) ORDER BY c.id`, [req.query.asignacion_id || null]);
  const ok = (r) => req.user.rol === 'director' || (req.user.rol === 'estudiante' && r.estudiante_id === req.user.ref) || (req.user.rol === 'docente' && r.doc === req.user.ref);
  res.json(rows.filter(ok));
}));
module.exports = router;
