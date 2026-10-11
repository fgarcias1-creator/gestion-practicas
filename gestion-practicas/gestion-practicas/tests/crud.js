// Pruebas CRUD de las tablas básicas (punto 11 del entregable): cada operación se ejecuta por la API REST
// y se comprueba directamente en la base de datos (PostgreSQL con SQL, MongoDB con Mongoose).
// Uso: npm run test:crud   (reinicia los datos de ejemplo y requiere el servidor en marcha)
const BASE = process.argv[2] || 'http://localhost:3000/api/v1';
const { Client } = require('pg');
const mongoose = require('mongoose');
const cfg = require('../src/config/env');
const Sesion = require('../src/modules/seguimiento/sesion.model');

async function api(metodo, ruta, { token, body, form } = {}) {
  const h = {}; if (token) h.Authorization = `Bearer ${token}`;
  let data; if (form) data = form; else if (body) { h['Content-Type'] = 'application/json'; data = JSON.stringify(body); }
  const r = await fetch(BASE + ruta, { method: metodo, headers: h, body: data });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, j };
}
const login = async (email) => (await api('POST', '/auth/login', { body: { email, password: 'demo1234' } })).j.token;
const resultados = []; const fallos = [];
function anotar(tabla, motor, op, cond, detalle) { let f = resultados.find((x) => x.tabla === tabla); if (!f) resultados.push((f = { tabla, motor })); f[op] = !!cond; if (!cond) fallos.push(`${tabla} ${op}: ${detalle}`); }

(async () => {
  const pg = new Client(cfg.pg); await pg.connect();
  await mongoose.connect(cfg.mongoUri);
  const dir = await login('director@udi.edu.co'), sergio = await login('sergio@udi.edu.co');
  const sql = async (q, p) => (await pg.query(q, p)).rows;
  const hoy = new Date().toISOString().slice(0, 10);

  // ---- usuarios (PostgreSQL)
  let r = await api('POST', '/usuarios', { token: dir, body: { nombre_completo: 'Prueba CRUD', email: 'crud@udi.edu.co', password: 'crud12345', rol: 'estudiante', codigo_estudiantil: 'CRUD01', programa: 'Ingeniería de Sistemas', semestre: 5, porcentaje_creditos: 40 } });
  const uid = r.j.id;
  anotar('usuarios', 'PostgreSQL', 'CREATE', r.s === 201 && (await sql('SELECT 1 FROM usuarios WHERE id=$1', [uid])).length === 1 && (await sql('SELECT 1 FROM estudiantes WHERE usuario_id=$1', [uid])).length === 1, JSON.stringify(r.j));
  r = await api('GET', '/usuarios', { token: dir });
  anotar('usuarios', 'PostgreSQL', 'READ', r.s === 200 && r.j.some((u) => u.id === uid), r.s);
  r = await api('PATCH', `/usuarios/${uid}`, { token: dir, body: { nombre_completo: 'Prueba CRUD Editada' } });
  anotar('usuarios', 'PostgreSQL', 'UPDATE', r.s === 200 && (await sql('SELECT nombre_completo FROM usuarios WHERE id=$1', [uid]))[0].nombre_completo === 'Prueba CRUD Editada', JSON.stringify(r.j));
  r = await api('DELETE', `/usuarios/${uid}`, { token: dir });
  anotar('usuarios', 'PostgreSQL', 'DELETE', r.s === 204 && (await sql('SELECT 1 FROM usuarios WHERE id=$1', [uid])).length === 0, r.s);

  // ---- instituciones (PostgreSQL)
  r = await api('POST', '/instituciones', { token: dir, body: { nombre: 'Institución CRUD', direccion: 'Calle 1', cupo_total: 3 } });
  const iid = r.j.id;
  anotar('instituciones', 'PostgreSQL', 'CREATE', r.s === 201 && (await sql('SELECT cupo_total FROM instituciones WHERE id=$1', [iid]))[0]?.cupo_total === 3, JSON.stringify(r.j));
  r = await api('GET', `/instituciones/${iid}`, { token: dir });
  anotar('instituciones', 'PostgreSQL', 'READ', r.s === 200 && r.j.nombre === 'Institución CRUD', r.s);
  r = await api('PUT', `/instituciones/${iid}`, { token: dir, body: { nombre: 'Institución CRUD', direccion: 'Calle 1', cupo_total: 5 } });
  anotar('instituciones', 'PostgreSQL', 'UPDATE', r.s === 200 && (await sql('SELECT cupo_total FROM instituciones WHERE id=$1', [iid]))[0].cupo_total === 5, JSON.stringify(r.j));

  // ---- convenios (PostgreSQL, depende de la institución: integridad referencial)
  r = await api('POST', `/instituciones/${iid}/convenios`, { token: dir, body: { fecha_inicio: '2026-01-01', fecha_fin: '2027-01-01' } });
  const cid = r.j.id;
  anotar('convenios', 'PostgreSQL', 'CREATE', r.s === 201 && (await sql('SELECT 1 FROM convenios WHERE id=$1 AND institucion_id=$2', [cid, iid])).length === 1, JSON.stringify(r.j));
  r = await api('GET', `/convenios?institucion_id=${iid}`, { token: dir });
  anotar('convenios', 'PostgreSQL', 'READ', r.s === 200 && r.j.length === 1 && r.j[0].id === cid, r.s);
  r = await api('PUT', `/convenios/${cid}`, { token: dir, body: { fecha_inicio: '2026-01-01', fecha_fin: '2028-06-30' } });
  anotar('convenios', 'PostgreSQL', 'UPDATE', r.s === 200 && (await sql("SELECT to_char(fecha_fin,'YYYY-MM-DD') AS f FROM convenios WHERE id=$1", [cid]))[0].f === '2028-06-30', JSON.stringify(r.j));
  r = await api('DELETE', `/convenios/${cid}`, { token: dir });
  anotar('convenios', 'PostgreSQL', 'DELETE', r.s === 204 && (await sql('SELECT 1 FROM convenios WHERE id=$1', [cid])).length === 0, r.s);

  r = await api('DELETE', `/instituciones/${iid}`, { token: dir });
  anotar('instituciones', 'PostgreSQL', 'DELETE', r.s === 204 && (await sql('SELECT 1 FROM instituciones WHERE id=$1', [iid])).length === 0, r.s);

  // ---- sesiones_practica (MongoDB)
  const form = new FormData();
  Object.entries({ asignacion_id: 1, fecha_sesion: hoy, horas: 3, resumen: 'Sesión de prueba CRUD', enviar: 'false' }).forEach(([k, v]) => form.append(k, String(v)));
  r = await api('POST', '/sesiones', { token: sergio, form });
  const sid = r.j._id;
  anotar('sesiones_practica', 'MongoDB', 'CREATE', r.s === 201 && !!(await Sesion.findById(sid)), JSON.stringify(r.j));
  r = await api('GET', '/sesiones?asignacion_id=1', { token: sergio });
  anotar('sesiones_practica', 'MongoDB', 'READ', r.s === 200 && r.j.some((s) => s._id === sid), r.s);
  const f2 = new FormData(); f2.append('horas', '6'); f2.append('resumen', 'Sesión editada');
  r = await api('PUT', `/sesiones/${sid}`, { token: sergio, form: f2 });
  const doc = await Sesion.findById(sid);
  anotar('sesiones_practica', 'MongoDB', 'UPDATE', r.s === 200 && doc && doc.horas === 6 && doc.resumen === 'Sesión editada', JSON.stringify(r.j));
  r = await api('DELETE', `/sesiones/${sid}`, { token: sergio });
  anotar('sesiones_practica', 'MongoDB', 'DELETE', r.s === 204 && !(await Sesion.findById(sid)), r.s);

  const m = (v) => (v ? '  ✔  ' : '  ✘  ');
  console.log('\nCRUD de tablas básicas (API REST + verificación directa en la base de datos)\n');
  console.log('Tabla               Motor        CREATE  READ  UPDATE  DELETE');
  console.log('------------------- ------------ ------- ----- ------- -------');
  for (const f of resultados) console.log(`${f.tabla.padEnd(19)} ${f.motor.padEnd(12)} ${m(f.CREATE)}  ${m(f.READ)} ${m(f.UPDATE)}   ${m(f.DELETE)}`);
  const total = resultados.length * 4, ok = resultados.reduce((t, f) => t + ['CREATE', 'READ', 'UPDATE', 'DELETE'].filter((o) => f[o]).length, 0);
  console.log(`\nResultado: ${ok} de ${total} operaciones correctas`);
  fallos.forEach((x) => console.log('  ✘ ' + x));
  await pg.end(); await mongoose.disconnect();
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
