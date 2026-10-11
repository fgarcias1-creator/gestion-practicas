// Configuración centralizada: lee .env y expone los parámetros del sistema.
require('dotenv').config();
const n = (v, d) => (v === undefined || v === '' ? d : Number(v));
module.exports = {
  port: n(process.env.PORT, 3000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtExpires: process.env.JWT_EXPIRES || '8h',
  pg: {
    host: process.env.PG_HOST || 'localhost',
    port: n(process.env.PG_PORT, 5432),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    database: process.env.PG_DATABASE || 'practicas_academicas',
  },
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/practicas_seguimiento',
  reqSemestre: n(process.env.REQ_SEMESTRE, 7),
  reqCreditos: n(process.env.REQ_CREDITOS, 70),
  horasRequeridas: n(process.env.HORAS_REQUERIDAS, 160),
  plazoValidacionHoras: n(process.env.PLAZO_VALIDACION_HORAS, 24),
  uploadDir: require('path').join(__dirname, '..', '..', 'uploads'),
  production: process.env.NODE_ENV === 'production',
};
