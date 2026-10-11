// Servicio de Reportes (agregador, sin BD propia): combina PostgreSQL y MongoDB (RF07).
const router = require('express').Router();
const { query } = require('../../config/pg');
const auth = require('../../middleware/auth');
const { ah } = require('../../utils/http');
const { refrescarEstados } = require('../../utils/estados');
const Sesion = require('../seguimiento/sesion.model');
const { VALIDAS } = require('../seguimiento/seguimiento.service');

async function construir(q) {
  await refrescarEstados();
  const { rows } = await query(`
    SELECT a.id AS asignacion_id, ue.nombre_completo AS estudiante, e.codigo_estudiantil, i.nombre AS institucion,
           ut.nombre_completo AS tutor, ud.nombre_completo AS docente, a.estado, a.fecha_inicio_practica, a.horas_requeridas,
           (SELECT nota FROM calificaciones c WHERE c.asignacion_id = a.id ORDER BY c.id DESC LIMIT 1) AS nota
    FROM asignaciones a JOIN estudiantes e ON e.id = a.estudiante_id JOIN usuarios ue ON ue.id = e.usuario_id
    JOIN instituciones i ON i.id = a.institucion_id JOIN tutores t ON t.id = a.tutor_id JOIN usuarios ut ON ut.id = t.usuario_id
    JOIN docentes d ON d.id = a.docente_id JOIN usuarios ud ON ud.id = d.usuario_id
    WHERE ($1::int IS NULL OR a.institucion_id = $1) AND ($2::int IS NULL OR a.tutor_id = $2)
      AND ($3::int IS NULL OR a.docente_id = $3) AND ($4::text IS NULL OR a.estado = $4)
      AND ($5::date IS NULL OR a.fecha_inicio_practica >= $5) AND ($6::date IS NULL OR a.fecha_inicio_practica <= $6)
    ORDER BY a.id`, [q.institucion_id || null, q.tutor_id || null, q.docente_id || null, q.estado || null, q.desde || null, q.hasta || null]);
  const horas = await Sesion.aggregate([{ $match: { estado_validacion: { $in: VALIDAS } } }, { $group: { _id: '$asignacion_id', h: { $sum: '$horas' } } }]);
  const mapa = Object.fromEntries(horas.map((h) => [h._id, h.h]));
  const filas = rows.map((r) => ({ ...r, horas_acumuladas: mapa[r.asignacion_id] || 0, avance_pct: Math.min(100, Math.round(((mapa[r.asignacion_id] || 0) / r.horas_requeridas) * 100)) }));
  const pend = (await query("SELECT COUNT(*)::int AS n FROM estudiantes WHERE estado_solicitud = 'pendiente'")).rows[0].n;
  const porEstado = filas.reduce((o, f) => ((o[f.estado] = (o[f.estado] || 0) + 1), o), {});
  return { resumen: { total_asignaciones: filas.length, pendientes_de_asignar: pend, por_estado: porEstado }, filas };
}
const csv = (filas) => {
  if (!filas.length) return '';
  const cols = Object.keys(filas[0]);
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...filas.map((f) => cols.map((c) => celda(f[c])).join(','))].join('\n');
};

// Filtros: institucion_id, tutor_id, docente_id, estado, desde, hasta. Con ?formato=csv se exporta (apto para Excel).
router.get('/reportes/asignaciones', auth('director'), ah(async (req, res) => {
  const r = await construir(req.query);
  if (req.query.formato === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_asignaciones.csv"');
    return res.send('\uFEFF' + csv(r.filas));
  }
  res.json(r);
}));
module.exports = router;
