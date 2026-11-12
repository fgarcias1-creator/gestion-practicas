/**
 * Prueba de extremo a extremo (npm test). Requiere: bases levantadas, `npm run db:init` recién ejecutado
 * y los 6 procesos corriendo (`npm run dev`). Recorre RF01-RF07 y RNF01-RNF03 a través del Gateway.
 */
const mongoose = require('mongoose');
require('dotenv').config();
const G = `${process.env.GATEWAY_URL || 'http://localhost:3000'}/api/v1`;
const SEGUIMIENTO_URL = process.env.SEGUIMIENTO_URL || 'http://localhost:3003';
const INTERNAL_KEY = process.env.INTERNAL_KEY || 'cambie-esta-clave-interna';
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/practicas_seguimiento';
let ok = 0, fallos = 0;
const check = (desc, cond, extra = '') => { cond ? ok++ : fallos++; console.log(`${cond ? '  ✔' : '  ✘'} ${desc}${cond ? '' : '  -> ' + extra}`); };

async function api(ruta, { token, method = 'GET', body, form } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(G + ruta, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const txt = await res.text();
  let data; try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: res.status, data };
}
const login = async (email) => (await api('/auth/login', { method: 'POST', body: { email, password: 'Practicas2026*' } })).data.token;
const hoy = new Date().toISOString().slice(0, 10);
const sesionForm = (extra = {}) => {
  const f = new FormData();
  Object.entries({ fecha_sesion: hoy, horas: '3', resumen_actividades: 'Soporte técnico y documentación', enviar: 'true', ...extra }).forEach(([k, v]) => f.append(k, v));
  f.append('evidencias', new Blob(['%PDF-1.4 prueba'], { type: 'application/pdf' }), 'evidencia.pdf');
  return f;
};

(async () => {
  await mongoose.connect(MONGO_URL); // solo para 'viajar en el tiempo' una sesión (simular que pasaron 25 h)

  console.log('Identidad / login');
  const [adm, dir, doc, tut, e1, e4] = await Promise.all(['admin@udi.edu.co', 'director@udi.edu.co', 'docente@udi.edu.co', 'tutor@santaana.com', 'estudiante1@udi.edu.co', 'estudiante4@udi.edu.co'].map(login));
  check('login de los cinco roles entrega JWT', [adm, dir, doc, tut, e1].every(Boolean));
  check('credenciales inválidas -> 401', (await api('/auth/login', { method: 'POST', body: { email: 'director@udi.edu.co', password: 'x' } })).status === 401);
  check('sin token -> 401', (await api('/solicitudes')).status === 401);

  console.log('Rol administrador: solo él crea usuarios, instituciones y convenios');
  const nuevoUsuario = (token, email, rol = 'docente') => api('/auth/registro', { token, method: 'POST', body: { nombre_completo: 'Usuario Prueba', email, password: 'Clave12345', rol, perfil: {} } });
  check('el director NO puede crear usuarios (403)', (await nuevoUsuario(dir, 'x1@udi.edu.co')).status === 403);
  check('el docente, el tutor y el estudiante NO pueden crear usuarios (403)', (await Promise.all([doc, tut, e1].map((t_) => nuevoUsuario(t_, 'x2@udi.edu.co')))).every((r_) => r_.status === 403));
  check('el director NO puede listar usuarios (403)', (await api('/usuarios', { token: dir })).status === 403);
  check('el director NO puede crear instituciones (403)', (await api('/instituciones', { token: dir, method: 'POST', body: { nit: '900000001', nombre: 'Intento Director', cupo_total: 1 } })).status === 403);
  check('el director NO puede crear convenios (403)', (await api('/convenios', { token: dir, method: 'POST', body: { institucion_id: 1, fecha_inicio: '2026-01-01', fecha_fin: '2027-01-01' } })).status === 403);
  check('el administrador lista los usuarios', (await api('/usuarios', { token: adm })).data.some((u) => u.rol === 'administrador'));
  const nd = await nuevoUsuario(adm, 'docente.nuevo@udi.edu.co');
  check('el administrador crea un docente', nd.status === 201 && nd.data.rol === 'docente', JSON.stringify(nd.data));
  check('correo repetido -> 409', (await nuevoUsuario(adm, 'docente.nuevo@udi.edu.co')).status === 409);
  const nuevoLogin = await api('/auth/login', { method: 'POST', body: { email: 'docente.nuevo@udi.edu.co', password: 'Clave12345' } });
  check('el usuario creado puede iniciar sesión con su contraseña inicial', nuevoLogin.status === 200 && nuevoLogin.data.usuario.rol === 'docente');
  const idNuevo = nd.data.id;
  check('el administrador desactiva la cuenta y ya no puede entrar', (await api(`/usuarios/${idNuevo}/estado`, { token: adm, method: 'PATCH', body: { estado: 'inactivo' } })).status === 200
    && (await api('/auth/login', { method: 'POST', body: { email: 'docente.nuevo@udi.edu.co', password: 'Clave12345' } })).status === 401);
  check('el administrador restablece la contraseña', (await api(`/usuarios/${idNuevo}/password`, { token: adm, method: 'PATCH', body: { password: 'OtraClave456' } })).status === 200);
  check('el administrador NO puede desactivar su propia cuenta', (await api(`/usuarios/${(await api('/auth/me', { token: adm })).data.id}/estado`, { token: adm, method: 'PATCH', body: { estado: 'inactivo' } })).status === 409);
  check('el administrador NO aprueba/asigna prácticas (403)', (await api('/asignaciones', { token: adm, method: 'POST', body: { estudiante_id: 1, institucion_id: 1, tutor_id: 1, docente_id: 1, fecha_inicio_practica: hoy } })).status === 403);
  const progs = (await api('/programas', { token: adm })).data;
  check('el catálogo incluye las licenciaturas con «Práctica Pedagógica»', ['Educación Infantil', 'Ciencias Naturales', 'Matemáticas', 'Lenguas Extranjeras'].every((n) => progs.some((p_) => p_.nombre === 'Licenciatura en ' + n && p_.nombre_practica === 'Práctica Pedagógica')));
  const nuevoProg = { nombre: 'Licenciatura en Educación Física', facultad: 'Facultad de Educación', creditos_totales: 160, semestre_minimo: 7, porcentaje_minimo: 70, horas_practica: 240, nombre_practica: 'Práctica Pedagógica' };
  check('el director NO puede crear programas (403)', (await api('/programas', { token: dir, method: 'POST', body: nuevoProg })).status === 403);
  check('el administrador crea un programa nuevo', (await api('/programas', { token: adm, method: 'POST', body: nuevoProg })).status === 201);
  check('programa repetido -> 409', (await api('/programas', { token: adm, method: 'POST', body: nuevoProg })).status === 409);
  check('el director y el docente NO acceden a la auditoría (403)', (await api('/auditoria', { token: dir })).status === 403 && (await api('/auditoria', { token: doc })).status === 403);
  check('el administrador NO accede a los reportes del director (403)', (await api('/reportes/asignaciones', { token: adm })).status === 403);

  console.log('RF01 Solicitud');
  const r4 = await api('/solicitudes', { token: e4, method: 'POST' });
  check('estudiante que no cumple recibe el detalle de lo que falta', r4.status === 422 && r4.data.detalle.length === 2);
  check('solicitud válida queda pendiente', (await api('/solicitudes', { token: e1, method: 'POST' })).data.estado_solicitud === 'pendiente');
  check('no se puede duplicar', (await api('/solicitudes', { token: e1, method: 'POST' })).status === 409);

  console.log('RF03 Convenios');
  const convs = (await api('/convenios', { token: dir })).data;
  check('estados calculados por fechas', ['vigente', 'proximo_a_vencer', 'vencido'].every((s) => convs.some((c) => c.estado === s)));
  check('fecha fin anterior a inicio se rechaza', (await api('/convenios', { token: adm, method: 'POST', body: { institucion_id: 1, fecha_inicio: '2026-05-01', fecha_fin: '2026-01-01' } })).status === 400);

  console.log('RF02 Asignación');
  const pend = (await api('/solicitudes', { token: dir })).data;
  const est1 = pend.find((p) => p.email === 'estudiante1@udi.edu.co').estudiante_id;
  const base = { estudiante_id: est1, tutor_id: 1, docente_id: 1, fecha_inicio_practica: hoy };
  check('convenio vencido bloquea', (await api('/asignaciones', { token: dir, method: 'POST', body: { ...base, institucion_id: 3 } })).status === 409);
  check('tutor de otra institución bloquea', (await api('/asignaciones', { token: dir, method: 'POST', body: { ...base, institucion_id: 2 } })).status === 409);
  const asg = await api('/asignaciones', { token: dir, method: 'POST', body: { ...base, institucion_id: 1 } });
  check('asignación válida -> en_curso (inicia hoy)', asg.status === 201 && asg.data.asignacion.estado === 'en_curso', JSON.stringify(asg.data));
  const asgId = asg.data.asignacion.id;
  const sesiones = async () => (await api(`/sesiones?asignacion_id=${asgId}`, { token: e1 })).data;
  check('el catálogo de programas incluye facultad, créditos y horas', (await api('/programas', { token: dir })).data.every((p) => p.facultad && p.creditos_totales && p.horas_practica));
  check('créditos aprobados mayores al plan del programa se rechazan', (await api('/auth/registro', { token: adm, method: 'POST', body: { nombre_completo: 'Prueba Cred', email: 'cred@udi.edu.co', password: 'Clave12345', rol: 'estudiante', perfil: { codigo_estudiantil: 'U999', programa_id: 1, semestre: 8, creditos_aprobados: 999 } } })).status === 400);
  check('el estudiante recibe la notificación de asignación', (await api('/notificaciones', { token: e1 })).data.items.some((n) => n.tipo === 'asignacion'));
  check('se descontó un cupo', (await api('/instituciones', { token: dir })).data.find((i) => i.id === 1).cupo_disponible === 3);

  console.log('RF04 / RNF01 / RNF02 Sesiones y validación');
  const s1 = (await api('/sesiones', { token: e1, method: 'POST', form: sesionForm() })).data;
  check('sesión enviada queda pendiente con fecha del servidor', s1.estado_validacion === 'pendiente' && !!s1.fecha_envio && !!s1.evidencias[0].fecha_carga_servidor);
  check('sesión enviada no se edita (RNF02)', (await api(`/sesiones/${s1._id}`, { token: e1, method: 'PUT', form: sesionForm() })).status === 409);
  const archivoForm = (extra, nombre, tipo, contenido) => { const f = sesionForm(extra); f.set('evidencias', new Blob([contenido], { type: tipo }), nombre); return f; };
  const bor = await api('/sesiones', { token: e1, method: 'POST', form: archivoForm({ enviar: 'false' }, 'notas.txt', 'text/plain', 'texto') });
  check('la evidencia puede ser de CUALQUIER formato (.txt) y queda en borrador', bor.status === 201 && bor.data.estado_validacion === 'borrador' && bor.data.evidencias[0].tipo === 'otro', JSON.stringify(bor.data));
  const edit = await api(`/sesiones/${bor.data._id}`, { token: e1, method: 'PUT', form: (() => { const f = new FormData(); f.append('horas', '2'); f.append('resumen_actividades', 'Borrador editado'); f.append('quitar', JSON.stringify([bor.data.evidencias[0].archivo])); f.append('evidencias', new Blob(['zip'], { type: 'application/zip' }), 'datos.zip'); return f; })() });
  check('un borrador se vuelve a editar (horas, resumen, quitar y agregar evidencias)', edit.status === 200 && edit.data.horas === 2 && edit.data.resumen_actividades === 'Borrador editado' && edit.data.evidencias.length === 1 && edit.data.evidencias[0].nombre_original === 'datos.zip', JSON.stringify(edit.data));
  const bor2 = await api('/sesiones', { token: e1, method: 'POST', form: sesionForm({ enviar: 'false', resumen_actividades: '' }) });
  const envio = await api(`/sesiones/${bor2.data._id}`, { token: e1, method: 'PUT', form: (() => { const f = new FormData(); f.append('resumen_actividades', 'Actividades completadas en la edición'); f.append('enviar', 'true'); return f; })() });
  check('editar un borrador y enviarlo en el mismo paso lo deja pendiente con fecha del servidor', envio.status === 200 && envio.data.estado_validacion === 'pendiente' && !!envio.data.fecha_envio, JSON.stringify(envio.data));
  check('el tutor rechaza esa sesión (queda requiere corrección y no suma horas)', (await api(`/sesiones/${bor2.data._id}/rechazar`, { token: tut, method: 'PATCH', body: { observacion: 'Prueba de edición de borrador' } })).data.estado_validacion === 'requiere_correccion');
  check('la fecha de la sesión no puede ser anterior al inicio de la práctica', (await api('/sesiones', { token: e1, method: 'POST', form: sesionForm({ fecha_sesion: '2000-01-01' }) })).status === 400);
  check('rechazo exige observación', (await api(`/sesiones/${s1._id}/rechazar`, { token: tut, method: 'PATCH', body: {} })).status === 400);
  check('rechazo -> requiere corrección', (await api(`/sesiones/${s1._id}/rechazar`, { token: tut, method: 'PATCH', body: { observacion: 'Falta detallar actividades' } })).data.estado_validacion === 'requiere_correccion');
  const s2 = (await api('/sesiones', { token: e1, method: 'POST', form: sesionForm({ reemplaza_a: s1._id }) })).data;
  check('corrección = nueva entrega; la original se conserva', s2._id !== s1._id && (await sesiones()).find((x) => x._id === s1._id)?.estado_validacion === 'requiere_correccion');
  check('validar en un clic (sin body)', (await api(`/sesiones/${s2._id}/validar`, { token: tut, method: 'PATCH' })).data.estado_validacion === 'validada_tutor');
  check('no se valida dos veces', (await api(`/sesiones/${s2._id}/validar`, { token: tut, method: 'PATCH' })).status === 409);
  check('el estudiante recibe aviso cuando el tutor valida', (await api('/notificaciones', { token: e1 })).data.items.some((n) => n.titulo === 'Sesión validada'));
  const s3 = (await api('/sesiones', { token: e1, method: 'POST', form: sesionForm({ horas: '4' }) })).data;
  await mongoose.connection.collection('sesiones_practica').updateOne({ _id: new mongoose.Types.ObjectId(s3._id) }, { $set: { fecha_envio: new Date(Date.now() - 25 * 3600 * 1000) } });
  await fetch(`${SEGUIMIENTO_URL}/api/v1/internal/confirmar-vencidas`, { method: 'POST', headers: { 'x-service-key': INTERNAL_KEY } }); // ruta interna (el Gateway no la expone)
  check('a las 24 h se confirma automáticamente y queda constancia', (await sesiones()).find((x) => x._id === s3._id)?.validacion_automatica === true);

  console.log('RF05 Bitácora');
  const bit = (await api(`/bitacora/${est1}`, { token: e1 })).data;
  check('horas = solo validadas + confirmadas (3 + 4 = 7)', bit.horas_acumuladas === 7 && bit.horas_requeridas === 160, JSON.stringify(bit.horas_acumuladas));
  check('otro estudiante no ve la bitácora', (await api(`/bitacora/${est1}`, { token: e4 })).status === 404);

  console.log('RF06 Calificación por sesión');
  const pub = (extra = {}) => api('/calificaciones', { token: doc, method: 'POST', body: { asignacion_id: asgId, retroalimentacion: 'Buen desempeño general', ...extra } });
  const notaSesion = (sesion, nota, extra = {}) => api('/calificaciones/sesiones', { token: doc, method: 'POST', body: { asignacion_id: asgId, sesion_id: sesion, nota, retroalimentacion: 'Retroalimentación de la sesión', ...extra } });
  check('no se publica sin la evaluación del tutor', (await pub()).status === 409);
  check('tutor evalúa', (await api('/evaluaciones', { token: tut, method: 'POST', body: { asignacion_id: asgId, disposicion: 5, cumplimiento: 5 } })).status === 201);
  check('la evaluación del tutor no se puede volver a registrar ni editar', (await api('/evaluaciones', { token: tut, method: 'POST', body: { asignacion_id: asgId, disposicion: 1, cumplimiento: 1 } })).status === 409);
  check('no se publica con sesiones sin calificar', (await pub()).status === 409);
  check('la nota de una sesión va de 0.0 a 5.0', (await notaSesion(s2._id, 5.5)).status === 400);
  check('el docente califica la sesión 1', (await notaSesion(s2._id, 4.0)).status === 201);
  check('el docente califica la sesión 2', (await notaSesion(s3._id, 4.5)).status === 201);
  const final = await pub();
  check('la nota final es el PROMEDIO de las sesiones (4.0 y 4.5 -> 4.3)', final.status === 201 && final.data.nota === 4.3, JSON.stringify(final.data));
  check('no hay segunda nota final original', (await pub()).status === 409);
  const cal = (await api(`/calificaciones/${asgId}`, { token: e1 })).data;
  check('el estudiante ve la nota final y la de cada sesión', cal.vigente.nota === 4.3 && cal.sesiones.length === 2);
  check('corregir una sesión ya publicada exige justificación', (await notaSesion(s2._id, 5.0)).status === 400);
  const corr = await notaSesion(s2._id, 5.0, { justificacion: 'Entregó el informe pendiente' });
  check('la corrección individual recalcula la final (5.0 y 4.5 -> 4.8) y la marca como corrección', corr.status === 201 && corr.data.nota_final.nota === 4.8 && corr.data.nota_final.es_correccion === true, JSON.stringify(corr.data));
  const cal2 = (await api(`/calificaciones/${asgId}`, { token: e1 })).data;
  check('la nota anterior queda en el historial', cal2.vigente.nota === 4.8 && cal2.historial.length === 2);
  check('corrección manual de la nota final exige justificación', (await api(`/calificaciones/${cal2.vigente.id}/correccion`, { token: doc, method: 'POST', body: { nota: 4.9, retroalimentacion: 'Ajuste final' } })).status === 400);

  console.log('RF05 Bitácora con notas y PDF');
  const bit2 = (await api(`/bitacora/${est1}`, { token: dir })).data;
  check('el DIRECTOR consulta la bitácora y ve la nota por sesión', bit2.sesiones.some((s) => s.calificacion && s.calificacion.nota >= 4));
  const pdf = await fetch(`${G}/bitacora/${est1}/pdf`, { headers: { Authorization: `Bearer ${e1}` } });
  check('la bitácora se descarga en PDF', pdf.status === 200 && pdf.headers.get('content-type') === 'application/pdf' && (await pdf.arrayBuffer()).byteLength > 1000);
  check('otro estudiante no puede descargar ese PDF', (await fetch(`${G}/bitacora/${est1}/pdf`, { headers: { Authorization: `Bearer ${e4}` } })).status === 404);
  check('el borrador (que no sale en el PDF) se puede eliminar', (await api(`/sesiones/${bor.data._id}`, { token: e1, method: 'DELETE' })).status === 204);

  console.log('RF01 Solo el director atiende solicitudes (el docente ya no)');
  check('el docente NO ve las solicitudes pendientes', (await api('/solicitudes', { token: doc })).status === 403);
  const solPend = (await api('/solicitudes', { token: dir })).data;
  if (solPend.length) check('el docente NO puede rechazar solicitudes', (await api(`/solicitudes/${solPend[0].estudiante_id}/rechazar`, { token: doc, method: 'PATCH', body: { motivo: 'No cumple el semestre exigido' } })).status === 403);

  console.log('RF07 Reportes');
  const rep = (await api('/reportes/asignaciones', { token: dir })).data;
  const fila = rep.filas.find((f) => f.asignacion_id === asgId);
  check('el reporte combina PostgreSQL + MongoDB', fila && fila.horas_acumuladas === 7 && fila.nota_final === 4.8, JSON.stringify(fila));
  const csv = await api('/reportes/asignaciones?formato=csv', { token: dir });
  check('exporta CSV', typeof csv.data === 'string' && csv.data.includes('asignacion_id'));
  check('docente no accede a reportes', (await api('/reportes/asignaciones', { token: doc })).status === 403);

  console.log('RNF03 Auditoría');
  await new Promise((r) => setTimeout(r, 500));
  const logs = (await api('/auditoria?limite=200', { token: adm })).data;
  const acciones = new Set(logs.map((l) => l.accion));
  check('quedan registrados asignación, validación, rechazo y calificaciones', ['practica_asignada', 'asistencia_validada', 'evidencia_rechazada', 'calificacion_registrada', 'calificacion_corregida', 'sesion_confirmada_automaticamente', 'calificacion_sesion_registrada', 'calificacion_sesion_corregida', 'bitacora_descargada'].every((a) => acciones.has(a)));
  check('no existe ruta para modificar/borrar logs', (await api(`/auditoria/${logs[0]._id}`, { token: adm, method: 'DELETE' })).status === 404);

  console.log(`\nResultado: ${ok} verificaciones correctas, ${fallos} fallidas`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
