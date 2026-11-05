const express = require('express');
const { z } = require('zod');
const { query, tx } = require('./lib/pg');
const { HttpError, asyncHandler, validar } = require('./lib/errors');
const { autenticar, requerirRol, claveInterna } = require('./lib/auth');
const { registrar } = require('./lib/audit');
const { notificar } = require('./lib/notificar');
const { enviarCorreo } = require('./lib/correo');
const { negocio } = require('./lib/config');

const r = express.Router();
const A = autenticar;
const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD');

// =====================================================================
// Utilidades de dominio
// =====================================================================
const hoy = () => new Date().toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const periodoVigente = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() < 6 ? 'I' : 'II'}`; };

/** RF03: el estado del convenio SIEMPRE se calcula por sus fechas (no se confía en la columna). */
function estadoConvenio({ fecha_inicio, fecha_fin }) {
  const h = hoy();
  if (fecha_fin < h) return 'vencido';
  if (fecha_inicio > h) return 'no_iniciado';
  return diasEntre(h, fecha_fin) <= 30 ? 'proximo_a_vencer' : 'vigente';
}
const CONVENIO_UTIL = ['vigente', 'proximo_a_vencer'];
const conEstado = (c) => ({ ...c, estado: estadoConvenio(c) });

// =====================================================================
// Modelo académico: cada estudiante pertenece a un PROGRAMA y los requisitos de práctica dependen del programa
// =====================================================================
const SQL_ESTUDIANTE = `SELECT e.*, p.nombre AS programa, p.facultad, p.creditos_totales, p.semestre_minimo,
       p.porcentaje_minimo, p.horas_practica, p.nombre_practica
  FROM estudiantes e JOIN programas p ON p.id = e.programa_id`;
async function cargarEstudiante(id) {
  const { rows: [e] } = await query(`${SQL_ESTUDIANTE} WHERE e.id = $1`, [id]);
  return e;
}

/** Astah «Solicitar práctica» pasos 2-3: estado de cada requisito + datos automáticos de la práctica. */
function requisitos(e) {
  const pct = Math.round((e.creditos_aprobados * 1000) / e.creditos_totales) / 10; // el porcentaje se DERIVA, nunca se teclea
  const items = [
    { clave: 'semestre', etiqueta: 'Semestre', actual: e.semestre, requerido: e.semestre_minimo, unidad: '', cumple: e.semestre >= e.semestre_minimo },
    { clave: 'creditos', etiqueta: 'Créditos aprobados', actual: pct, requerido: e.porcentaje_minimo, unidad: '%',
      detalle: `${e.creditos_aprobados} de ${e.creditos_totales} créditos`, cumple: pct >= e.porcentaje_minimo },
  ];
  const faltantes = items.filter((i) => !i.cumple)
    .map((i) => `${i.etiqueta} mínimo ${i.requerido}${i.unidad} (actual: ${i.actual}${i.unidad})`);
  return {
    cumple: faltantes.length === 0, faltantes, items,
    semestre: { actual: e.semestre, requerido: e.semestre_minimo },
    creditos: { actual: pct, requerido: e.porcentaje_minimo },
    programa: e.programa, facultad: e.facultad, horas_practica: e.horas_practica,
    practica: e.nombre_practica || negocio.nombrePractica, semestre_ejecucion: e.semestre, periodo: periodoVigente(),
  };
}

const esquemaPrograma = z.object({
  nombre: z.string().min(3), facultad: z.string().min(3),
  creditos_totales: z.number().int().min(1), semestre_minimo: z.number().int().min(1).max(14),
  porcentaje_minimo: z.number().int().min(0).max(100), horas_practica: z.number().int().min(1),
  nombre_practica: z.string().min(3).default('Práctica Profesional'),
});
const ETIQUETA_SOLICITUD = { no_solicitado: 'No solicitado', pendiente: 'Pendiente de asignación', asignado: 'Asignado', rechazado: 'Rechazada', devuelto: 'Devuelta para corrección' };

/** Flujo alterno 1a y postcondición: una solicitud en trámite/aprobada, o rechazada en ESTE período, inhabilita nuevas solicitudes. */
function estadoEnvio(e) {
  if (['pendiente', 'asignado'].includes(e.estado_solicitud)) return { puede: false, motivo: 'Ya tiene una solicitud en trámite o aprobada para este período' };
  if (e.estado_solicitud === 'rechazado' && (e.solicitud_periodo ?? periodoVigente()) === periodoVigente()) {
    return { puede: false, motivo: 'Su solicitud fue rechazada para este período lectivo' };
  }
  return { puede: true };
}

// Catálogo de programas académicos (solo lectura; el administrador lo necesita para crear estudiantes)
r.get('/programas', A, requerirRol('administrador', 'director', 'docente'), asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM programas ORDER BY facultad, nombre');
  res.json(rows);
}));

/** El administrador registra o ajusta programas (p. ej. nuevas licenciaturas): los requisitos de práctica salen de aquí. */
r.post('/programas', A, requerirRol('administrador'), validar(esquemaPrograma), asyncHandler(async (req, res) => {
  const d = req.body;
  try {
    const { rows: [p] } = await query(
      `INSERT INTO programas(nombre,facultad,creditos_totales,semestre_minimo,porcentaje_minimo,horas_practica,nombre_practica)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [d.nombre, d.facultad, d.creditos_totales, d.semestre_minimo, d.porcentaje_minimo, d.horas_practica, d.nombre_practica]);
    await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'practicas', accion: 'programa_creado', detalle: { id: p.id, nombre: p.nombre } });
    res.status(201).json(p);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Ya existe un programa con ese nombre');
    throw e;
  }
}));

r.put('/programas/:id(\\d+)', A, requerirRol('administrador'), validar(esquemaPrograma.partial()), asyncHandler(async (req, res) => {
  const d = req.body;
  const { rows: [p] } = await query(
    `UPDATE programas SET nombre=COALESCE($2,nombre), facultad=COALESCE($3,facultad), creditos_totales=COALESCE($4,creditos_totales),
       semestre_minimo=COALESCE($5,semestre_minimo), porcentaje_minimo=COALESCE($6,porcentaje_minimo),
       horas_practica=COALESCE($7,horas_practica), nombre_practica=COALESCE($8,nombre_practica) WHERE id=$1 RETURNING *`,
    [req.params.id, d.nombre, d.facultad, d.creditos_totales, d.semestre_minimo, d.porcentaje_minimo, d.horas_practica, d.nombre_practica]);
  if (!p) throw new HttpError(404, 'Programa no encontrado');
  await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'practicas', accion: 'programa_modificado', detalle: { id: p.id } });
  res.json(p);
}));

// =====================================================================
// RF01 - Solicitud de inicio de práctica
// =====================================================================
r.get('/solicitudes/mia', A, requerirRol('estudiante'), asyncHandler(async (req, res) => {
  const e = await cargarEstudiante(req.usuario.perfil_id);
  if (!e) throw new HttpError(404, 'Perfil de estudiante no encontrado');
  const requisitos_ = requisitos(e);
  const envio = estadoEnvio(e);
  res.json({
    estado_solicitud: e.estado_solicitud, etiqueta: ETIQUETA_SOLICITUD[e.estado_solicitud], motivo_rechazo: e.motivo_rechazo,
    requisitos: requisitos_, puede_enviar: requisitos_.cumple && envio.puede, bloqueo: envio.puede ? null : envio.motivo,
    solicitud: e.fecha_solicitud ? { practica: e.solicitud_practica, semestre: e.solicitud_semestre, periodo: e.solicitud_periodo, fecha: e.fecha_solicitud } : null,
  });
}));

/**
 * Registra la solicitud. Orden de validaciones = flujos del caso de uso: 1a (ya existe una) -> 2a (requisitos).
 * El UPDATE es UNA sola sentencia atómica con condición de estado: un doble clic o un fallo no dejan registros parciales (E1).
 */
r.post('/solicitudes', A, requerirRol('estudiante'), asyncHandler(async (req, res) => {
  const e = await cargarEstudiante(req.usuario.perfil_id);
  if (!e) throw new HttpError(404, 'Perfil de estudiante no encontrado');
  const envio = estadoEnvio(e);
  if (!envio.puede) throw new HttpError(409, envio.motivo);
  const req_ = requisitos(e);
  if (!req_.cumple) throw new HttpError(422, 'No cumple los requisitos para solicitar la práctica', req_.faltantes);
  const { rows: [n] } = await query(
    `UPDATE estudiantes SET estado_solicitud='pendiente', motivo_rechazo=NULL,
            solicitud_practica=$2, solicitud_semestre=$3, solicitud_periodo=$4, fecha_solicitud=NOW()
      WHERE id=$1 AND estado_solicitud IN ('no_solicitado','devuelto','rechazado')
      RETURNING solicitud_practica, solicitud_semestre, solicitud_periodo, fecha_solicitud`,
    [e.id, req_.practica, req_.semestre_ejecucion, req_.periodo]);
  if (!n) throw new HttpError(409, 'Ya tiene una solicitud en trámite o aprobada para este período');
  await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'practicas', accion: 'solicitud_registrada',
    detalle: { estudiante_id: e.id, periodo: n.solicitud_periodo, practica: n.solicitud_practica } });
  await notificar([{ usuario_id: req.usuario.sub, tipo: 'solicitud', titulo: 'Solicitud registrada',
    mensaje: `Su solicitud de ${n.solicitud_practica} (${n.solicitud_periodo}) quedó «Pendiente de asignación». Le avisaremos cuando el director le asigne institución y tutor.` }]);
  res.status(201).json({ estado_solicitud: 'pendiente', etiqueta: ETIQUETA_SOLICITUD.pendiente, practica: n.solicitud_practica,
    semestre: n.solicitud_semestre, periodo: n.solicitud_periodo, fecha: n.fecha_solicitud });
}));

/** Lista de espera del director: orden de llegada (primero en solicitar, primero en ser atendido). */
r.get('/solicitudes', A, requerirRol('director', 'docente'), asyncHandler(async (req, res) => {
  const estado = req.query.estado || 'pendiente';
  const { rows } = await query(
    `SELECT e.id AS estudiante_id, u.nombre_completo, u.email, e.codigo_estudiantil, p.nombre AS programa, p.facultad, e.semestre,
            e.creditos_aprobados, p.creditos_totales,
            ROUND(e.creditos_aprobados * 100.0 / p.creditos_totales, 1) AS porcentaje_creditos,
            e.estado_solicitud, e.motivo_rechazo, e.solicitud_practica, e.solicitud_periodo, e.fecha_solicitud
       FROM estudiantes e JOIN usuarios u ON u.id = e.usuario_id   -- lectura de solo nombre/email (ver README)
       JOIN programas p ON p.id = e.programa_id
      WHERE e.estado_solicitud = $1 ORDER BY e.fecha_solicitud NULLS LAST, e.id`, [estado]);
  res.json(rows);
}));

/** Rechazar (definitivo) o devolver para corrección (subsanable). Motivo obligatorio. */
r.patch('/solicitudes/:estudianteId/:accion(rechazar|devolver)', A, requerirRol('director', 'docente'),
  validar(z.object({ motivo: z.string().min(5, 'El motivo es obligatorio') })),
  asyncHandler(async (req, res) => {
    const nuevo = req.params.accion === 'rechazar' ? 'rechazado' : 'devuelto';
    const { rows: [e] } = await query(
      "UPDATE estudiantes SET estado_solicitud=$1, motivo_rechazo=$2 WHERE id=$3 AND estado_solicitud='pendiente' RETURNING usuario_id",
      [nuevo, req.body.motivo, req.params.estudianteId]);
    if (!e) throw new HttpError(409, 'La solicitud no existe o ya no está pendiente');
    await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'practicas', accion: `solicitud_${nuevo}`,
      detalle: { estudiante_id: +req.params.estudianteId, motivo: req.body.motivo } });
    await notificar([{ usuario_id: e.usuario_id, tipo: 'solicitud',
      titulo: nuevo === 'rechazado' ? 'Su solicitud de práctica fue rechazada' : 'Su solicitud fue devuelta para corrección',
      mensaje: `Motivo: ${req.body.motivo}` }]);
    const { rows: [u] } = await query('SELECT email FROM usuarios WHERE id=$1', [e.usuario_id]);
    const correo = await enviarCorreo({ a: u?.email,
      asunto: nuevo === 'rechazado' ? 'Su solicitud de práctica fue rechazada' : 'Su solicitud de práctica fue devuelta para corrección',
      texto: `Hola,\n\n${nuevo === 'rechazado' ? 'Su solicitud de práctica fue rechazada' : 'Su solicitud de práctica fue devuelta para que la corrija'}.\n\nMotivo: ${req.body.motivo}\n\nSi tiene dudas, comuníquese con el director de su programa.\n\nGestión de Prácticas Académicas` });
    await registrar({ usuario_id: 0, servicio_origen: 'practicas', accion: 'correo_solicitud', resultado: correo.enviado || correo.simulado ? 'exitoso' : 'fallido',
      detalle: { estudiante_id: +req.params.estudianteId, estado: nuevo, simulado: Boolean(correo.simulado) } });
    res.json({ estado_solicitud: nuevo });
  }));

// =====================================================================
// RF03 - Instituciones y convenios: los GESTIONA solo el administrador (sistemas); director y docente solo los consultan
// =====================================================================
const esquemaInst = z.object({
  nit: z.string().min(5), nombre: z.string().min(3), direccion: z.string().optional(),
  persona_contacto: z.string().optional(), telefono_contacto: z.string().optional(),
  email_contacto: z.string().email().optional(), cupo_total: z.number().int().min(0),
});

r.get('/instituciones', A, requerirRol('administrador', 'director', 'docente'), asyncHandler(async (req, res) => {
  const { rows: insts } = await query('SELECT * FROM instituciones ORDER BY id');
  const { rows: convs } = await query('SELECT * FROM convenios');
  let lista = insts.map((i) => {
    const cs = convs.filter((c) => c.institucion_id === i.id).map(conEstado);
    return { ...i, convenios: cs, convenio_vigente: cs.some((c) => CONVENIO_UTIL.includes(c.estado)) };
  });
  if (req.query.disponibles === 'true') lista = lista.filter((i) => i.activa && i.convenio_vigente && i.cupo_disponible > 0);
  res.json(lista);
}));

r.post('/instituciones', A, requerirRol('administrador'), validar(esquemaInst), asyncHandler(async (req, res) => {
  const d = req.body;
  const { rows: [i] } = await query(
    `INSERT INTO instituciones(nit,nombre,direccion,persona_contacto,telefono_contacto,email_contacto,cupo_total,cupo_disponible)
     VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
    [d.nit, d.nombre, d.direccion, d.persona_contacto, d.telefono_contacto, d.email_contacto, d.cupo_total]);
  await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'practicas', accion: 'institucion_creada', detalle: { id: i.id } });
  res.status(201).json(i);
}));

r.put('/instituciones/:id', A, requerirRol('administrador'), validar(esquemaInst.partial()), asyncHandler(async (req, res) => {
  const d = req.body;
  const { rows: [i] } = await query(
    `UPDATE instituciones SET nombre=COALESCE($2,nombre), direccion=COALESCE($3,direccion),
       persona_contacto=COALESCE($4,persona_contacto), telefono_contacto=COALESCE($5,telefono_contacto),
       email_contacto=COALESCE($6,email_contacto),
       cupo_disponible = cupo_disponible + (COALESCE($7,cupo_total) - cupo_total),
       cupo_total=COALESCE($7,cupo_total)
     WHERE id=$1 RETURNING *`,
    [req.params.id, d.nombre, d.direccion, d.persona_contacto, d.telefono_contacto, d.email_contacto, d.cupo_total]);
  if (!i) throw new HttpError(404, 'Institución no encontrada');
  await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'practicas', accion: 'institucion_modificada', detalle: { id: i.id } });
  res.json(i);
}));

r.patch('/instituciones/:id/inhabilitar', A, requerirRol('administrador'), asyncHandler(async (req, res) => {
  const { rows: [i] } = await query('UPDATE instituciones SET activa=FALSE WHERE id=$1 RETURNING *', [req.params.id]);
  if (!i) throw new HttpError(404, 'Institución no encontrada');
  await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'practicas', accion: 'institucion_inhabilitada', detalle: { id: i.id } });
  res.json(i);
}));

const esquemaConvenio = z.object({
  institucion_id: z.number().int(), fecha_inicio: fechaISO, fecha_fin: fechaISO, documento_url: z.string().optional(),
}).refine((d) => d.fecha_fin >= d.fecha_inicio, { message: 'La fecha de fin no puede ser anterior a la de inicio', path: ['fecha_fin'] });

r.get('/convenios', A, requerirRol('administrador', 'director', 'docente'), asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT c.*, i.nombre AS institucion FROM convenios c JOIN instituciones i ON i.id=c.institucion_id ORDER BY c.fecha_fin');
  let lista = rows.map(conEstado);
  if (req.query.estado) lista = lista.filter((c) => c.estado === req.query.estado);
  res.json(lista);
}));

/** Alertas: convenios próximos a vencer (RF03). */
r.get('/convenios/alertas', A, requerirRol('administrador', 'director'), asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT c.*, i.nombre AS institucion FROM convenios c JOIN instituciones i ON i.id=c.institucion_id');
  res.json(rows.map(conEstado).filter((c) => c.estado === 'proximo_a_vencer')
    .map((c) => ({ ...c, dias_restantes: diasEntre(hoy(), c.fecha_fin) })));
}));

r.post('/convenios', A, requerirRol('administrador'), validar(esquemaConvenio), asyncHandler(async (req, res) => {
  const d = req.body;
  const estado = estadoConvenio(d);
  const { rows: [c] } = await query(
    'INSERT INTO convenios(institucion_id,fecha_inicio,fecha_fin,estado,documento_url) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [d.institucion_id, d.fecha_inicio, d.fecha_fin, estado, d.documento_url]);
  await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'practicas', accion: 'convenio_creado', detalle: { id: c.id } });
  res.status(201).json(conEstado(c));
}));

/** Adenda: extiende la fecha de fin del convenio. */
r.patch('/convenios/:id/adenda', A, requerirRol('administrador'), validar(z.object({ fecha_fin: fechaISO })), asyncHandler(async (req, res) => {
  const { rows: [actual] } = await query('SELECT * FROM convenios WHERE id=$1', [req.params.id]);
  if (!actual) throw new HttpError(404, 'Convenio no encontrado');
  if (req.body.fecha_fin < actual.fecha_inicio) throw new HttpError(400, 'La fecha de fin no puede ser anterior a la de inicio');
  const estado = estadoConvenio({ ...actual, fecha_fin: req.body.fecha_fin });
  const { rows: [c] } = await query('UPDATE convenios SET fecha_fin=$2, estado=$3 WHERE id=$1 RETURNING *', [actual.id, req.body.fecha_fin, estado]);
  await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'practicas', accion: 'convenio_adenda', detalle: { id: c.id, fecha_fin: c.fecha_fin } });
  res.json(conEstado(c));
}));

// =====================================================================
// RF02 - Asignación de práctica  (Astah «Asignar práctica» + «Validar convenio activo y cupo disponible»)
// =====================================================================
const esquemaAsignar = z.object({
  estudiante_id: z.number().int(), institucion_id: z.number().int(), tutor_id: z.number().int(),
  docente_id: z.number().int(), convenio_id: z.number().int().optional(), fecha_inicio_practica: fechaISO,
});

/**
 * Reglas de RF02 (se ejecuta DENTRO de una transacción, con la institución bloqueada FOR UPDATE
 * para que dos directores no consuman el mismo último cupo a la vez).
 * Bloquea (E1): institución inactiva, convenio no vigente, sin cupo, tutor de otra institución.
 * Advierte (E2, no bloquea): tutor o docente en su límite de estudiantes.
 */
async function validarAsignacion(c, d, excluirAsignacionId = 0) {
  const { rows: [inst] } = await c.query('SELECT * FROM instituciones WHERE id=$1 FOR UPDATE', [d.institucion_id]);
  if (!inst || !inst.activa) throw new HttpError(404, 'Institución no encontrada o inhabilitada');
  const { rows: convs } = await c.query('SELECT * FROM convenios WHERE institucion_id=$1 ORDER BY fecha_fin DESC', [inst.id]);
  const conv = convs.find((cv) => (!d.convenio_id || cv.id === d.convenio_id) && CONVENIO_UTIL.includes(estadoConvenio(cv)));
  if (!conv || inst.cupo_disponible <= 0) throw new HttpError(409, 'La institución seleccionada no cuenta con cupos vigentes');

  const { rows: [tutor] } = await c.query('SELECT * FROM tutores WHERE id=$1', [d.tutor_id]);
  if (!tutor) throw new HttpError(404, 'Tutor no encontrado');
  if (tutor.institucion_id !== inst.id) throw new HttpError(409, 'El tutor pertenece a otra institución');
  const { rows: [doc] } = await c.query('SELECT id FROM docentes WHERE id=$1', [d.docente_id]);
  if (!doc) throw new HttpError(404, 'Docente no encontrado');

  const cuenta = async (col, id) => (await c.query(
    `SELECT COUNT(*)::int AS n FROM asignaciones WHERE ${col}=$1 AND estado IN ('asignado','en_curso') AND id<>$2`, [id, excluirAsignacionId])).rows[0].n;
  const advertencias = [];
  if (await cuenta('tutor_id', d.tutor_id) >= negocio.maxEstudiantesTutor) advertencias.push('El tutor seleccionado superó el límite de estudiantes bajo su supervisión');
  if (await cuenta('docente_id', d.docente_id) >= negocio.maxEstudiantesDocente) advertencias.push('El docente seleccionado superó el límite de estudiantes bajo su supervisión');
  return { inst, conv, advertencias };
}

/** Postcondición Astah: «se notifican todas las partes involucradas» (estudiante, tutor, docente y la institución). */
async function avisarAsignacion(id, reasignada) {
  try {
    const [a] = await listarAsignaciones({ rol: 'director' }, { id });
    if (!a) return;
    const donde = `${a.institucion} (inicio: ${a.fecha_inicio_practica})`;
    await notificar([
      { usuario_id: a.estudiante_usuario_id, tipo: 'asignacion', titulo: reasignada ? 'Su práctica fue reasignada' : 'Práctica asignada',
        mensaje: `Realizará su práctica en ${donde}. Tutor de la institución: ${a.tutor}. Docente asesor: ${a.docente}.` },
      { usuario_id: a.tutor_usuario_id, tipo: 'asignacion', titulo: 'Nuevo practicante a su cargo', mensaje: `${a.estudiante} realizará su práctica en ${donde}.` },
      { usuario_id: a.docente_usuario_id, tipo: 'asignacion', titulo: 'Nuevo estudiante bajo su asesoría', mensaje: `${a.estudiante} — ${donde}.` },
    ]);
    // RF02: correo a estudiante, tutor e institución (la institución no tiene cuenta en el sistema, solo correo de contacto)
    const { rows: correos } = await query('SELECT id, email FROM usuarios WHERE id = ANY($1)', [[a.estudiante_usuario_id, a.tutor_usuario_id]]);
    const de = (id) => correos.find((c) => c.id === id)?.email;
    const asunto = reasignada ? 'Reasignación de su práctica académica' : 'Práctica académica asignada';
    const detalle = `Institución: ${a.institucion}\nInicio de la práctica: ${a.fecha_inicio_practica}\nTutor de la institución: ${a.tutor}\nDocente asesor: ${a.docente}`;
    const envios = {
      estudiante: { a: de(a.estudiante_usuario_id), texto: `Hola ${a.estudiante},\n\n${reasignada ? 'Su práctica fue reasignada' : 'Se le asignó su práctica'}:\n\n${detalle}\n\nGestión de Prácticas Académicas` },
      tutor: { a: de(a.tutor_usuario_id), texto: `Hola ${a.tutor},\n\nUn estudiante realizará su práctica bajo su tutoría:\n\nEstudiante: ${a.estudiante} (${a.programa})\n${detalle}\n\nGestión de Prácticas Académicas` },
      institucion: { a: a.institucion_email, texto: `Estimados ${a.institucion}:\n\nLa universidad asignó al estudiante ${a.estudiante} (${a.programa}) para realizar su práctica en su institución.\n\n${detalle}\n\nGestión de Prácticas Académicas` },
    };
    const resultados = {};
    for (const [quien, m] of Object.entries(envios)) {
      const r = await enviarCorreo({ a: m.a, asunto, texto: m.texto });
      resultados[quien] = r.enviado ? 'enviado' : r.simulado ? 'simulado' : `fallido: ${r.error}`;
    }
    await registrar({ usuario_id: 0, servicio_origen: 'practicas', accion: 'correos_asignacion',
      resultado: Object.values(resultados).some((v) => v.startsWith('fallido')) ? 'fallido' : 'exitoso', detalle: { asignacion_id: a.id, resultados } });
  } catch (e) { console.warn('[practicas] no se pudieron enviar las notificaciones:', e.message); }
}

r.post('/asignaciones', A, requerirRol('director'), validar(esquemaAsignar), asyncHandler(async (req, res) => {
  const d = req.body;
  const resultado = await tx(async (c) => {
    const { rows: [e] } = await c.query('SELECT * FROM estudiantes WHERE id=$1 FOR UPDATE', [d.estudiante_id]);
    if (!e) throw new HttpError(404, 'Estudiante no encontrado');
    if (e.estado_solicitud !== 'pendiente') {
      throw new HttpError(409, `El estudiante no tiene una solicitud pendiente de asignación (estado: ${e.estado_solicitud})`);
    }
    const { conv, advertencias } = await validarAsignacion(c, d);
    const estado = d.fecha_inicio_practica <= hoy() ? 'en_curso' : 'asignado';
    const { rows: [a] } = await c.query(
      `INSERT INTO asignaciones(estudiante_id,institucion_id,tutor_id,docente_id,convenio_id,fecha_inicio_practica,estado)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [d.estudiante_id, d.institucion_id, d.tutor_id, d.docente_id, conv.id, d.fecha_inicio_practica, estado]);
    await c.query('UPDATE instituciones SET cupo_disponible = cupo_disponible - 1 WHERE id=$1', [d.institucion_id]);
    await c.query("UPDATE estudiantes SET estado_solicitud='asignado' WHERE id=$1", [d.estudiante_id]);
    return { asignacion: a, advertencias };
  });
  await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'practicas', accion: 'practica_asignada', detalle: { asignacion_id: resultado.asignacion.id } });
  await avisarAsignacion(resultado.asignacion.id, false);
  res.status(201).json(resultado);
}));

/** Flujo 2a: reasignación / cambio de tutor o institución ANTES de iniciar. Libera el cupo anterior. */
r.patch('/asignaciones/:id(\\d+)/reasignar', A, requerirRol('director'),
  validar(esquemaAsignar.omit({ estudiante_id: true, convenio_id: true })),
  asyncHandler(async (req, res) => {
    const d = req.body;
    const resultado = await tx(async (c) => {
      const { rows: [a] } = await c.query('SELECT * FROM asignaciones WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!a) throw new HttpError(404, 'Asignación no encontrada');
      if (a.estado !== 'asignado' || a.fecha_inicio_practica <= hoy()) {
        throw new HttpError(409, 'Solo se puede reasignar antes de la fecha de inicio de la práctica');
      }
      await c.query('UPDATE instituciones SET cupo_disponible = cupo_disponible + 1 WHERE id=$1', [a.institucion_id]); // libera
      const { conv, advertencias } = await validarAsignacion(c, d, a.id);
      await c.query('UPDATE instituciones SET cupo_disponible = cupo_disponible - 1 WHERE id=$1', [d.institucion_id]);
      const { rows: [n] } = await c.query(
        `UPDATE asignaciones SET institucion_id=$2,tutor_id=$3,docente_id=$4,convenio_id=$5,fecha_inicio_practica=$6 WHERE id=$1 RETURNING *`,
        [a.id, d.institucion_id, d.tutor_id, d.docente_id, conv.id, d.fecha_inicio_practica]);
      return { asignacion: n, advertencias };
    });
    await registrar({ usuario_id: req.usuario.sub, servicio_origen: 'practicas', accion: 'practica_reasignada', detalle: { asignacion_id: resultado.asignacion.id } });
    await avisarAsignacion(resultado.asignacion.id, true);
    res.json(resultado);
  }));

/** Consulta de asignaciones con nombres. El alcance depende del rol: cada actor solo ve lo suyo. */
async function listarAsignaciones(usuario, filtros = {}) {
  const w = []; const p = [];
  const add = (cond, v) => { p.push(v); w.push(cond.replace('?', `$${p.length}`)); };
  if (usuario.rol === 'estudiante') add('a.estudiante_id = ?', usuario.perfil_id);
  if (usuario.rol === 'tutor') add('a.tutor_id = ?', usuario.perfil_id);
  if (usuario.rol === 'docente') add('a.docente_id = ?', usuario.perfil_id);
  const mapa = { id: 'a.id = ?', estado: 'a.estado = ?', institucion_id: 'a.institucion_id = ?', tutor_id: 'a.tutor_id = ?',
    docente_id: 'a.docente_id = ?', estudiante_id: 'a.estudiante_id = ?', desde: 'a.fecha_inicio_practica >= ?', hasta: 'a.fecha_inicio_practica <= ?' };
  for (const [k, cond] of Object.entries(mapa)) if (filtros[k]) add(cond, filtros[k]);
  const { rows } = await query(
    `SELECT a.id, a.estado, a.fecha_asignacion, a.fecha_inicio_practica, a.estudiante_id, a.institucion_id, a.tutor_id, a.docente_id, a.convenio_id,
            ue.nombre_completo AS estudiante, i.nombre AS institucion, i.email_contacto AS institucion_email,
            ut.nombre_completo AS tutor, ud.nombre_completo AS docente,
            ue.id AS estudiante_usuario_id, ut.id AS tutor_usuario_id, ud.id AS docente_usuario_id,
            pr.nombre AS programa, pr.horas_practica AS horas_requeridas
       FROM asignaciones a
       JOIN estudiantes e ON e.id=a.estudiante_id JOIN usuarios ue ON ue.id=e.usuario_id JOIN programas pr ON pr.id=e.programa_id
       JOIN instituciones i ON i.id=a.institucion_id
       JOIN tutores t ON t.id=a.tutor_id JOIN usuarios ut ON ut.id=t.usuario_id
       JOIN docentes d ON d.id=a.docente_id JOIN usuarios ud ON ud.id=d.usuario_id
       ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY a.id`, p);
  return rows;
}

r.get('/asignaciones', A, requerirRol('director', 'docente', 'tutor', 'estudiante'), asyncHandler(async (req, res) => {
  res.json(await listarAsignaciones(req.usuario, req.query));
}));

r.get('/asignaciones/mia', A, requerirRol('estudiante'), asyncHandler(async (req, res) => {
  const [a] = await listarAsignaciones(req.usuario);
  if (!a) throw new HttpError(404, 'Aún no tiene una práctica asignada');
  res.json(a);
}));

/** Detalle. Sirve también como "control de acceso" para otros servicios: 404 si el usuario no tiene relación. */
r.get('/asignaciones/:id(\\d+)', A, asyncHandler(async (req, res) => {
  const [a] = await listarAsignaciones(req.usuario, { id: req.params.id });
  if (!a) throw new HttpError(404, 'Asignación no encontrada o sin acceso');
  res.json(a);
}));

/** Cambios de estado permitidos por rol: tutor -> evaluado, docente -> calificado. */
r.patch('/asignaciones/:id(\\d+)/estado', A, requerirRol('tutor', 'docente', 'director'),
  validar(z.object({ estado: z.enum(['en_curso', 'evaluado', 'calificado', 'finalizado']) })),
  asyncHandler(async (req, res) => {
    const permitidos = { tutor: ['evaluado'], docente: ['calificado'], director: ['en_curso', 'evaluado', 'calificado', 'finalizado'] };
    if (!permitidos[req.usuario.rol].includes(req.body.estado)) throw new HttpError(403, 'Su rol no puede asignar ese estado');
    const [a] = await listarAsignaciones(req.usuario, { id: req.params.id });
    if (!a) throw new HttpError(404, 'Asignación no encontrada o sin acceso');
    await query('UPDATE asignaciones SET estado=$2 WHERE id=$1', [a.id, req.body.estado]);
    res.json({ id: a.id, estado: req.body.estado });
  }));

// Catálogos para el panel de asignación: incluyen la CARGA actual para advertir antes de sobrecargar (E2)
r.get('/catalogos/tutores', A, requerirRol('director'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT t.id, u.nombre_completo, t.institucion_id, t.cargo,
            (SELECT COUNT(*)::int FROM asignaciones a WHERE a.tutor_id = t.id AND a.estado IN ('asignado','en_curso')) AS carga
       FROM tutores t JOIN usuarios u ON u.id=t.usuario_id
      ${req.query.institucion_id ? 'WHERE t.institucion_id=$1' : ''} ORDER BY t.id`, req.query.institucion_id ? [req.query.institucion_id] : []);
  res.json(rows.map((t) => ({ ...t, limite: negocio.maxEstudiantesTutor })));
}));
r.get('/catalogos/docentes', A, requerirRol('director'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT d.id, u.nombre_completo, d.area,
            (SELECT COUNT(*)::int FROM asignaciones a WHERE a.docente_id = d.id AND a.estado IN ('asignado','en_curso')) AS carga
       FROM docentes d JOIN usuarios u ON u.id=d.usuario_id ORDER BY d.id`);
  res.json(rows.map((d) => ({ ...d, limite: negocio.maxEstudiantesDocente })));
}));

// =====================================================================
// Rutas INTERNAS (solo servicio-a-servicio; el Gateway no las expone)
// =====================================================================
/** El Servicio de Identidad pregunta: "¿qué id de perfil tiene este usuario?" */
r.get('/internal/perfil/:usuarioId', claveInterna, asyncHandler(async (req, res) => {
  const { rows: [p] } = await query(
    `SELECT 'estudiante' AS rol, id FROM estudiantes WHERE usuario_id=$1 UNION ALL
     SELECT 'tutor', id FROM tutores WHERE usuario_id=$1 UNION ALL
     SELECT 'docente', id FROM docentes WHERE usuario_id=$1 UNION ALL
     SELECT 'director', id FROM directores WHERE usuario_id=$1`, [req.params.usuarioId]);
  res.json({ rol: p?.rol ?? null, perfil_id: p?.id ?? null });
}));

const perfiles = {
  estudiante: z.object({
    codigo_estudiantil: z.string().min(3), programa_id: z.number().int(),
    semestre: z.number().int().min(1, 'Debe estar entre 1 y 14').max(14, 'Debe estar entre 1 y 14'),
    creditos_aprobados: z.number().int().min(0, 'No puede ser negativo'),
  }),
  tutor: z.object({ institucion_id: z.number().int(), cargo: z.string().optional(), telefono: z.string().optional() }),
  docente: z.object({ area: z.string().optional() }),
  director: z.object({ programa_academico: z.string().optional() }),
};
/** El Servicio de Identidad pide crear el perfil de un usuario recién registrado. */
r.post('/internal/perfil', claveInterna, asyncHandler(async (req, res) => {
  const { usuario_id, rol, datos } = req.body;
  const d = perfiles[rol].parse(datos);
  if (rol === 'estudiante') { // los créditos aprobados no pueden superar los del plan del programa
    const { rows: [p] } = await query('SELECT creditos_totales FROM programas WHERE id=$1', [d.programa_id]);
    if (!p) throw new HttpError(400, 'Datos inválidos', [{ campo: 'programa_id', mensaje: 'El programa académico no existe' }]);
    if (d.creditos_aprobados > p.creditos_totales) {
      throw new HttpError(400, 'Datos inválidos', [{ campo: 'creditos_aprobados', mensaje: `No puede superar los ${p.creditos_totales} créditos del programa` }]);
    }
  }
  const sql = {
    estudiante: ['INSERT INTO estudiantes(usuario_id,codigo_estudiantil,programa_id,semestre,creditos_aprobados) VALUES($1,$2,$3,$4,$5) RETURNING id', [usuario_id, d.codigo_estudiantil, d.programa_id, d.semestre, d.creditos_aprobados]],
    tutor: ['INSERT INTO tutores(usuario_id,institucion_id,cargo,telefono) VALUES($1,$2,$3,$4) RETURNING id', [usuario_id, d.institucion_id, d.cargo, d.telefono]],
    docente: ['INSERT INTO docentes(usuario_id,area) VALUES($1,$2) RETURNING id', [usuario_id, d.area]],
    director: ['INSERT INTO directores(usuario_id,programa_academico) VALUES($1,$2) RETURNING id', [usuario_id, d.programa_academico]],
  }[rol];
  const { rows: [p] } = await query(...sql);
  res.status(201).json({ perfil_id: p.id });
}));

module.exports = r;
