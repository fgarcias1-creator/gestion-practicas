import { api, descargar } from './api.js';
import { useDatos, useToast, Tarjeta, Insignia, Pasos, Filtros, useFiltros, coincide, enRango, ESTADOS_SESION, fecha } from './ui.jsx';

/**
 * RF05 · «Consultar seguimiento»: bitácora de un estudiante (estado, horas, sesiones y nota) con descarga en PDF.
 * La usan el docente y el director; el acceso lo controla el servidor según el rol.
 */
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
        <p>Horas acumuladas: <b>{b.horas_acumuladas}</b> de {b.horas_requeridas} ({pct}%) <span className="gris">(solo suman las sesiones validadas)</span></p>
        <div className="barra-prog"><div style={{ width: pct + '%' }} /></div>
        {b.calificacion && <p><b>Nota final: {b.calificacion.nota}</b> — {b.calificacion.retroalimentacion}</p>}
        <Filtros filtros={filtros} buscar="Actividades o calificación…" fechas total={b.sesiones.length} mostrados={sesiones.length}
          selects={[{ k: 'estado', etiqueta: 'Estado', opciones: ESTADOS_SESION.filter(([v]) => v !== 'borrador') }]} />
        <table>
          <thead><tr><th>Fecha</th><th>Horas</th><th>Actividades</th><th>Estado</th><th>Nota del docente</th></tr></thead>
          <tbody>{sesiones.map((s) => (
            <tr key={s._id}><td>{fecha(String(s.fecha_sesion).slice(0, 10))}</td><td>{s.horas}</td><td>{s.resumen_actividades}</td>
              <td><Insignia estado={s.estado_validacion} />{s.validacion_automatica && <small> (automática)</small>}</td>
              <td>{s.calificacion ? `${s.calificacion.nota} — ${s.calificacion.retroalimentacion}` : '—'}</td></tr>))}</tbody>
        </table>
        {b.sesiones.length === 0 && <p className="gris">Aún no hay sesiones registradas.</p>}
        {b.sesiones.length > 0 && sesiones.length === 0 && <p className="gris">Ninguna sesión coincide con los filtros.</p>}
      </Tarjeta>
    </>
  );
}
