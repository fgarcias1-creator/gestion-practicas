/**
 * SERVICIO DE SEGUIMIENTO (puerto 3003) - MongoDB
 * RF04 sesiones y evidencias · RF05 bitácora · RNF01 validación en un clic ·
 * RNF02 marca de tiempo del servidor · RNF03 auditoría insert-only.
 * Motivo de usar MongoDB: evidencias de estructura variable y alto volumen de escritura.
 */
const mongoose = require('mongoose');
const { crearApp, arrancar } = require('./lib/servidor');
const { mongoUrl, puertos } = require('./lib/config');
const { iniciarJobs } = require('./jobs');
const rutas = require('./routes');

mongoose.connect(mongoUrl)
  .then(() => { console.log('[seguimiento] conectado a MongoDB'); iniciarJobs(); })
  .catch((e) => console.error('[seguimiento] error al conectar a MongoDB:', e.message));

const app = crearApp('seguimiento');
app.use('/api/v1', rutas);
arrancar(app, 'seguimiento', puertos.seguimiento);
