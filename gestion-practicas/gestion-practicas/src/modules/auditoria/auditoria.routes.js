// Consulta del historial de auditoría (RNF03) y de notificaciones. No existen rutas de modificación ni borrado.
const router = require('express').Router();
const auth = require('../../middleware/auth');
const { ah, HttpError } = require('../../utils/http');
const Log = require('./log.model');
const Notificacion = require('./notificacion.model');

router.get('/auditoria', auth('director'), ah(async (req, res) => {
  const f = {};
  if (req.query.usuario_id) f.usuario_id = Number(req.query.usuario_id);
  if (req.query.accion) f.accion = req.query.accion;
  if (req.query.servicio) f.servicio_origen = req.query.servicio;
  if (req.query.desde || req.query.hasta) f.fecha_hora = { ...(req.query.desde && { $gte: new Date(req.query.desde) }), ...(req.query.hasta && { $lte: new Date(req.query.hasta) }) };
  res.json(await Log.find(f).sort({ fecha_hora: -1 }).limit(Math.min(Number(req.query.limit) || 50, 500)));
}));
router.get('/notificaciones', auth(), ah(async (req, res) => res.json(await Notificacion.find({ usuario_id: req.user.sub }).sort({ fecha: -1 }).limit(50))));
router.patch('/notificaciones/:id/leer', auth(), ah(async (req, res) => {
  const n = await Notificacion.findOneAndUpdate({ _id: req.params.id, usuario_id: req.user.sub }, { leida: true }, { new: true });
  if (!n) throw new HttpError(404, 'Notificación no encontrada');
  res.json(n);
}));
module.exports = router;
