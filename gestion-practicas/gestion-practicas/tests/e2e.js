// Prueba de extremo a extremo contra la API en ejecución (requiere: npm run db:init y npm start).
// Uso: node tests/e2e.js [URL_BASE]
const BASE = process.argv[2] || 'http://localhost:3000/api/v1';
let ok = 0, fail = 0;
const check = (nombre, cond, extra = '') => { cond ? ok++ : fail++; console.log(`${cond ? '  ✔' : '  ✘'} ${nombre}${cond ? '' : '  ← ' + extra}`); };
async function api(metodo, ruta, { token, body, form } = {}) {
  const h = {}; if (token) h.Authorization = `Bearer ${token}`;
  let data; if (form) data = form; else if (body) { h['Content-Type'] = 'application/json'; data = JSON.stringify(body); }
  const r = await fetch(BASE + ruta, { method: metodo, headers: h, body: data });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, j };
}
const login = async (email) => (await api('POST', '/auth/login', { body: { email, password: 'demo1234' } })).j.token;
const sesionForm = (extra = {}, conArchivo = true) => {
  const f = new FormData();
  const d = { asignacion_id: 1, fecha_sesion: new Date().toISOString().slice(0, 10), horas: 4, resumen: 'Prueba e2e', enviar: 'true', ...extra };
  Object.entries(d).forEach(([k, v]) => f.append(k, String(v)));
  if (conArchivo) f.append('evidencia', new Blob(['%PDF-1.4 prueba'], { type: 'application/pdf' }), 'evidencia.pdf');
  return f;
};

(async () => {
  console.log('\nIdentidad');
  let r = await api('POST', '/auth/login', { body: { email: 'sergio@udi.edu.co', password: 'mala' } });
  check('login con contraseña incorrecta → 401', r.s === 401);
  const [dir, doc, tut, sergio, fer, laura] = await Promise.all(['director@udi.edu.co', 'docente@udi.edu.co', 'tutor@sanpedro.edu.co', 'sergio@udi.edu.co', 'fernando@udi.edu.co', 'laura@udi.edu.co'].map(login));
  check('login de los 6 perfiles devuelve JWT', [dir, doc, tut, sergio, fer, laura].every(Boolean));
  check('ruta protegida sin token → 401', (await api('GET', '/asignaciones')).s === 401);
  check('estudiante no puede listar instituciones → 403', (await api('GET', '/instituciones', { token: sergio })).s === 403);

  console.log('\nRF01 Solicitud de práctica');
  r = await api('POST', '/solicitudes', { token: laura });
  check('Laura no cumple requisitos → 422 con faltantes', r.s === 422 && r.j.details.length === 2, JSON.stringify(r.j));

  console.log('\nRF03 Instituciones y convenios');
  r = await api('POST', '/instituciones', { token: dir, body: { nombre: 'Colegio Nuevo', cupo_total: 2 } });
  check('crear institución → 201', r.s === 201); const nueva = r.j.id;
  r = await api('POST', `/instituciones/${nueva}/convenios`, { token: dir, body: { fecha_inicio: '2026-06-01', fecha_fin: '2026-01-01' } });
  check('convenio con fin anterior al inicio → 400', r.s === 400);
  r = await api('POST', `/instituciones/${nueva}/convenios`, { token: dir, body: { fecha_inicio: '2026-01-01', fecha_fin: '2028-01-01' } });
  check('crear convenio → estado vigente', r.s === 201 && r.j.estado === 'vigente', JSON.stringify(r.j));
  r = await api('GET', '/convenios?estado=vencido', { token: dir });
  check('filtrar convenios vencidos', r.s === 200 && r.j.length === 1 && r.j[0].institucion === 'Alcaldía Municipal');
  r = await api('GET', '/convenios/alertas', { token: dir });
  check('alerta de convenio próximo a vencer', r.s === 200 && r.j.length === 1 && r.j[0].institucion === 'Clínica del Norte');
  check('listado de instituciones disponibles excluye convenio vencido', (await api('GET', '/instituciones?disponibles=true', { token: dir })).j.every((i) => i.nombre !== 'Alcaldía Municipal'));
  r = await api('DELETE', `/instituciones/${nueva}`, { token: dir });
  check('eliminar institución (CRUD) → 204', r.s === 204);

  console.log('\nRF02 Asignación de práctica');
  r = await api('GET', '/estudiantes?estado=pendiente', { token: dir });
  check('listado de pendientes contiene a Fernando', r.s === 200 && r.j.length === 1 && r.j[0].nombre_completo === 'Fernando Garcías'); const fId = r.j[0].id;
  r = await api('POST', '/asignaciones', { token: dir, body: { estudiante_id: fId, institucion_id: 3, tutor_id: 3, docente_id: 1, fecha_inicio: '2026-10-12' } });
  check('asignar a institución sin convenio vigente → 409', r.s === 409, JSON.stringify(r.j));
  r = await api('POST', '/asignaciones', { token: dir, body: { estudiante_id: fId, institucion_id: 1, tutor_id: 2, docente_id: 1, fecha_inicio: '2026-10-12' } });
  check('tutor de otra institución → 409', r.s === 409, JSON.stringify(r.j));
  r = await api('POST', '/asignaciones', { token: dir, body: { estudiante_id: fId, institucion_id: 1, tutor_id: 1, docente_id: 1, fecha_inicio: new Date().toISOString().slice(0, 10) } });
  check('asignación válida → 201 y práctica en curso', r.s === 201 && r.j.estado === 'en_curso', JSON.stringify(r.j));
  check('descuenta cupo de la institución', (await api('GET', '/instituciones/1', { token: dir })).j.cupo_disponible === 1);
  r = await api('POST', '/asignaciones', { token: dir, body: { estudiante_id: fId, institucion_id: 1, tutor_id: 1, docente_id: 1, fecha_inicio: '2026-10-12' } });
  check('reasignar a un estudiante ya asignado → 409', r.s === 409);
  r = await api('GET', '/notificaciones', { token: fer });
  check('el estudiante fue notificado', r.s === 200 && r.j.length >= 1);

  console.log('\nRF01 (camino válido) y rechazo de solicitud');
  r = await api('POST', '/usuarios', { token: dir, body: { nombre_completo: 'Estudiante Nuevo', email: 'nuevo@udi.edu.co', password: 'nuevo12345', rol: 'estudiante', codigo_estudiantil: 'N001', programa: 'Ingeniería de Sistemas', semestre: 8, porcentaje_creditos: 85 } });
  check('el director crea un estudiante → 201', r.s === 201, JSON.stringify(r.j));
  const nt = (await api('POST', '/auth/login', { body: { email: 'nuevo@udi.edu.co', password: 'nuevo12345' } })).j.token;
  r = await api('POST', '/solicitudes', { token: nt });
  check('solicitud con requisitos cumplidos → pendiente de asignación', r.s === 201 && r.j.estado_solicitud === 'pendiente', JSON.stringify(r.j));
  check('solicitud duplicada → 409', (await api('POST', '/solicitudes', { token: nt })).s === 409);
  const nId = r.j.id;
  check('rechazar sin motivo → 400', (await api('PATCH', `/solicitudes/${nId}/rechazar`, { token: dir, body: {} })).s === 400);
  r = await api('PATCH', `/solicitudes/${nId}/rechazar`, { token: dir, body: { motivo: 'Documentación incompleta' } });
  check('rechazar con motivo → estado rechazado', r.s === 200 && r.j.estado_solicitud === 'rechazado' && r.j.motivo_rechazo === 'Documentación incompleta', JSON.stringify(r.j));
  r = await api('GET', '/notificaciones', { token: nt });
  check('el estudiante recibe la notificación del rechazo', r.s === 200 && r.j.some((n) => /rechazada/.test(n.mensaje)));

  console.log('\nRF04 Sesiones y evidencias (MongoDB)');
  r = await api('POST', '/sesiones', { token: sergio, form: sesionForm({}, false) });
  check('enviar sin evidencia → 400', r.s === 400);
  r = await api('POST', '/sesiones', { token: sergio, form: sesionForm({ horas: 20 }) });
  check('horas fuera de rango → 400', r.s === 400);
  r = await api('POST', '/sesiones', { token: sergio, form: sesionForm() });
  check('enviar sesión con evidencia → pendiente, fecha del servidor', r.s === 201 && r.j.estado_validacion === 'pendiente_validacion' && r.j.fecha_envio && r.j.evidencias[0].fecha_carga_servidor, JSON.stringify(r.j)); const sNueva = r.j._id;
  r = await api('POST', '/sesiones', { token: sergio, form: sesionForm({ enviar: 'false', resumen: 'borrador' }) }); const borr = r.j._id;
  check('guardar borrador', r.s === 201 && r.j.estado_validacion === 'borrador');
  check('borrador se elimina', (await api('DELETE', `/sesiones/${borr}`, { token: sergio })).s === 204);
  check('sesión enviada no se elimina (RNF02) → 409', (await api('DELETE', `/sesiones/${sNueva}`, { token: sergio })).s === 409);
  r = await api('GET', '/sesiones-pendientes', { token: tut });
  check('bandeja del tutor con tiempo restante', r.s === 200 && r.j.length === 2 && r.j.every((s) => s.vence_en_horas >= 0), JSON.stringify(r.j.map((s) => s.vence_en_horas)));
  const antigua = r.j.find((s) => s._id !== sNueva)._id;
  check('otro tutor no puede validar → 403', (await api('PATCH', `/sesiones/${sNueva}/validar`, { token: await login('tutor@clinicanorte.co') })).s === 403);
  r = await api('PATCH', `/sesiones/${sNueva}/rechazar`, { token: tut, body: {} });
  check('rechazar sin observación → 400', r.s === 400);
  r = await api('PATCH', `/sesiones/${sNueva}/rechazar`, { token: tut, body: { observacion: 'Falta firma del tutor' } });
  check('rechazar con observación → requiere corrección', r.s === 200 && r.j.estado_validacion === 'requiere_correccion');
  r = await api('POST', `/sesiones/${sNueva}/reenviar`, { token: sergio, form: new FormData() });
  check('reenviar como nueva entrega, original conservada', r.s === 201 && r.j.reenvio_de === sNueva && r.j.estado_validacion === 'pendiente_validacion'); const reenv = r.j._id;
  r = await api('PATCH', `/sesiones/${reenv}/validar`, { token: tut });
  check('validar con un clic → validada_tutor', r.s === 200 && r.j.estado_validacion === 'validada_tutor' && r.j.validacion_automatica === false);
  r = await api('POST', '/sesiones/auto-confirmar', { token: dir, body: { horas: 0 } });
  check('confirmación automática de la sesión sin validar', r.s === 200 && r.j.confirmadas === 1, JSON.stringify(r.j));
  r = await api('GET', `/sesiones?asignacion_id=1&estado=confirmada_automatica`, { token: tut });
  check('queda constancia de validación automática', r.j.length === 2 && r.j.every((s) => s.validacion_automatica === true));

  console.log('\nRF05 Bitácora');
  r = await api('GET', '/bitacora/me', { token: sergio });
  check('horas acumuladas = 6+5+4+4 = 19 de 160', r.s === 200 && r.j.horas_acumuladas === 19 && r.j.horas_requeridas === 160, JSON.stringify([r.j.horas_acumuladas, r.j.horas_requeridas]));
  check('estudiante no ve la bitácora de otro → 403', (await api('GET', '/bitacora/2', { token: sergio })).s === 403);
  check('docente consulta bitácora de su estudiante', (await api('GET', '/bitacora/1', { token: doc })).s === 200);

  console.log('\nRF06 Evaluación y calificación');
  r = await api('POST', '/calificaciones', { token: doc, body: { asignacion_id: 1, nota: 4.5, retroalimentacion: 'Buen trabajo' } });
  check('calificar sin evaluación del tutor → 409', r.s === 409, JSON.stringify(r.j));
  r = await api('POST', '/evaluaciones', { token: tut, body: { asignacion_id: 1, disposicion: 6, cumplimiento: 4 } });
  check('evaluación con valor fuera de escala → 400', r.s === 400);
  r = await api('POST', '/evaluaciones', { token: tut, body: { asignacion_id: 1, disposicion: 5, cumplimiento: 4, observaciones: 'Puntual' } });
  check('evaluación del tutor registrada', r.s === 201);
  r = await api('GET', '/calificaciones/consolidado/1', { token: doc });
  check('consolidado: evaluación + sesiones validadas', r.s === 200 && r.j.evaluaciones.length === 1 && r.j.sesiones.length === 4 && r.j.horas_validadas === 19, JSON.stringify([r.j.evaluaciones?.length, r.j.sesiones?.length]));
  r = await api('POST', '/calificaciones', { token: doc, body: { asignacion_id: 1, nota: 5.5, retroalimentacion: 'x' } });
  check('nota fuera de 0–5 → 400', r.s === 400);
  r = await api('POST', '/calificaciones', { token: doc, body: { asignacion_id: 1, nota: 4.5, retroalimentacion: 'Buen trabajo' } });
  check('calificación registrada → 201', r.s === 201); const cal = r.j.id;
  check('estudiante ve su calificación', (await api('GET', '/calificaciones?asignacion_id=1', { token: sergio })).j.length === 1);
  r = await api('POST', `/calificaciones/${cal}/correccion`, { token: doc, body: { nota: 4.8, retroalimentacion: 'Ajuste', justificacion: 'Error de digitación' } });
  check('corrección crea registro nuevo ligado al original', r.s === 201 && r.j.es_correccion && r.j.calificacion_original_id === cal);
  const { Client } = require('pg'); const c = new Client(require('../src/config/env').pg); // usa la misma conexión del .env
  await c.connect(); let bloqueado = false;
  try { await c.query('UPDATE calificaciones SET nota = 1 WHERE id = $1', [cal]); } catch (e) { bloqueado = /inmutables/.test(e.message); }
  await c.end();
  check('la base de datos bloquea UPDATE sobre una calificación (trigger)', bloqueado);

  console.log('\nRF07 Reportes y RNF03 Auditoría');
  r = await api('GET', '/reportes/asignaciones?institucion_id=1', { token: dir });
  check('reporte filtrado con avance de horas y nota', r.s === 200 && r.j.filas.length === 2 && r.j.filas.find((f) => f.estudiante === 'Sergio Parra').horas_acumuladas === 19 && r.j.filas.find((f) => f.estudiante === 'Sergio Parra').nota === 4.8, JSON.stringify(r.j.filas?.map((f) => [f.estudiante, f.horas_acumuladas, f.nota])));
  r = await api('GET', '/reportes/asignaciones?formato=csv', { token: dir });
  check('exportación CSV', r.s === 200 && String(r.j).includes('estudiante'));
  check('solo el director genera reportes → 403', (await api('GET', '/reportes/asignaciones', { token: doc })).s === 403);
  r = await api('GET', '/auditoria?limit=500', { token: dir });
  const acc = new Set(r.j.map((l) => l.accion));
  check('auditoría registra asignación, validación manual/automática y calificación', ['asignacion_creada', 'validacion_asistencia', 'validacion_automatica', 'calificacion_registrada', 'calificacion_corregida'].every((a) => acc.has(a)), [...acc].join(','));
  check('auditoría es de solo lectura (PUT → 404)', (await api('PUT', '/auditoria/1', { token: dir, body: {} })).s === 404);

  console.log(`\nResultado: ${ok} correctas, ${fail} fallidas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
