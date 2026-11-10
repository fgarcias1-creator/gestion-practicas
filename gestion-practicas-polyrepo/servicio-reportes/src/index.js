/**
 * SERVICIO DE REPORTES (puerto 3005) - SIN base de datos propia (RF07)
 * Agrega datos de los demás servicios SOLO vía REST:
 *   Prácticas (asignaciones) + Seguimiento (horas) + Evaluación (notas).
 * Filtros: estado, institucion_id, tutor_id, docente_id, desde, hasta. Exporta CSV (?formato=csv).
 */
const express = require('express');
const { crearApp, arrancar } = require('./lib/servidor');
const { asyncHandler } = require('./lib/errors');
const { autenticar, requerirRol } = require('./lib/auth');
const { llamar } = require('./lib/http');
const { urls, puertos } = require('./lib/config');

const app = crearApp('reportes');
const r = express.Router();

const csv = (filas) => {
  if (!filas.length) return '';
  const cols = Object.keys(filas[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '\uFEFF' + [cols.join(','), ...filas.map((f) => cols.map((c) => esc(f[c])).join(','))].join('\n'); // BOM para que Excel respete tildes
};

r.get('/reportes/asignaciones', autenticar, requerirRol('director'), asyncHandler(async (req, res) => {
  const t = req.token;
  const filtros = ['estado', 'institucion_id', 'tutor_id', 'docente_id', 'desde', 'hasta'].filter((k) => req.query[k]);
  const qs = new URLSearchParams(filtros.map((k) => [k, req.query[k]])).toString();

  const [asignaciones, bitacoras, notas] = await Promise.all([
    llamar(urls.practicas, `/api/v1/asignaciones${qs ? '?' + qs : ''}`, { token: t }),
    llamar(urls.seguimiento, '/api/v1/bitacora', { token: t }),
    llamar(urls.evaluacion, '/api/v1/calificaciones', { token: t }),
  ]);
  const horasDe = Object.fromEntries(bitacoras.map((b) => [b.estudiante_id, b]));
  const notaDe = Object.fromEntries(notas.map((n) => [n.asignacion_id, n.nota]));

  const filas = asignaciones.map((a) => {
    const b = horasDe[a.estudiante_id];
    const acum = b?.horas_acumuladas ?? 0; const req_ = b?.horas_requeridas ?? 160;
    return {
      asignacion_id: a.id, estudiante: a.estudiante, institucion: a.institucion, tutor: a.tutor, docente: a.docente,
      estado: a.estado, fecha_inicio: a.fecha_inicio_practica, horas_acumuladas: acum, horas_requeridas: req_,
      avance_pct: Math.round((acum / req_) * 100), nota_final: notaDe[a.id] ?? '',
    };
  });
  if (req.query.formato === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_practicas.csv"');
    return res.send(csv(filas));
  }
  const porEstado = filas.reduce((m, f) => ({ ...m, [f.estado]: (m[f.estado] || 0) + 1 }), {});
  res.json({ total: filas.length, resumen: { por_estado: porEstado }, filas, mensaje: filas.length ? undefined : 'No hay resultados para los filtros indicados' });
}));

app.use('/api/v1', r);
arrancar(app, 'reportes', puertos.reportes);
