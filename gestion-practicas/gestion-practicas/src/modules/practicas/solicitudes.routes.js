// Servicio de Prácticas: estudiantes y solicitudes de inicio de práctica (RF01).
const router = require('express').Router();
const { z } = require('zod');
const cfg = require('../../config/env');
const { query } = require('../../config/pg');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { HttpError, ah } = require('../../utils/http');
const { audit, notificar } = require('../../utils/audit');

// Listado de estudiantes; ?estado=pendiente alimenta el listado de pendientes de asignación del director (RF02).
router.get('/estudiantes', auth('director', 'docente'), ah(async (req, res) => {
  const { rows } = await query(`SELECT e.*, u.nombre_completo, u.email FROM estudiantes e JOIN usuarios u ON u.id = e.usuario_id
    WHERE ($1::text IS NULL OR e.estado_solicitud = $1) ORDER BY e.id`, [req.query.estado || null]);
  res.json(rows);
}));
router.get('/estudiantes/me', auth('estudiante'), ah(async (req, res) => {
  const { rows } = await query('SELECT e.*, u.nombre_completo FROM estudiantes e JOIN usuarios u ON u.id = e.usuario_id WHERE e.id = $1', [req.user.ref]);
  res.json(rows[0]);
}));

// RF01: el estudiante solicita iniciar práctica; el sistema verifica los requisitos automáticamente.
router.post('/solicitudes', auth('estudiante'), ah(async (req, res) => {
  const e = (await query('SELECT * FROM estudiantes WHERE id = $1', [req.user.ref])).rows[0];
  const faltantes = [];
  if (e.semestre < cfg.reqSemestre) faltantes.push(`Semestre habilitado: ${cfg.reqSemestre}.º o superior (usted cursa ${e.semestre}.º)`);
  if (e.porcentaje_creditos < cfg.reqCreditos) faltantes.push(`Créditos aprobados: mínimo ${cfg.reqCreditos}% (usted tiene ${e.porcentaje_creditos}%)`);
  if (faltantes.length) {
    await audit(req, 'practicas', 'solicitud_rechazada_requisitos', { faltantes }, 'fallido');
    throw new HttpError(422, 'No cumple los requisitos para solicitar la práctica', faltantes);
  }
  if (!['no_solicitado', 'rechazado'].includes(e.estado_solicitud)) throw new HttpError(409, `Ya tiene una solicitud en estado «${e.estado_solicitud}»`);
  const { rows } = await query("UPDATE estudiantes SET estado_solicitud = 'pendiente', motivo_rechazo = NULL WHERE id = $1 RETURNING *", [e.id]);
  await audit(req, 'practicas', 'solicitud_creada', { estudiante_id: e.id });
  res.status(201).json(rows[0]);
}));

// Rechazo de una solicitud pendiente, con motivo obligatorio y notificación al estudiante.
router.patch('/solicitudes/:estudianteId/rechazar', auth('director', 'docente'), validate(z.object({ motivo: z.string().min(3) })), ah(async (req, res) => {
  const e = (await query('SELECT * FROM estudiantes WHERE id = $1', [req.params.estudianteId])).rows[0];
  if (!e) throw new HttpError(404, 'Estudiante no encontrado');
  if (e.estado_solicitud !== 'pendiente') throw new HttpError(409, 'Solo se pueden rechazar solicitudes pendientes');
  const { rows } = await query("UPDATE estudiantes SET estado_solicitud = 'rechazado', motivo_rechazo = $2 WHERE id = $1 RETURNING *", [e.id, req.body.motivo]);
  await notificar(e.usuario_id, `Su solicitud de práctica fue rechazada. Motivo: ${req.body.motivo}`);
  await audit(req, 'practicas', 'solicitud_rechazada', { estudiante_id: e.id, motivo: req.body.motivo });
  res.json(rows[0]);
}));
module.exports = router;
