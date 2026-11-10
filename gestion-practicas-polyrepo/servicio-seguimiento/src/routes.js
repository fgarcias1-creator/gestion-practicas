const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { z } = require('zod');
const mongoose = require('mongoose');
const { Sesion, Bitacora, Log, Notificacion, VALIDAS } = require('./models');
const { auditar, recalcularBitacora, notificar } = require('./servicios');
const { generarPdfBitacora } = require('./pdf');
const { HttpError, asyncHandler, validar } = require('./lib/errors');
const { autenticar, requerirRol, claveInterna } = require('./lib/auth');
const { confirmarVencidas } = require('./jobs');
const { llamar } = require('./lib/http');
const { urls, negocio } = require('./lib/config');

const r = express.Router();
const A = autenticar;
const UPLOADS = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true }); // la carpeta de evidencias se crea sola
/** Clasifica la evidencia por su tipo MIME. Se aceptan archivos de CUALQUIER formato (documentos, imágenes, video, audio, comprimidos…). */
const tipoEvidencia = (mime = '') => (mime === 'application/pdf' ? 'documento' : mime.startsWith('image/') ? 'imagen' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'otro');
/** Extensión segura para el nombre guardado en disco (el nombre original solo se usa para mostrarlo y al descargar). */
const extSegura = (nombre = '') => { const e = path.extname(nombre).toLowerCase(); return /^\.[a-z0-9]{1,10}$/.test(e) ? e : ''; };

// ---------------------------------------------------------------------
// Carga de evidencias: cualquier formato, máximo MAX_EVIDENCIA_MB por archivo y 5 archivos por envío (RF04)
// ---------------------------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, f, cb) => cb(null, UPLOADS),
    filename: (req, f, cb) => cb(null, crypto.randomUUID() + extSegura(f.originalname)),
  }),
  limits: { fileSize: negocio.maxEvidenciaMB * 1024 * 1024, files: 5 },
});
const MAX_EVIDENCIAS_POR_SESION = 10;
const aEvidencias = (files = []) => files.map((f) => ({
  tipo: tipoEvidencia(f.mimetype), nombre_original: f.originalname, archivo: f.filename, mime: f.mimetype, tamano: f.size,
  fecha_carga_servidor: new Date(), // RNF02: hora del servidor, no del dispositivo
}));
const borrarArchivos = (files = []) => files.forEach((f) => fs.unlink(f.path, () => {}));

/** Verifica con el Servicio de Prácticas (REST) que el usuario tiene relación con la asignación. */
const verificarAsignacion = (req, id) => llamar(urls.practicas, `/api/v1/asignaciones/${id}`, { token: req.token });

const esquemaSesion = z.object({
  fecha_sesion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD'),
  horas: z.coerce.number().min(0.5, 'Las horas deben ser mayores que cero').max(12),
  resumen_actividades: z.string().default(''),
  enviar: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  reemplaza_a: z.string().optional(),
  quitar: z.string().optional(),   // (solo al editar un borrador) JSON con los nombres de archivo de las evidencias a quitar
});

/** Deja la sesión «pendiente de validación»: el servidor fija fecha_envio, audita y avisa al tutor. */
async function enviarSesion(s, req) {
  s.estado_validacion = 'pendiente';
  s.fecha_envio = new Date();
  await s.save();
  await auditar({ usuario_id: req.usuario.sub, accion: 'sesion_enviada', detalle: { sesion_id: String(s._id), asignacion_id: s.asignacion_id } });
  await notificar([{ usuario_id: s.tutor_usuario_id, tipo: 'sesion', titulo: 'Nueva sesión por validar',
    mensaje: `Un estudiante registró ${s.horas} h del ${s.fecha_sesion.toISOString().slice(0, 10)}. Tiene ${negocio.horasAutoConfirmacion} h para validarla o se confirmará automáticamente.` }]);
}

// =====================================================================
// RF04 - Registro de sesión (borrador -> pendiente)
// =====================================================================
r.post('/sesiones', A, requerirRol('estudiante'), upload.array('evidencias', 5), validar(esquemaSesion),
  asyncHandler(async (req, res) => {
    const d = req.body;
    if (d.fecha_sesion > new Date().toISOString().slice(0, 10)) throw new HttpError(400, 'La fecha de la sesión no puede ser futura');
    if (d.enviar && d.resumen_actividades.trim().length < 5) throw new HttpError(400, 'El resumen de actividades es obligatorio para enviar');

    const asg = await llamar(urls.practicas, '/api/v1/asignaciones/mia', { token: req.token });
    if (asg.estado !== 'en_curso') throw new HttpError(409, 'Solo puede registrar sesiones con la práctica «en curso»');
    if (d.fecha_sesion < asg.fecha_inicio_practica) {
      throw new HttpError(400, `La fecha de la sesión no puede ser anterior al inicio de la práctica (${asg.fecha_inicio_practica})`);
    }

    if (d.reemplaza_a) { // corrección de una sesión rechazada = nueva entrega
      const previa = await Sesion.findOne({ _id: d.reemplaza_a, estudiante_id: asg.estudiante_id, estado_validacion: 'requiere_correccion' });
      if (!previa) throw new HttpError(409, 'Solo puede reenviar una sesión que requiere corrección');
    }
    const s = await Sesion.create({
      asignacion_id: asg.id, estudiante_id: asg.estudiante_id, tutor_id: asg.tutor_id,
      estudiante_usuario_id: asg.estudiante_usuario_id, tutor_usuario_id: asg.tutor_usuario_id,
      fecha_sesion: new Date(d.fecha_sesion), horas: d.horas, resumen_actividades: d.resumen_actividades,
      evidencias: aEvidencias(req.files), reemplaza_a: d.reemplaza_a || undefined,
      estado_validacion: d.enviar ? 'pendiente' : 'borrador', fecha_envio: d.enviar ? new Date() : undefined,
    });
    if (d.enviar) {
      await auditar({ usuario_id: req.usuario.sub, accion: 'sesion_enviada', detalle: { sesion_id: String(s._id), asignacion_id: asg.id } });
      await notificar([{ usuario_id: asg.tutor_usuario_id, tipo: 'sesion', titulo: 'Nueva sesión por validar',
        mensaje: `${asg.estudiante} registró ${d.horas} h del ${d.fecha_sesion}. Tiene ${negocio.horasAutoConfirmacion} h para validarla o se confirmará automáticamente.` }]);
    }
    res.status(201).json(s);
  }));

/** Borrador: el estudiante puede editarlo y agregar archivos. Una sesión ENVIADA ya no se toca (RNF02). */
async function sesionEditable(req) {
  const s = await Sesion.findOne({ _id: req.params.id, estudiante_id: req.usuario.perfil_id });
  if (!s) throw new HttpError(404, 'Sesión no encontrada');
  if (s.estado_validacion !== 'borrador') throw new HttpError(409, 'La sesión ya fue enviada y no puede editarse ni eliminarse');
  return s;
}

/**
 * Edita un BORRADOR: fecha, horas, resumen, quitar evidencias y agregar nuevas. Con enviar=true además lo envía al tutor
 * (así el estudiante puede volver a un borrador, completarlo y subirlo). Una sesión ya enviada no se toca (RNF02).
 */
r.put('/sesiones/:id', A, requerirRol('estudiante'), upload.array('evidencias', 5), validar(esquemaSesion.partial()),
  asyncHandler(async (req, res) => {
    const s = await sesionEditable(req);
    const d = req.body;
    const asg = await llamar(urls.practicas, '/api/v1/asignaciones/mia', { token: req.token });
    if (d.fecha_sesion) {
      if (d.fecha_sesion > new Date().toISOString().slice(0, 10)) throw new HttpError(400, 'La fecha de la sesión no puede ser futura');
      if (d.fecha_sesion < asg.fecha_inicio_practica) throw new HttpError(400, `La fecha de la sesión no puede ser anterior al inicio de la práctica (${asg.fecha_inicio_practica})`);
      s.fecha_sesion = new Date(d.fecha_sesion);
    }
    if (d.horas) s.horas = d.horas;
    if (d.resumen_actividades !== undefined) s.resumen_actividades = d.resumen_actividades;

    let quitar = [];
    if (d.quitar) { try { quitar = JSON.parse(d.quitar); } catch { throw new HttpError(400, 'El campo «quitar» debe ser una lista JSON'); } }
    const aBorrar = s.evidencias.filter((e) => quitar.includes(e.archivo));
    s.evidencias = s.evidencias.filter((e) => !quitar.includes(e.archivo));
    s.evidencias.push(...aEvidencias(req.files));
    if (s.evidencias.length > MAX_EVIDENCIAS_POR_SESION) throw new HttpError(400, `Una sesión admite como máximo ${MAX_EVIDENCIAS_POR_SESION} evidencias`);

    if (d.enviar === 'true' || d.enviar === true) {
      if (asg.estado !== 'en_curso') throw new HttpError(409, 'Solo puede enviar sesiones con la práctica «en curso»');
      if (s.resumen_actividades.trim().length < 5) throw new HttpError(400, 'El resumen de actividades es obligatorio para enviar');
      await enviarSesion(s, req);
    } else {
      await s.save();
    }
    aBorrar.forEach((e) => fs.unlink(path.join(UPLOADS, path.basename(e.archivo)), () => {})); // solo después de guardar
    res.json(s);
  }));

r.delete('/sesiones/:id/evidencias/:archivo', A, requerirRol('estudiante'), asyncHandler(async (req, res) => {
  const s = await sesionEditable(req);
  s.evidencias = s.evidencias.filter((e) => e.archivo !== req.params.archivo);
  await s.save();
  fs.unlink(path.join(UPLOADS, path.basename(req.params.archivo)), () => {});
  res.json(s);
}));

r.delete('/sesiones/:id', A, requerirRol('estudiante'), asyncHandler(async (req, res) => {
  const s = await sesionEditable(req);
  s.evidencias.forEach((e) => fs.unlink(path.join(UPLOADS, e.archivo), () => {}));
  await s.deleteOne();
  res.status(204).end();
}));

/** Envía un borrador: el servidor fija fecha_envio y la deja «pendiente de validación». */
r.post('/sesiones/:id/enviar', A, requerirRol('estudiante'), asyncHandler(async (req, res) => {
  const s = await sesionEditable(req);
  if (s.resumen_actividades.trim().length < 5) throw new HttpError(400, 'El resumen de actividades es obligatorio para enviar');
  await enviarSesion(s, req);
  res.json(s);
}));

// =====================================================================
// Consulta de sesiones (alcance según rol)
// =====================================================================
r.get('/sesiones', A, asyncHandler(async (req, res) => {
  const { rol, perfil_id } = req.usuario;
  const filtro = {};
  if (rol === 'estudiante') filtro.estudiante_id = perfil_id;
  else if (rol === 'tutor') filtro.tutor_id = perfil_id;
  if (req.query.asignacion_id) {
    await verificarAsignacion(req, req.query.asignacion_id); // 404 si no tiene relación con esa asignación
    filtro.asignacion_id = Number(req.query.asignacion_id);
  } else if (rol === 'docente' || rol === 'director') {
    throw new HttpError(400, 'Indique asignacion_id');
  }
  if (req.query.estado === 'validadas') filtro.estado_validacion = { $in: VALIDAS };
  else if (req.query.estado) filtro.estado_validacion = req.query.estado;
  if (rol !== 'estudiante') filtro.estado_validacion = filtro.estado_validacion || { $ne: 'borrador' }; // los borradores son privados
  res.json(await Sesion.find(filtro).sort({ fecha_sesion: -1 }));
}));

/** Descarga de una evidencia (con control de acceso; los archivos no son públicos). */
r.get('/sesiones/:id/evidencias/:archivo', A, asyncHandler(async (req, res) => {
  const s = await Sesion.findById(req.params.id);
  if (!s || !s.evidencias.some((e) => e.archivo === req.params.archivo)) throw new HttpError(404, 'Evidencia no encontrada');
  if (req.usuario.rol === 'estudiante' && s.estudiante_id !== req.usuario.perfil_id) throw new HttpError(403, 'Sin acceso');
  if (req.usuario.rol === 'tutor' && s.tutor_id !== req.usuario.perfil_id) throw new HttpError(403, 'Sin acceso');
  if (['docente', 'director'].includes(req.usuario.rol)) await verificarAsignacion(req, s.asignacion_id);
  const ev = s.evidencias.find((e) => e.archivo === req.params.archivo);
  res.setHeader('X-Content-Type-Options', 'nosniff'); // evidencias de cualquier formato: nunca se ejecutan ni se muestran en línea
  res.download(path.join(UPLOADS, path.basename(ev.archivo)), ev.nombre_original || ev.archivo);
}));

// =====================================================================
// RF04 / RNF01 - Validación del tutor
// =====================================================================
/** RNF01: validar = UN solo clic. No pide ningún dato; solo el id de la sesión. Operación atómica. */
r.patch('/sesiones/:id/validar', A, requerirRol('tutor'), asyncHandler(async (req, res) => {
  const s = await Sesion.findOneAndUpdate(
    { _id: req.params.id, tutor_id: req.usuario.perfil_id, estado_validacion: 'pendiente' },
    { $set: { estado_validacion: 'validada_tutor', fecha_validacion: new Date(), validacion_automatica: false } }, { new: true });
  if (!s) throw new HttpError(409, 'La sesión no existe, no es suya o ya no está pendiente de validación');
  await recalcularBitacora(s.asignacion_id, s.estudiante_id);
  await auditar({ usuario_id: req.usuario.sub, accion: 'asistencia_validada', detalle: { sesion_id: String(s._id), asignacion_id: s.asignacion_id } });
  await notificar([{ usuario_id: s.estudiante_usuario_id, tipo: 'sesion', titulo: 'Sesión validada',
    mensaje: `Su tutor validó la sesión del ${s.fecha_sesion.toISOString().slice(0, 10)} (${s.horas} h). Ya suma a su bitácora.` }]);
  res.json(s);
}));

/** Rechazo con observación obligatoria: queda «requiere corrección»; el estudiante reenvía como NUEVA entrega. */
r.patch('/sesiones/:id/rechazar', A, requerirRol('tutor'), validar(z.object({ observacion: z.string().min(5, 'La observación es obligatoria') })),
  asyncHandler(async (req, res) => {
    const s = await Sesion.findOneAndUpdate(
      { _id: req.params.id, tutor_id: req.usuario.perfil_id, estado_validacion: 'pendiente' },
      { $set: { estado_validacion: 'requiere_correccion', observacion_tutor: req.body.observacion, fecha_validacion: new Date() } }, { new: true });
    if (!s) throw new HttpError(409, 'La sesión no existe, no es suya o ya no está pendiente de validación');
    await auditar({ usuario_id: req.usuario.sub, accion: 'evidencia_rechazada', detalle: { sesion_id: String(s._id), observacion: req.body.observacion } });
    await notificar([{ usuario_id: s.estudiante_usuario_id, tipo: 'sesion', titulo: 'Sesión devuelta para corrección',
      mensaje: `Sesión del ${s.fecha_sesion.toISOString().slice(0, 10)}: ${req.body.observacion}` }]);
    res.json(s);
  }));

// =====================================================================
// RF05 - Bitácora consolidada
// =====================================================================
r.get('/bitacora', A, requerirRol('director'), asyncHandler(async (req, res) => {
  res.json(await Bitacora.find().lean()); // lo consume el Servicio de Reportes
}));

/**
 * Arma la bitácora de un estudiante (la usan el JSON y el PDF). El control de acceso lo hace el Servicio de Prácticas:
 * si el usuario no tiene relación con ese estudiante, la lista de asignaciones llega vacía.
 */
async function armarBitacora(req, estudianteId) {
  const asgs = await llamar(urls.practicas, `/api/v1/asignaciones?estudiante_id=${estudianteId}`, { token: req.token });
  if (!asgs.length) throw new HttpError(404, 'El estudiante no tiene práctica asignada o no tiene acceso a su bitácora');
  const asg = asgs[0];

  const resumen = await recalcularBitacora(asg.id, estudianteId, asg.horas_requeridas); // horas según el programa
  const filtro = { estudiante_id: estudianteId, ...(req.usuario.rol === 'estudiante' ? {} : { estado_validacion: { $ne: 'borrador' } }) };
  const sesiones = await Sesion.find(filtro).sort({ fecha_sesion: -1 }).lean();
  let calificacion = null; // consistencia eventual: si Evaluación no responde, la bitácora igual se muestra
  try { calificacion = await llamar(urls.evaluacion, `/api/v1/calificaciones/${asg.id}`, { token: req.token }); } catch { /* sin calificación aún */ }
  // Las notas por sesión solo existen para el estudiante cuando el docente ya publicó la nota final
  const notas = Object.fromEntries((calificacion?.sesiones || []).map((n) => [n.sesion_id, n]));

  await Bitacora.updateOne({ estudiante_id: estudianteId }, { $set: { estado_general: asg.estado } });
  return {
    estudiante_id: estudianteId, asignacion: asg, estado_general: asg.estado, generado: new Date().toISOString(),
    horas_acumuladas: resumen.horas_acumuladas, horas_requeridas: resumen.horas_requeridas,
    sesiones: sesiones.map((s) => ({ ...s, calificacion: notas[String(s._id)] || null })), calificacion: calificacion?.vigente ?? null,
  };
}

r.get('/bitacora/:estudianteId(\\d+)', A, asyncHandler(async (req, res) => {
  res.json(await armarBitacora(req, Number(req.params.estudianteId)));
}));

/** RF05: la bitácora se puede descargar en PDF (estudiante, docente y director, según su alcance). No incluye borradores. */
r.get('/bitacora/:estudianteId(\\d+)/pdf', A, asyncHandler(async (req, res) => {
  const b = await armarBitacora(req, Number(req.params.estudianteId));
  b.sesiones = b.sesiones.filter((s) => s.estado_validacion !== 'borrador'); // el PDF solo trae sesiones ya enviadas (con su estado y calificación), nunca borradores
  const pdf = await generarPdfBitacora(b);
  await auditar({ usuario_id: req.usuario.sub, accion: 'bitacora_descargada', detalle: { estudiante_id: b.estudiante_id } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="bitacora_${b.estudiante_id}.pdf"`);
  res.send(pdf);
}));

// =====================================================================
// RNF03 - Auditoría (insert-only: NO existe PUT ni DELETE)
// =====================================================================
r.post('/auditoria', claveInterna, asyncHandler(async (req, res) => {
  const l = await Log.create(z.object({
    usuario_id: z.number(), servicio_origen: z.string(), accion: z.string(),
    resultado: z.enum(['exitoso', 'fallido']).default('exitoso'), detalle: z.any().optional(),
  }).parse(req.body));
  res.status(201).json({ id: l._id });
}));

r.get('/auditoria', A, requerirRol('administrador'), asyncHandler(async (req, res) => {
  const f = {};
  if (req.query.usuario_id) f.usuario_id = Number(req.query.usuario_id);
  if (req.query.accion) f.accion = req.query.accion;
  if (req.query.desde || req.query.hasta) f.fecha_hora = { ...(req.query.desde && { $gte: new Date(req.query.desde) }), ...(req.query.hasta && { $lte: new Date(req.query.hasta) }) };
  res.json(await Log.find(f).sort({ fecha_hora: -1 }).limit(Math.min(Number(req.query.limite) || 100, 500)).lean());
}));

// =====================================================================
// Notificaciones (campana): cada usuario solo ve y marca las suyas
// =====================================================================
const esquemaNotificaciones = z.object({
  notificaciones: z.array(z.object({ usuario_id: z.number(), tipo: z.string(), titulo: z.string(), mensaje: z.string() })).min(1).max(20),
});
r.post('/internal/notificaciones', claveInterna, asyncHandler(async (req, res) => {
  const { notificaciones } = esquemaNotificaciones.parse(req.body);
  await Notificacion.insertMany(notificaciones);
  res.status(201).json({ creadas: notificaciones.length });
}));

r.get('/notificaciones', A, asyncHandler(async (req, res) => {
  const f = { usuario_id: req.usuario.sub };
  const [items, no_leidas] = await Promise.all([
    Notificacion.find(f).sort({ fecha: -1 }).limit(30).lean(), Notificacion.countDocuments({ ...f, leida: false })]);
  res.json({ items, no_leidas });
}));

r.patch('/notificaciones/leidas', A, asyncHandler(async (req, res) => {
  await Notificacion.updateMany({ usuario_id: req.usuario.sub, leida: false }, { $set: { leida: true } });
  res.json({ ok: true });
}));

r.patch('/notificaciones/:id/leida', A, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Identificador inválido');
  const n = await Notificacion.findOneAndUpdate({ _id: req.params.id, usuario_id: req.usuario.sub }, { $set: { leida: true } }, { new: true });
  if (!n) throw new HttpError(404, 'Notificación no encontrada');
  res.json(n);
}));
// Ruta INTERNA: dispara la confirmación automática de 24 h (la usan las pruebas e2e; el cron la ejecuta cada 5 min)
r.post('/internal/confirmar-vencidas', claveInterna, asyncHandler(async (req, res) => {
  res.json({ revisadas: await confirmarVencidas() });
}));

// Limpia archivos subidos si la petición falló (validación, etc.)
r.use((err, req, res, next) => { borrarArchivos(req.files); next(err); });

module.exports = r;
