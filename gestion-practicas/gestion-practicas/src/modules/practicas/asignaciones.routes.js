// Servicio de Prácticas: asignación de práctica (RF02).
const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../../config/pg');
const cfg = require('../../config/env');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { HttpError, ah } = require('../../utils/http');
const { audit, notificar } = require('../../utils/audit');
const { refrescarEstados } = require('../../utils/estados');

const SELECT = `
  SELECT a.*, e.codigo_estudiantil, ue.nombre_completo AS estudiante, i.nombre AS institucion,
         ut.nombre_completo AS tutor, ud.nombre_completo AS docente
  FROM asignaciones a
  JOIN estudiantes e ON e.id = a.estudiante_id JOIN usuarios ue ON ue.id = e.usuario_id
  JOIN instituciones i ON i.id = a.institucion_id
  JOIN tutores t ON t.id = a.tutor_id JOIN usuarios ut ON ut.id = t.usuario_id
  JOIN docentes d ON d.id = a.docente_id JOIN usuarios ud ON ud.id = d.usuario_id`;

// Cada rol ve solo las asignaciones que le corresponden; el director ve todas.
router.get('/asignaciones', auth(), ah(async (req, res) => {
  await refrescarEstados();
  const filtro = { estudiante: 'a.estudiante_id', tutor: 'a.tutor_id', docente: 'a.docente_id' }[req.user.rol];
  const { rows } = filtro ? await query(`${SELECT} WHERE ${filtro} = $1 ORDER BY a.id`, [req.user.ref]) : await query(`${SELECT} ORDER BY a.id`);
  res.json(rows);
}));
router.get('/asignaciones/:id', auth(), ah(async (req, res) => {
  await refrescarEstados();
  const a = (await query(`${SELECT} WHERE a.id = $1`, [req.params.id])).rows[0];
  if (!a) throw new HttpError(404, 'Asignación no encontrada');
  const propio = { estudiante: a.estudiante_id, tutor: a.tutor_id, docente: a.docente_id }[req.user.rol];
  if (req.user.rol !== 'director' && propio !== req.user.ref) throw new HttpError(403, 'No tiene permiso para ver esta asignación');
  res.json(a);
}));

const crear = z.object({
  estudiante_id: z.number().int(), institucion_id: z.number().int(), tutor_id: z.number().int(), docente_id: z.number().int(),
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use el formato AAAA-MM-DD'),
});
// El director asocia estudiante + institución + tutor + docente. Todo ocurre en una transacción.
router.post('/asignaciones', auth('director'), validate(crear), ah(async (req, res) => {
  const b = req.body;
  const a = await tx(async (c) => {
    const est = (await c.query('SELECT * FROM estudiantes WHERE id = $1 FOR UPDATE', [b.estudiante_id])).rows[0];
    if (!est) throw new HttpError(404, 'Estudiante no encontrado');
    if (est.estado_solicitud !== 'pendiente') throw new HttpError(409, 'El estudiante no está pendiente de asignación');
    const ins = (await c.query('SELECT * FROM instituciones WHERE id = $1 FOR UPDATE', [b.institucion_id])).rows[0];
    if (!ins) throw new HttpError(404, 'Institución no encontrada');
    if (ins.cupo_disponible < 1) throw new HttpError(409, 'La institución no tiene cupos disponibles');
    const conv = (await c.query('SELECT * FROM convenios WHERE institucion_id = $1 AND fecha_inicio <= CURRENT_DATE AND fecha_fin >= CURRENT_DATE ORDER BY fecha_fin DESC LIMIT 1', [ins.id])).rows[0];
    if (!conv) throw new HttpError(409, 'La institución no tiene un convenio vigente');
    const tutor = (await c.query('SELECT * FROM tutores WHERE id = $1 AND institucion_id = $2', [b.tutor_id, ins.id])).rows[0];
    if (!tutor) throw new HttpError(409, 'El tutor no pertenece a la institución seleccionada');
    const doc = (await c.query('SELECT * FROM docentes WHERE id = $1', [b.docente_id])).rows[0];
    if (!doc) throw new HttpError(404, 'Docente no encontrado');
    const row = (await c.query(`INSERT INTO asignaciones (estudiante_id,institucion_id,tutor_id,docente_id,convenio_id,fecha_inicio_practica,horas_requeridas)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [est.id, ins.id, tutor.id, doc.id, conv.id, b.fecha_inicio, cfg.horasRequeridas])).rows[0];
    await c.query('UPDATE instituciones SET cupo_disponible = cupo_disponible - 1 WHERE id = $1', [ins.id]);
    await c.query("UPDATE estudiantes SET estado_solicitud = 'asignado' WHERE id = $1", [est.id]);
    row._notificar = [est.usuario_id, tutor.usuario_id];
    return row;
  });
  const dest = a._notificar; delete a._notificar;
  for (const u of dest) await notificar(u, `Se confirmó la asignación de práctica con inicio el ${b.fecha_inicio}.`);
  await audit(req, 'practicas', 'asignacion_creada', { asignacion_id: a.id, estudiante_id: b.estudiante_id, institucion_id: b.institucion_id });
  await refrescarEstados();
  res.status(201).json((await query(`${SELECT} WHERE a.id = $1`, [a.id])).rows[0]);
}));

// Cierre de la práctica una vez calificada.
router.patch('/asignaciones/:id/finalizar', auth('director'), ah(async (req, res) => {
  const { rows } = await query("UPDATE asignaciones SET estado = 'finalizado' WHERE id = $1 AND estado = 'calificado' RETURNING *", [req.params.id]);
  if (!rows[0]) throw new HttpError(409, 'Solo se puede finalizar una práctica calificada');
  await audit(req, 'practicas', 'practica_finalizada', { asignacion_id: rows[0].id });
  res.json(rows[0]);
}));
module.exports = router;
