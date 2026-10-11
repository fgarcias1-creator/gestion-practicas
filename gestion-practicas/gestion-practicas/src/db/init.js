// Crea el esquema en PostgreSQL y carga datos de demostración en PostgreSQL y MongoDB.
// Uso: npm run db:init            (esquema + datos)
//      npm run db:init -- --sin-datos
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { pool, query } = require('../config/pg');
const connectMongo = require('../config/mongo');
const Sesion = require('../modules/seguimiento/sesion.model');
const Bitacora = require('../modules/seguimiento/bitacora.model');
const Log = require('../modules/auditoria/log.model');
const Notificacion = require('../modules/auditoria/notificacion.model');

const dia = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const usuario = async (nombre, email, rol) =>
  (await query('INSERT INTO usuarios (nombre_completo,email,password_hash,rol) VALUES ($1,$2,$3,$4) RETURNING id', [nombre, email, await bcrypt.hash('demo1234', 10), rol])).rows[0].id;

(async () => {
  await query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  console.log('Esquema de PostgreSQL creado');
  await connectMongo();
  await Promise.all([Sesion.deleteMany({}), Bitacora.deleteMany({}), Notificacion.deleteMany({}), mongoose.connection.collection('logs_auditoria').deleteMany({})]);

  if (!process.argv.includes('--sin-datos')) {
    // Instituciones y convenios (uno vigente, uno próximo a vencer y uno vencido)
    const ins = [];
    for (const [n, cupo, ini, fin] of [['Colegio San Pedro', 3, -200, 300], ['Clínica del Norte', 2, -300, 30], ['Alcaldía Municipal', 1, -700, -10]]) {
      const i = (await query('INSERT INTO instituciones (nombre,cupo_total,cupo_disponible) VALUES ($1,$2,$2) RETURNING id', [n, cupo])).rows[0].id;
      await query('INSERT INTO convenios (institucion_id,fecha_inicio,fecha_fin) VALUES ($1,$2,$3)', [i, dia(ini), dia(fin)]);
      ins.push(i);
    }
    // Usuarios (contraseña de todos: demo1234)
    const dir = await usuario('Director del programa', 'director@udi.edu.co', 'director');
    await query('INSERT INTO directores (usuario_id,programa_academico) VALUES ($1,$2)', [dir, 'Ingeniería de Sistemas']);
    const doc = await usuario('Jonathan Monsalve', 'docente@udi.edu.co', 'docente');
    await query('INSERT INTO docentes (usuario_id,area) VALUES ($1,$2)', [doc, 'Ingeniería de Software']);
    for (const [i, n, e] of [[0, 'Marta Rojas', 'tutor@sanpedro.edu.co'], [1, 'Carlos Pineda', 'tutor@clinicanorte.co'], [2, 'Ana Ruiz', 'tutor@alcaldia.gov.co']]) {
      const u = await usuario(n, e, 'tutor');
      await query('INSERT INTO tutores (usuario_id,institucion_id,cargo) VALUES ($1,$2,$3)', [u, ins[i], 'Coordinador']);
    }
    const est = [];
    for (const [n, e, cod, sem, cr, st] of [['Sergio Parra', 'sergio@udi.edu.co', '2021001', 7, 78, 'asignado'], ['Fernando Garcías', 'fernando@udi.edu.co', '2021002', 7, 75, 'pendiente'], ['Laura Díaz', 'laura@udi.edu.co', '2022003', 6, 55, 'no_solicitado']]) {
      const u = await usuario(n, e, 'estudiante');
      est.push((await query('INSERT INTO estudiantes (usuario_id,codigo_estudiantil,programa,semestre,porcentaje_creditos,estado_solicitud) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [u, cod, 'Ingeniería de Sistemas', sem, cr, st])).rows[0].id);
    }
    // Práctica en curso de Sergio y sus sesiones (MongoDB)
    await query('UPDATE instituciones SET cupo_disponible = cupo_disponible - 1 WHERE id = $1', [ins[0]]);
    await query("INSERT INTO asignaciones (estudiante_id,institucion_id,tutor_id,docente_id,convenio_id,fecha_inicio_practica,estado) VALUES ($1,$2,1,1,1,$3,'en_curso')", [est[0], ins[0], dia(-20)]);
    const ago = (h) => new Date(Date.now() - h * 3600 * 1000);
    const base = { asignacion_id: 1, estudiante_id: est[0], tutor_id: 1 };
    await Sesion.create([
      { ...base, fecha_sesion: dia(-14), horas: 6, resumen: 'Mantenimiento de equipos', evidencias: [{ tipo: 'imagen', nombre: 'fotos.png', url: '/uploads/ejemplo.png' }], estado_validacion: 'validada_tutor', fecha_envio: ago(14 * 24), fecha_validacion: ago(13 * 24) },
      { ...base, fecha_sesion: dia(-7), horas: 5, resumen: 'Soporte a docentes', evidencias: [{ tipo: 'documento', nombre: 'informe.pdf', url: '/uploads/ejemplo.pdf' }], estado_validacion: 'confirmada_automatica', validacion_automatica: true, fecha_envio: ago(7 * 24), fecha_validacion: ago(6 * 24) },
      { ...base, fecha_sesion: dia(-1), horas: 4, resumen: 'Apoyo en aula de sistemas', evidencias: [{ tipo: 'documento', nombre: 'evidencia.pdf', url: '/uploads/ejemplo.pdf' }], estado_validacion: 'pendiente_validacion', fecha_envio: ago(6) },
    ]);
    console.log('Datos de demostración cargados (contraseña de todos los usuarios: demo1234)');
  }
  await pool.end();
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
