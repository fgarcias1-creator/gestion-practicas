/**
 * API GATEWAY (puerto 3000) - punto único de entrada del frontend.
 *  - Valida el JWT una vez (excepto el login) y rechaza lo no autenticado antes de tocar un servicio.
 *  - Enruta cada prefijo /api/v1/<recurso> al servicio dueño de ese dominio.
 *  - NO expone las rutas /internal de los servicios.
 * Importante: NO usa express.json(); el proxy debe reenviar el cuerpo tal cual (incluye multipart de evidencias).
 */
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { urls, puertos } = require('./lib/config');
const { autenticar } = require('./lib/auth');
const { HttpError, manejadorErrores } = require('./lib/errors');

const app = express();
app.use(cors());
app.get('/health', (req, res) => res.json({ servicio: 'gateway', estado: 'ok' }));

// 1) Autenticación centralizada: todo /api/v1 requiere JWT salvo el login.
app.use('/api/v1', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/auth/login') return next();
  autenticar(req, res, next);
});

// 2) Tabla de enrutamiento: prefijo -> servicio
const rutas = [
  { servicio: 'identidad', prefijos: ['/api/v1/auth', '/api/v1/usuarios'] },
  { servicio: 'practicas', prefijos: ['/api/v1/solicitudes', '/api/v1/instituciones', '/api/v1/convenios', '/api/v1/asignaciones', '/api/v1/catalogos', '/api/v1/programas'] },
  { servicio: 'seguimiento', prefijos: ['/api/v1/sesiones', '/api/v1/bitacora', '/api/v1/auditoria', '/api/v1/notificaciones'] },
  { servicio: 'evaluacion', prefijos: ['/api/v1/evaluaciones', '/api/v1/calificaciones'] },
  { servicio: 'reportes', prefijos: ['/api/v1/reportes'] },
];
for (const { servicio, prefijos } of rutas) {
  app.use(createProxyMiddleware({
    target: urls[servicio], changeOrigin: true, pathFilter: prefijos,
    on: { error: (err, req, res) => res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: `Servicio «${servicio}» no disponible` })) },
  }));
}

app.use((req, res, next) => next(new HttpError(404, 'Ruta no encontrada')));
app.use(manejadorErrores);
app.listen(puertos.gateway, () => console.log(`[gateway] escuchando en :${puertos.gateway}`));
