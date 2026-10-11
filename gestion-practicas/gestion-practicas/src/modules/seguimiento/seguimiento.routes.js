// Servicio de Seguimiento (MongoDB): sesiones, evidencias, validación y bitácora (RF04, RF05).
const router = require('express').Router();
const multer = require('multer');
const { z } = require('zod');
const cfg = require('../../config/env');
const { query } = require('../../config/pg');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { HttpError, ah } = require('../../utils/http');
const { audit, notificar } = require('../../utils/audit');
const { refrescarEstados } = require('../../utils/estados');
const Sesion = require('./sesion.model');
const Bitacora = require('./bitacora.model');
const { recalcBitacora, autoConfirmar } = require('./seguimiento.service');

// Evidencias: solo PDF o imagen, máximo 5 MB por archivo.
const upload = multer({
  storage: multer.diskStorage({ destination: cfg.uploadDir, filename: (q, f, cb) => cb(null, `${Date.now()}-${f.originalname.replace(/[^\w.-]/g, '_')}`) }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (q, f, cb) => (/^(application\/pdf|image\/)/.test(f.mimetype) ? cb(null, true) : cb(new HttpError(400, 'La evidencia debe ser un PDF o una imagen'))),
});
const aEvidencias = (files = []) => files.map((f) => ({ tipo: f.mimetype.startsWith('image') ? 'imagen' : 'documento', nombre: f.originalname, url: `/uploads/${f.filename}` }));
const hoy = () => new Date().toISOString().slice(0, 10);

const asignacion = async (id) => (await query('SELECT * FROM asignaciones WHERE id = $1', [id])).rows[0];
const sesionDe = async (id) => { const s = await Sesion.findById(id); if (!s) throw new HttpError(404, 'Sesión no encontrada'); return s; };
const soloDueno = (req, s) => { if (s.estudiante_id !== req.user.ref) throw new HttpError(403, 'La sesión pertenece a otro estudiante'); };

// RF04: el estudiante registra la sesión (borrador o envío) con su evidencia.
router.post('/sesiones', auth('estudiante'), upload.array('evidencia', 5), ah(async (req, res) => {
  await refrescarEstados();
  const b = req.body;
  const a = await asignacion(+b.asignacion_id);
  if (!a || a.estudiante_id !== req.user.ref) throw new HttpError(403, 'La asignación no le pertenece');
  if (a.estado !== 'en_curso') throw new HttpError(409, 'Solo puede registrar sesiones cuando la práctica está «en curso»');
  const horas = Number(b.horas);
  if (!(horas >= 1 && horas <= 12)) throw new HttpError(400, 'Las horas deben estar entre 1 y 12');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha_sesion || '') || b.fecha_sesion > hoy()) throw new HttpError(400, 'La fecha de la sesión es inválida o futura');
  if (!b.resumen || !b.resumen.trim()) throw new HttpError(400, 'El resumen de actividades es obligatorio');
  const enviar = b.enviar === 'true' || b.enviar === true;
  const evidencias = aEvidencias(req.files);
  if (enviar && !evidencias.length) throw new HttpError(400, 'Adjunte al menos una evidencia para enviar la sesión');
  const s = await Sesion.create({
    asignacion_id: a.id, estudiante_id: a.estudiante_id, tutor_id: a.tutor_id, fecha_sesion: b.fecha_sesion, horas, resumen: b.resumen.trim(), evidencias,
    estado_validacion: enviar ? 'pendiente_validacion' : 'borrador', fecha_envio: enviar ? new Date() : undefined, // RNF02: fecha del servidor
  });
  if (enviar) {
    const tutor = (await query('SELECT usuario_id FROM tutores WHERE id = $1', [a.tutor_id])).rows[0];
    await notificar(tutor.usuario_id, 'Tiene una sesión pendiente de validación.');
    await audit(req, 'seguimiento', 'sesion_enviada', { sesion_id: s._id, asignacion_id: a.id });
  }
  res.status(201).json(s);
}));

// Edición del borrador (mientras no se envía, el estudiante puede modificarlo, agregar evidencias o eliminarlo).
router.put('/sesiones/:id', auth('estudiante'), upload.array('evidencia', 5), ah(async (req, res) => {
  const s = await sesionDe(req.params.id); soloDueno(req, s);
  if (s.estado_validacion !== 'borrador') throw new HttpError(409, 'Una sesión enviada no se puede editar');
  const b = req.body;
  if (b.horas !== undefined) { const h = Number(b.horas); if (!(h >= 1 && h <= 12)) throw new HttpError(400, 'Las horas deben estar entre 1 y 12'); s.horas = h; }
  if (b.resumen) s.resumen = b.resumen.trim();
  if (b.fecha_sesion) { if (b.fecha_sesion > hoy()) throw new HttpError(400, 'La fecha no puede ser futura'); s.fecha_sesion = b.fecha_sesion; }
  s.evidencias.push(...aEvidencias(req.files));
  await s.save();
  res.json(s);
}));
router.delete('/sesiones/:id', auth('estudiante'), ah(async (req, res) => {
  const s = await sesionDe(req.params.id); soloDueno(req, s);
  if (s.estado_validacion !== 'borrador') throw new HttpError(409, 'Solo se pueden eliminar borradores'); // RNF02
  await s.deleteOne();
  res.status(204).end();
}));
router.patch('/sesiones/:id/enviar', auth('estudiante'), ah(async (req, res) => {
  const s = await sesionDe(req.params.id); soloDueno(req, s);
  if (s.estado_validacion !== 'borrador') throw new HttpError(409, 'La sesión ya fue enviada');
  if (!s.evidencias.length) throw new HttpError(400, 'Adjunte al menos una evidencia para enviar la sesión');
  s.estado_validacion = 'pendiente_validacion'; s.fecha_envio = new Date();
  await s.save();
  const tutor = (await query('SELECT usuario_id FROM tutores WHERE id = $1', [s.tutor_id])).rows[0];
  await notificar(tutor.usuario_id, 'Tiene una sesión pendiente de validación.');
  await audit(req, 'seguimiento', 'sesion_enviada', { sesion_id: s._id });
  res.json(s);
}));
// Una sesión rechazada se reenvía como NUEVA entrega; la original se conserva íntegra (RNF02).
router.post('/sesiones/:id/reenviar', auth('estudiante'), upload.array('evidencia', 5), ah(async (req, res) => {
  const o = await sesionDe(req.params.id); soloDueno(req, o);
  if (o.estado_validacion !== 'requiere_correccion' || o.reenviada) throw new HttpError(409, 'Solo se reenvían sesiones que requieren corrección');
  const evidencias = req.files && req.files.length ? aEvidencias(req.files) : o.evidencias.map((e) => ({ tipo: e.tipo, nombre: e.nombre, url: e.url }));
  const n = await Sesion.create({
    asignacion_id: o.asignacion_id, estudiante_id: o.estudiante_id, tutor_id: o.tutor_id, fecha_sesion: o.fecha_sesion,
    horas: req.body.horas ? Number(req.body.horas) : o.horas, resumen: req.body.resumen || o.resumen, evidencias,
    estado_validacion: 'pendiente_validacion', fecha_envio: new Date(), reenvio_de: o._id,
  });
  o.reenviada = true; await o.save();
  await audit(req, 'seguimiento', 'sesion_reenviada', { sesion_id: n._id, reenvio_de: o._id });
  res.status(201).json(n);
}));

// RF04 / RNF01: el tutor valida con un único clic.
router.patch('/sesiones/:id/validar', auth('tutor'), ah(async (req, res) => {
  const s = await sesionDe(req.params.id);
  if (s.tutor_id !== req.user.ref) throw new HttpError(403, 'La sesión no pertenece a un estudiante a su cargo');
  if (s.estado_validacion !== 'pendiente_validacion') throw new HttpError(409, 'La sesión no está pendiente de validación');
  s.estado_validacion = 'validada_tutor'; s.validacion_automatica = false; s.fecha_validacion = new Date();
  await s.save();
  await recalcBitacora(s.estudiante_id);
  await audit(req, 'seguimiento', 'validacion_asistencia', { sesion_id: s._id, asignacion_id: s.asignacion_id });
  res.json(s);
}));
router.patch('/sesiones/:id/rechazar', auth('tutor'), validate(z.object({ observacion: z.string().min(3) })), ah(async (req, res) => {
  const s = await sesionDe(req.params.id);
  if (s.tutor_id !== req.user.ref) throw new HttpError(403, 'La sesión no pertenece a un estudiante a su cargo');
  if (s.estado_validacion !== 'pendiente_validacion') throw new HttpError(409, 'La sesión no está pendiente de validación');
  s.estado_validacion = 'requiere_correccion'; s.observacion = req.body.observacion; s.fecha_validacion = new Date();
  await s.save();
  const e = (await query('SELECT usuario_id FROM estudiantes WHERE id = $1', [s.estudiante_id])).rows[0];
  await notificar(e.usuario_id, `Su sesión del ${s.fecha_sesion} requiere corrección: ${req.body.observacion}`);
  await audit(req, 'seguimiento', 'sesion_rechazada', { sesion_id: s._id, observacion: req.body.observacion });
  res.json(s);
}));

// Listados filtrados por rol.
router.get('/sesiones', auth(), ah(async (req, res) => {
  const f = {};
  if (req.query.asignacion_id) f.asignacion_id = Number(req.query.asignacion_id);
  if (req.query.estado) f.estado_validacion = req.query.estado;
  if (req.user.rol === 'estudiante') f.estudiante_id = req.user.ref;
  else if (req.user.rol === 'tutor') f.tutor_id = req.user.ref;
  else if (req.user.rol === 'docente') {
    const ids = (await query('SELECT id FROM asignaciones WHERE docente_id = $1', [req.user.ref])).rows.map((r) => r.id);
    f.asignacion_id = f.asignacion_id ? (ids.includes(f.asignacion_id) ? f.asignacion_id : -1) : { $in: ids };
  } else if (req.query.estudiante_id) f.estudiante_id = Number(req.query.estudiante_id);
  res.json(await Sesion.find(f).sort({ fecha_sesion: -1 }));
}));
// Bandeja del tutor: pendientes con el tiempo restante antes de la confirmación automática.
router.get('/sesiones-pendientes', auth('tutor'), ah(async (req, res) => {
  const ss = await Sesion.find({ tutor_id: req.user.ref, estado_validacion: 'pendiente_validacion' }).sort({ fecha_envio: 1 });
  res.json(ss.map((s) => ({ ...s.toObject(), vence_en_horas: Math.max(0, Math.ceil(cfg.plazoValidacionHoras - (Date.now() - s.fecha_envio) / 3600000)) })));
}));

// RF05: bitácora consolidada (horas, sesiones, estado general y calificación publicada).
router.get('/bitacora/:estudianteId', auth(), ah(async (req, res) => {
  await refrescarEstados();
  const id = req.params.estudianteId === 'me' ? req.user.ref : Number(req.params.estudianteId);
  if (req.user.rol === 'estudiante' && id !== req.user.ref) throw new HttpError(403, 'Solo puede consultar su propia bitácora');
  if (req.user.rol === 'tutor') throw new HttpError(403, 'El tutor consulta las sesiones desde su bandeja');
  const a = (await query('SELECT * FROM asignaciones WHERE estudiante_id = $1', [id])).rows[0];
  if (req.user.rol === 'docente' && (!a || a.docente_id !== req.user.ref)) throw new HttpError(403, 'El estudiante no está a su cargo');
  const resumen = await recalcBitacora(id);
  const sesiones = await Sesion.find({ estudiante_id: id }).sort({ fecha_sesion: -1 });
  const cal = a ? (await query('SELECT * FROM calificaciones WHERE asignacion_id = $1 ORDER BY id DESC LIMIT 1', [a.id])).rows[0] : null;
  res.json({ estudiante_id: id, asignacion: a || null, horas_acumuladas: resumen.horas_acumuladas, horas_requeridas: resumen.horas_requeridas, estado_general: resumen.estado_general, sesiones, calificacion: cal || null });
}));
router.get('/mis-bitacora-resumen', auth('estudiante'), ah(async (req, res) => res.json(await Bitacora.findOne({ estudiante_id: req.user.ref }))));

// Confirmación automática: ejecución manual para demostración (el job la corre cada 10 minutos). Solo fuera de producción.
router.post('/sesiones/auto-confirmar', auth('director'), ah(async (req, res) => {
  if (cfg.production) throw new HttpError(403, 'No disponible en producción');
  const horas = req.body && req.body.horas !== undefined ? Number(req.body.horas) : cfg.plazoValidacionHoras;
  res.json({ confirmadas: await autoConfirmar(horas) });
}));
module.exports = router;
