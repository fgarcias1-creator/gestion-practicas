import { api, descargar } from './api.js';
import { useDatos, useToast, Tarjeta, Insignia, Pasos, Filtros, useFiltros, coincide, enRango, ESTADOS_SESION, fecha, Evidencias } from './ui.jsx';
import { EstadoVacio } from './Ilustracion.jsx';

/**
 * RF05 · «Consultar seguimiento»: bitácora de un estudiante (estado, horas, sesiones y nota) con descarga en PDF.
 * La usan el docente y el director; el acceso lo controla el servidor según el rol.
 */
/** Color de una nota (0.0-5.0): alta ≥ 4, media ≥ 3, baja < 3. */
const nivel = (n) => (n == null ? '' : n >= 4 ? 'alta' : n >= 3 ? 'media' : 'baja');

export default function Bitacora({ estudianteId }) {
  const bit = useDatos(() => api(`/bitacora/${estudianteId}`), [estudianteId]);
  const [toast, avisar] = useToast();
  const filtros = useFiltros({ q: '', estado: '', desde: '', hasta: '' });
  const b = bit.datos;
  if (bit.error) return <p className="aviso error">{bit.error}</p>;
  if (!b) return <p>Cargando…</p>;
  const a = b.asignacion;
  const pct = Math.min(100, Math.round((b.horas_acumuladas / b.horas_requeridas) * 100));
  const { q, estado, desde, hasta } = filtros.valores;
  const sesiones = b.sesiones.filter((s) => coincide(s, ['resumen_actividades', (x) => x.calificacion?.retroalimentacion], q) && (!estado || s.estado_validacion === estado) && enRango(s.fecha_sesion, desde, hasta));

  const pdf = async () => {
    try { await descargar(`/bitacora/${estudianteId}/pdf`, `bitacora_${estudianteId}.pdf`); }
    catch (e) { avisar('error', e.message); }
  };

  return (
    <>
      {toast}
      <Tarjeta titulo={`Bitácora de ${a.estudiante}`} acciones={<button className="sec" onClick={pdf}>Descargar PDF</button>}>
        <Pasos estado={b.estado_general} />
        <p><b>{a.institucion}</b> · {a.programa} · Tutor de la institución: {a.tutor} · Docente asesor: {a.docente} · Inicio: {fecha(a.fecha_inicio_practica)}</p>
        <div className="kpis bitacora-kpis">
          <div className="kpi"><span className="kpi-icono">⏱</span><div><b>{b.horas_acumuladas}<em> / {b.horas_requeridas} h</em></b><small>Horas validadas</small>
            <div className="barra-prog"><div className={pct >= 100 ? 'completa' : ''} style={{ width: pct + '%' }} /></div></div></div>
          <div className="kpi"><span className="kpi-icono">📈</span><div><b>{pct}%</b><small>Avance de la práctica</small></div></div>
          <div className="kpi"><span className={'kpi-icono nota-fondo ' + nivel(b.promedio_sesiones)}>⭐</span><div>
            <b>{b.promedio_sesiones == null ? '—' : b.promedio_sesiones.toFixed(1)}</b>
            <small>{b.promedio_sesiones == null ? 'Promedio: aún sin actividades calificadas' : `Promedio de actividades (${b.sesiones_calificadas} de ${b.sesiones_validadas} calificadas)`}</small></div></div>
          <div className="kpi"><span className="kpi-icono">🎓</span><div><b>{b.calificacion ? Number(b.calificacion.nota).toFixed(1) : '—'}</b><small>{b.calificacion ? 'Nota final publicada' : 'Nota final pendiente'}</small></div></div>
        </div>
        {b.calificacion?.retroalimentacion && <p className="observacion-guardada"><b>Retroalimentación final:</b> {b.calificacion.retroalimentacion}</p>}
        <Filtros filtros={filtros} buscar="Actividades o calificación…" fechas total={b.sesiones.length} mostrados={sesiones.length}
          selects={[{ k: 'estado', etiqueta: 'Estado', opciones: ESTADOS_SESION.filter(([v]) => v !== 'borrador') }]} />
        <table>
          <thead><tr><th>Fecha</th><th>Horas</th><th>Actividades</th><th>Evidencias</th><th>Estado</th><th>Nota de la actividad</th></tr></thead>
          <tbody>{sesiones.map((s) => (
            <tr key={s._id}><td>{fecha(String(s.fecha_sesion).slice(0, 10))}</td><td>{s.horas}</td><td>{s.resumen_actividades}</td>
              <td><Evidencias sesion={s} alError={(m) => avisar('error', m)} /></td>
              <td><Insignia estado={s.estado_validacion} />{s.validacion_automatica && <small> (automática)</small>}</td>
              <td>{s.calificacion
                ? <div className="nota-actividad"><span className={'nota-chip ' + nivel(Number(s.calificacion.nota))}>{Number(s.calificacion.nota).toFixed(1)}</span>
                  {s.calificacion.retroalimentacion && <small>{s.calificacion.retroalimentacion}</small>}</div>
                : <span className="gris">{['validada_tutor', 'confirmada_automatica'].includes(s.estado_validacion) ? 'Sin calificar' : '—'}</span>}</td></tr>))}</tbody>
        </table>
        {b.sesiones.length === 0 && <EstadoVacio titulo="Aún no hay sesiones registradas." />}
        {b.sesiones.length > 0 && sesiones.length === 0 && <p className="gris">Ninguna sesión coincide con los filtros.</p>}
      </Tarjeta>
    </>
  );
}
