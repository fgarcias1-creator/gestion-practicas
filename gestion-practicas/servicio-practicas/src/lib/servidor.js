/** Fábrica de apps Express: todos los servicios arrancan igual (CORS, JSON, /health, 404 y errores). */
const express = require('express');
const cors = require('cors');
const { HttpError, manejadorErrores } = require('./errors');

function crearApp(nombre) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (req, res) => res.json({ servicio: nombre, estado: 'ok' }));
  return app;
}

function arrancar(app, nombre, puerto) {
  app.use((req, res, next) => next(new HttpError(404, 'Ruta no encontrada')));
  app.use(manejadorErrores);
  return app.listen(puerto, () => console.log(`[${nombre}] escuchando en :${puerto}`));
}

module.exports = { crearApp, arrancar };
