/**
 * Configuración central. Lee el archivo .env de la raíz del proyecto.
 * Todos los servicios la comparten para usar el mismo secreto JWT y las mismas URLs.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const e = process.env;
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

module.exports = {
  pgUrl: e.PG_URL || 'postgres://practicas:practicas@localhost:5433/practicas',
  mongoUrl: e.MONGO_URL || 'mongodb://localhost:27017/practicas_seguimiento',
  jwtSecret: e.JWT_SECRET || 'secreto-solo-para-desarrollo',
  jwtExpires: e.JWT_EXPIRES || '8h',
  internalKey: e.INTERNAL_KEY || 'clave-interna-desarrollo',
  puertos: {
    gateway: num(e.PORT_GATEWAY, 3000), identidad: num(e.PORT_IDENTIDAD, 3001),
    practicas: num(e.PORT_PRACTICAS, 3002), seguimiento: num(e.PORT_SEGUIMIENTO, 3003),
    evaluacion: num(e.PORT_EVALUACION, 3004), reportes: num(e.PORT_REPORTES, 3005),
  },
  urls: {
    identidad: e.URL_IDENTIDAD || 'http://localhost:3001',
    practicas: e.URL_PRACTICAS || 'http://localhost:3002',
    seguimiento: e.URL_SEGUIMIENTO || 'http://localhost:3003',
    evaluacion: e.URL_EVALUACION || 'http://localhost:3004',
    reportes: e.URL_REPORTES || 'http://localhost:3005',
  },
  negocio: {
    minSemestre: num(e.MIN_SEMESTRE, 7),
    minCreditos: num(e.MIN_CREDITOS, 70),
    horasRequeridas: num(e.HORAS_REQUERIDAS, 160),
    maxEvidenciaMB: num(e.MAX_EVIDENCIA_MB, 5),
    maxEstudiantesTutor: num(e.MAX_ESTUDIANTES_TUTOR, 3),
    maxEstudiantesDocente: num(e.MAX_ESTUDIANTES_DOCENTE, 10),
    horasAutoConfirmacion: 24, // RF04: el tutor tiene 24 h para validar
  },
};
