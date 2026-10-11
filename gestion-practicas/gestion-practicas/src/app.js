// Ensamblado de la API REST v1. Cada módulo corresponde a un servicio de la arquitectura SOA (sección 5.2)
// y puede desplegarse de forma independiente en la Etapa 3.
const express = require('express');
const cors = require('cors');
const cfg = require('./config/env');
const error = require('./middleware/error');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(cfg.uploadDir));

app.get('/', (req, res) => res.json({ servicio: 'API Gestión de Prácticas Académicas', version: 'v1', estado: 'activo' }));
const v1 = express.Router();
v1.use(require('./modules/identidad/identidad.routes'));        // Servicio de Identidad (PostgreSQL)
v1.use(require('./modules/practicas/solicitudes.routes'));      // Servicio de Prácticas (PostgreSQL)
v1.use(require('./modules/practicas/instituciones.routes'));
v1.use(require('./modules/practicas/asignaciones.routes'));
v1.use(require('./modules/seguimiento/seguimiento.routes'));    // Servicio de Seguimiento (MongoDB)
v1.use(require('./modules/evaluacion/evaluacion.routes'));      // Servicio de Evaluación y Calificación (PostgreSQL)
v1.use(require('./modules/reportes/reportes.routes'));          // Servicio de Reportes (agregador)
v1.use(require('./modules/auditoria/auditoria.routes'));        // Auditoría y notificaciones (MongoDB)
app.use('/api/v1', v1);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(error);
module.exports = app;
