/**
 * node db/init.js [--si-no-existe]
 * PostgreSQL: recrea el esquema (db/schema.sql) y carga datos demo.  MongoDB: vacía las colecciones del Servicio de Seguimiento.
 * Con --si-no-existe no toca nada si la base ya está inicializada (lo usa docker compose en cada arranque).
 * Contraseña de TODOS los usuarios demo: Practicas2026*
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { Client } = require('pg');

const PG_URL = process.env.PG_URL || 'postgres://practicas:practicas@localhost:5433/practicas';
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/practicas_seguimiento';
const pool = new Client({ connectionString: PG_URL });
const PASSWORD = 'Practicas2026*';
const fecha = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };


async function main() {
  await pool.connect();
  if (process.argv.includes('--si-no-existe')) {
    const { rows: [r] } = await pool.query("SELECT to_regclass('public.usuarios') AS t");
    if (r.t) { console.log('La base de datos ya está inicializada; no se modifica.'); return; }
  }
  console.log('> PostgreSQL: creando esquema...');
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const hash = await bcrypt.hash(PASSWORD, 10);
  const usuario = async (nombre, email, rol) =>
    (await pool.query('INSERT INTO usuarios(nombre_completo,email,password_hash,rol) VALUES($1,$2,$3,$4) RETURNING id',
      [nombre, email, hash, rol])).rows[0].id;
  const una = async (sql, p) => (await pool.query(sql + ' RETURNING id', p)).rows[0].id;

  // Instituciones con convenios en distintos estados
  const inst = async (nit, nombre, cupo) =>
    una('INSERT INTO instituciones(nit,nombre,direccion,persona_contacto,email_contacto,cupo_total,cupo_disponible) VALUES($1,$2,$3,$4,$5,$6,$6)',
      [nit, nombre, 'Bucaramanga, Santander', 'Contacto ' + nombre, 'contacto@' + nit + '.com', cupo]);
  const i1 = await inst('900111222', 'Clínica Santa Ana', 5);
  const i2 = await inst('800333444', 'Alcaldía de Floridablanca', 3);
  const i3 = await inst('901555666', 'Soluciones TI S.A.S.', 2);
  const i4 = await inst('901777888', 'Institución Educativa Normal Superior', 4); // para prácticas pedagógicas (licenciaturas)
  const conv = (i, ini, fin, est) => una('INSERT INTO convenios(institucion_id,fecha_inicio,fecha_fin,estado) VALUES($1,$2,$3,$4)', [i, ini, fin, est]);
  const c1 = await conv(i1, fecha(-300), fecha(300), 'vigente');
  await conv(i2, fecha(-340), fecha(20), 'proximo_a_vencer');
  await conv(i3, fecha(-700), fecha(-30), 'vencido');
  await conv(i4, fecha(-200), fecha(400), 'vigente');

  // Usuarios y perfiles
  await usuario('Sandra Sistemas', 'admin@udi.edu.co', 'administrador'); // administrador: crea usuarios, instituciones y convenios
  const uDir = await usuario('Carlos Director', 'director@udi.edu.co', 'director');
  const uDoc = await usuario('Diana Docente', 'docente@udi.edu.co', 'docente');
  const uTut = await usuario('Tomás Tutor', 'tutor@santaana.com', 'tutor');
  const dir = await una('INSERT INTO directores(usuario_id,programa_academico) VALUES($1,$2)', [uDir, 'Ingeniería de Sistemas']);
  const doc = await una('INSERT INTO docentes(usuario_id,area) VALUES($1,$2)', [uDoc, 'Ingeniería de Software']);
  const tut = await una('INSERT INTO tutores(usuario_id,institucion_id,cargo) VALUES($1,$2,$3)', [uTut, i1, 'Jefe de Sistemas']);

  // Programas académicos (los requisitos de práctica y las horas dependen del programa)
  const prog = async (n, f, ct, sm, pm, hp, np = 'Práctica Profesional') =>
    una('INSERT INTO programas(nombre,facultad,creditos_totales,semestre_minimo,porcentaje_minimo,horas_practica,nombre_practica) VALUES($1,$2,$3,$4,$5,$6,$7)', [n, f, ct, sm, pm, hp, np]);
  const pSis = await prog('Ingeniería de Sistemas', 'Facultad de Ingenierías', 160, 7, 70, 160);
  await prog('Administración de Empresas', 'Facultad de Ciencias Económicas', 150, 7, 70, 240);
  await prog('Contaduría Pública', 'Facultad de Ciencias Económicas', 150, 7, 75, 240);
  // Licenciaturas (fines pedagógicos): valores de ejemplo, ajustables por el administrador
  for (const n of ['Educación Infantil', 'Ciencias Naturales', 'Matemáticas', 'Lenguas Extranjeras']) {
    await prog('Licenciatura en ' + n, 'Facultad de Educación', 160, 7, 70, 240, 'Práctica Pedagógica');
  }

  // Estudiantes: se guardan los CRÉDITOS APROBADOS (número); el porcentaje se calcula contra el plan del programa
  const est = async (n, email, codigo, sem, creditos, estado) => {
    const u = await usuario(n, email, 'estudiante');
    return una('INSERT INTO estudiantes(usuario_id,codigo_estudiantil,programa_id,semestre,creditos_aprobados,estado_solicitud) VALUES($1,$2,$3,$4,$5,$6)',
      [u, codigo, pSis, sem, creditos, estado]);
  };
  await est('Elena Estudiante', 'estudiante1@udi.edu.co', 'U20231001', 8, 131, 'no_solicitado');   // 81,9 %: cumple, sin solicitar
  await est('Mateo Pendiente', 'estudiante2@udi.edu.co', 'U20231002', 8, 136, 'pendiente');       // esperando asignación
  const e3 = await est('Sara En-Curso', 'estudiante3@udi.edu.co', 'U20231003', 9, 144, 'asignado'); // práctica en curso
  await est('Nico NoCumple', 'estudiante4@udi.edu.co', 'U20231004', 5, 72, 'no_solicitado');     // semestre 5 y 45 %: no cumple

  await pool.query(
    `INSERT INTO asignaciones(estudiante_id,institucion_id,tutor_id,docente_id,convenio_id,fecha_inicio_practica,estado)
     VALUES($1,$2,$3,$4,$5,$6,'en_curso')`, [e3, i1, tut, doc, c1, fecha(-14)]);
  await pool.query('UPDATE instituciones SET cupo_disponible = cupo_disponible - 1 WHERE id=$1', [i1]);
  const hoyD = new Date(); const periodo = `${hoyD.getFullYear()}-${hoyD.getMonth() < 6 ? 'I' : 'II'}`;
  await pool.query("UPDATE estudiantes SET solicitud_practica='Práctica Profesional', solicitud_semestre=semestre, solicitud_periodo=$1, fecha_solicitud=NOW() WHERE estado_solicitud IN ('pendiente','asignado')", [periodo]);
  console.log(`  usuarios demo creados (contraseña: ${PASSWORD}); admin@udi.edu.co es el administrador; director.id=${dir}`);


  // MongoDB: solo se vacían las colecciones (los índices los crea el propio Servicio de Seguimiento)
  try {
    await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 5000 });
    for (const c of ['sesiones_practica', 'bitacoras_resumen', 'logs_auditoria']) await mongoose.connection.collection(c).deleteMany({});
    console.log('> MongoDB: colecciones vaciadas.');
  } catch (e) { console.warn('> MongoDB no disponible, se omitió su limpieza:', e.message); }
  console.log('Listo.');
}

main().then(async () => { await pool.end(); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
