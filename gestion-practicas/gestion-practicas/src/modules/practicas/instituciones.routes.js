// Servicio de Prácticas: instituciones y convenios (RF03) + catálogos de tutores y docentes.
const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../../config/pg');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { HttpError, ah } = require('../../utils/http');
const { audit } = require('../../utils/audit');
const { refrescarEstados } = require('../../utils/estados');

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use el formato AAAA-MM-DD');
const inst = z.object({ nombre: z.string().min(2), direccion: z.string().optional(), telefono_contacto: z.string().optional(), email_contacto: z.string().email().optional(), cupo_total: z.number().int().min(0) });
const conv = z.object({ fecha_inicio: fecha, fecha_fin: fecha, documento_url: z.string().optional() })
  .refine((c) => c.fecha_fin >= c.fecha_inicio, { message: 'La fecha de fin no puede ser anterior a la de inicio', path: ['fecha_fin'] });

// ---- Instituciones
router.get('/instituciones', auth('director', 'docente'), ah(async (req, res) => {
  await refrescarEstados();
  // ?disponibles=true -> solo con convenio vigente y cupo (insumo de la asignación, RF02)
  const solo = req.query.disponibles === 'true';
  const { rows } = await query(`SELECT i.*, (SELECT estado FROM convenios c WHERE c.institucion_id = i.id ORDER BY fecha_fin DESC LIMIT 1) AS estado_convenio
    FROM instituciones i WHERE NOT $1 OR (i.cupo_disponible > 0 AND EXISTS (SELECT 1 FROM convenios c WHERE c.institucion_id = i.id AND c.fecha_inicio <= CURRENT_DATE AND c.fecha_fin >= CURRENT_DATE)) ORDER BY i.id`, [solo]);
  res.json(rows);
}));
router.get('/instituciones/:id', auth('director', 'docente'), ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM instituciones WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Institución no encontrada');
  res.json(rows[0]);
}));
router.post('/instituciones', auth('director'), validate(inst), ah(async (req, res) => {
  const b = req.body;
  const { rows } = await query('INSERT INTO instituciones (nombre,direccion,telefono_contacto,email_contacto,cupo_total,cupo_disponible) VALUES ($1,$2,$3,$4,$5,$5) RETURNING *', [b.nombre, b.direccion, b.telefono_contacto, b.email_contacto, b.cupo_total]);
  await audit(req, 'practicas', 'institucion_creada', { id: rows[0].id });
  res.status(201).json(rows[0]);
}));
router.put('/instituciones/:id', auth('director'), validate(inst), ah(async (req, res) => {
  const b = req.body;
  // El cupo disponible se ajusta conservando los cupos ya ocupados.
  const { rows } = await query(`UPDATE instituciones SET nombre=$1, direccion=$2, telefono_contacto=$3, email_contacto=$4,
    cupo_disponible = $5 - (cupo_total - cupo_disponible), cupo_total = $5 WHERE id=$6 RETURNING *`, [b.nombre, b.direccion, b.telefono_contacto, b.email_contacto, b.cupo_total, req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Institución no encontrada');
  await audit(req, 'practicas', 'institucion_modificada', { id: rows[0].id });
  res.json(rows[0]);
}));
router.delete('/instituciones/:id', auth('director'), ah(async (req, res) => {
  const r = await query('DELETE FROM instituciones WHERE id = $1', [req.params.id]);
  if (!r.rowCount) throw new HttpError(404, 'Institución no encontrada');
  await audit(req, 'practicas', 'institucion_eliminada', { id: +req.params.id });
  res.status(204).end();
}));

// ---- Convenios
router.get('/convenios', auth('director', 'docente'), ah(async (req, res) => {
  await refrescarEstados();
  const { rows } = await query(`SELECT c.*, i.nombre AS institucion FROM convenios c JOIN instituciones i ON i.id = c.institucion_id
    WHERE ($1::text IS NULL OR c.estado = $1) AND ($2::int IS NULL OR c.institucion_id = $2) ORDER BY c.fecha_fin`, [req.query.estado || null, req.query.institucion_id || null]);
  res.json(rows);
}));
// Alerta de convenios próximos a vencer (RF03).
router.get('/convenios/alertas', auth('director'), ah(async (req, res) => {
  await refrescarEstados();
  const { rows } = await query("SELECT c.*, i.nombre AS institucion FROM convenios c JOIN instituciones i ON i.id = c.institucion_id WHERE c.estado = 'proximo_a_vencer' ORDER BY c.fecha_fin");
  res.json(rows);
}));
router.post('/instituciones/:id/convenios', auth('director'), validate(conv), ah(async (req, res) => {
  const b = req.body;
  const { rows } = await query('INSERT INTO convenios (institucion_id,fecha_inicio,fecha_fin,documento_url) VALUES ($1,$2,$3,$4) RETURNING *', [req.params.id, b.fecha_inicio, b.fecha_fin, b.documento_url]);
  await refrescarEstados();
  await audit(req, 'practicas', 'convenio_creado', { id: rows[0].id, institucion_id: +req.params.id });
  res.status(201).json((await query('SELECT * FROM convenios WHERE id = $1', [rows[0].id])).rows[0]);
}));
router.put('/convenios/:id', auth('director'), validate(conv), ah(async (req, res) => {
  const b = req.body;
  const { rows } = await query('UPDATE convenios SET fecha_inicio=$1, fecha_fin=$2, documento_url=$3 WHERE id=$4 RETURNING *', [b.fecha_inicio, b.fecha_fin, b.documento_url, req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Convenio no encontrado');
  await refrescarEstados();
  await audit(req, 'practicas', 'convenio_modificado', { id: rows[0].id });
  res.json((await query('SELECT * FROM convenios WHERE id = $1', [rows[0].id])).rows[0]);
}));
// Adenda: extiende la vigencia del convenio (RF03).
router.patch('/convenios/:id/prorrogar', auth('director'), validate(z.object({ fecha_fin: fecha })), ah(async (req, res) => {
  const { rows } = await query('UPDATE convenios SET fecha_fin = $1 WHERE id = $2 AND $1 >= fecha_inicio RETURNING *', [req.body.fecha_fin, req.params.id]);
  if (!rows[0]) throw new HttpError(400, 'Convenio inexistente o fecha de fin inválida');
  await refrescarEstados();
  await audit(req, 'practicas', 'convenio_prorrogado', { id: rows[0].id, fecha_fin: req.body.fecha_fin });
  res.json((await query('SELECT * FROM convenios WHERE id = $1', [rows[0].id])).rows[0]);
}));
router.delete('/convenios/:id', auth('director'), ah(async (req, res) => {
  const r = await query('DELETE FROM convenios WHERE id = $1', [req.params.id]);
  if (!r.rowCount) throw new HttpError(404, 'Convenio no encontrado');
  await audit(req, 'practicas', 'convenio_eliminado', { id: +req.params.id });
  res.status(204).end();
}));

// ---- Catálogos para la asignación
router.get('/tutores', auth('director', 'docente'), ah(async (req, res) => {
  const { rows } = await query(`SELECT t.*, u.nombre_completo FROM tutores t JOIN usuarios u ON u.id = t.usuario_id
    WHERE ($1::int IS NULL OR t.institucion_id = $1) ORDER BY t.id`, [req.query.institucion_id || null]);
  res.json(rows);
}));
router.get('/docentes', auth('director'), ah(async (req, res) => {
  const { rows } = await query('SELECT d.*, u.nombre_completo FROM docentes d JOIN usuarios u ON u.id = d.usuario_id ORDER BY d.id');
  res.json(rows);
}));
module.exports = router;
