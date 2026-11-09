import { useState } from 'react';
import { api } from '../api.js';
import { useDatos, useToast, Tarjeta, Insignia, Filtros, useFiltros, coincide, fecha, Evidencias } from '../ui.jsx';
import Bitacora from '../Bitacora.jsx';

const ESTADOS_ASIGNACION = [['', 'Todos'], ['asignado', 'Asignado'], ['en_curso', 'En curso'], ['evaluado', 'Evaluado'], ['calificado', 'Calificado'], ['finalizado', 'Finalizado']];

/**
 * Panel del docente asesor (RF05 y RF06). Única opción de la barra lateral:
 *  - Mis estudiantes: calificar cada sesión, publicar la nota final y consultar la bitácora (con PDF).
 * Las solicitudes de práctica las atiende solo el director.
 */
export default function Docente() {
  return <Estudiantes />;
}

function Estudiantes() {
  const asigs = useDatos(() => api('/asignaciones'));
  const [vista, setVista] = useState(null); // { tipo: 'calificar' | 'bitacora', asignacion }
  const filtros = useFiltros({ q: '', estado: '' });
  const visibles = (asigs.datos || []).filter((a) => coincide(a, ['estudiante', 'institucion', 'tutor', 'programa'], filtros.valores.q) && (!filtros.valores.estado || a.estado === filtros.valores.estado));
  return (
    <>
      <Tarjeta titulo="Mis estudiantes">
        <Filtros filtros={filtros} buscar="Estudiante, institución o tutor…" total={asigs.datos?.length ?? 0} mostrados={visibles.length}
          selects={[{ k: 'estado', etiqueta: 'Estado', opciones: ESTADOS_ASIGNACION }]} />
        <table>
          <thead><tr><th>Estudiante</th><th>Institución</th><th>Tutor de la institución</th><th>Estado</th><th></th></tr></thead>
          <tbody>{visibles.map((a) => (
            <tr key={a.id}><td>{a.estudiante}</td><td>{a.institucion}</td><td>{a.tutor}</td><td><Insignia estado={a.estado} /></td>
              <td>
                <button onClick={() => setVista({ tipo: 'calificar', asignacion: a })}>Calificar</button>
                <button className="sec" onClick={() => setVista({ tipo: 'bitacora', asignacion: a })}>Ver bitácora</button></td></tr>))}</tbody>
        </table>
        {asigs.datos?.length === 0 && <p className="gris">Aún no tiene estudiantes asignados.</p>}
        {asigs.datos?.length > 0 && visibles.length === 0 && <p className="gris">Ningún estudiante coincide con los filtros.</p>}
      </Tarjeta>
      {vista?.tipo === 'calificar' && <Calificar key={'c' + vista.asignacion.id} asignacion={vista.asignacion} alCambiar={asigs.recargar} />}
      {vista?.tipo === 'bitacora' && <Bitacora key={'b' + vista.asignacion.id} estudianteId={vista.asignacion.estudiante_id} />}
    </>
  );
}

/** RF06: una nota por sesión validada -> promedio -> el docente confirma y publica la nota final. */
function Calificar({ asignacion, alCambiar }) {
  const det = useDatos(() => api(`/evaluaciones/${asignacion.id}`), [asignacion.id]);
  const [toast, avisar] = useToast();
  const [fin, setFin] = useState({ retro: '', nota: '', retroCorr: '', just: '' });
  const filtros = useFiltros({ q: '', estado: '' });
  const d = det.datos;
  if (!d) return <p>{det.error || 'Cargando…'}</p>;
  const publicada = Boolean(d.vigente);
  const notaDe = Object.fromEntries(d.notas_sesion.map((n) => [n.sesion_id, n]));
  const sesionesVisibles = d.sesiones.filter((s) => coincide(s, ['resumen_actividades'], filtros.valores.q)
    && (!filtros.valores.estado || (filtros.valores.estado === 'sin_calificar' ? !notaDe[s._id] : Boolean(notaDe[s._id]))));
  const recargar = () => { det.recargar(); alCambiar(); };
  const sinEvaluacion = d.evaluaciones.length === 0;
  const puedePublicar = !publicada && !sinEvaluacion && d.resumen.completo;

  async function publicar() {
    try { await api('/calificaciones', { method: 'POST', body: { asignacion_id: asignacion.id, retroalimentacion: fin.retro } }); avisar('ok', 'Nota final publicada. El estudiante fue notificado.'); recargar(); }
    catch (e) { avisar('error', e.message); }
  }
  async function corregirFinal() {
    try {
      await api(`/calificaciones/${d.vigente.id}/correccion`, { method: 'POST', body: { nota: Number(fin.nota), retroalimentacion: fin.retroCorr, justificacion: fin.just } });
      avisar('ok', 'Corrección de la nota final registrada (la anterior queda en el historial).'); setFin({ ...fin, nota: '', retroCorr: '', just: '' }); recargar();
    } catch (e) { avisar('error', e.message); }
  }

  return (
    <>
      {toast}
      <Tarjeta titulo={`Evaluación del tutor · ${asignacion.estudiante}`}>
        {d.evaluaciones.length ? d.evaluaciones.map((e) => <p key={e.id}>Disposición {e.disposicion}/5 · Cumplimiento {e.cumplimiento}/5 · {e.observaciones || 'Sin observaciones'}</p>)
          : <p className="aviso error">El tutor aún no ha registrado su evaluación; no es posible publicar la nota final.</p>}
      </Tarjeta>

      <Tarjeta titulo={`Calificar sesiones (${d.resumen.calificadas} de ${d.resumen.total})`}
        acciones={d.resumen.promedio !== null && <span>Promedio actual: <b>{d.resumen.promedio}</b></span>}>
        {publicada && <p className="aviso warn">La nota final ya está publicada: cambiar la nota de una sesión es una <b>corrección</b>, exige justificación y recalcula la nota final.</p>}
        {d.sesiones.length === 0 && <p className="gris">Todavía no hay sesiones validadas por el tutor.</p>}
        {d.sesiones.length > 1 && <Filtros filtros={filtros} buscar="Actividades de la sesión…" total={d.sesiones.length} mostrados={sesionesVisibles.length}
          selects={[{ k: 'estado', etiqueta: 'Calificación', opciones: [['', 'Todas'], ['sin_calificar', 'Sin calificar'], ['calificada', 'Calificadas']] }]} />}
        {sesionesVisibles.map((s) => <FilaSesion key={s._id} sesion={s} vigente={notaDe[s._id]} publicada={publicada} asignacionId={asignacion.id} avisar={avisar} alGuardar={recargar} />)}
      </Tarjeta>

      {!publicada ? (
        <Tarjeta titulo="Publicar la nota final">
          <p>La nota final es el <b>promedio</b> de las notas de las sesiones{d.resumen.promedio !== null ? <>: <b>{d.resumen.promedio}</b></> : ''}.</p>
          {sinEvaluacion && <p className="aviso warn">Falta la evaluación del tutor.</p>}
          {!d.resumen.completo && d.resumen.total > 0 && <p className="aviso warn">Faltan {d.resumen.faltan} sesión(es) por calificar.</p>}
          <label>Retroalimentación final para el estudiante</label>
          <textarea rows="3" value={fin.retro} onChange={(e) => setFin({ ...fin, retro: e.target.value })} />
          <p><button disabled={!puedePublicar || fin.retro.trim().length < 5} onClick={publicar}>Confirmar y publicar nota final</button></p>
        </Tarjeta>
      ) : (
        <Tarjeta titulo={`Nota final publicada: ${d.vigente.nota}`}>
          <p>{d.vigente.retroalimentacion} <span className="gris">({d.historial.length} registro(s) en el historial)</span></p>
          <h4>Corregir la nota final</h4>
          <div className="fila">
            <div><label>Nueva nota (0.0 – 5.0)</label><input type="number" min="0" max="5" step="0.1" value={fin.nota} onChange={(e) => setFin({ ...fin, nota: e.target.value })} /></div>
            <div><label>Retroalimentación</label><input value={fin.retroCorr} onChange={(e) => setFin({ ...fin, retroCorr: e.target.value })} /></div>
            <div><label>Justificación (obligatoria)</label><input value={fin.just} onChange={(e) => setFin({ ...fin, just: e.target.value })} /></div>
          </div>
          <p><button disabled={fin.nota === '' || fin.retroCorr.trim().length < 5 || fin.just.trim().length < 5} onClick={corregirFinal}>Registrar corrección de la nota final</button></p>
        </Tarjeta>
      )}
    </>
  );
}

function FilaSesion({ sesion: s, vigente, publicada, asignacionId, avisar, alGuardar }) {
  const [editando, setEditando] = useState(!vigente);
  const [f, setF] = useState({ nota: vigente ? String(vigente.nota) : '', retro: vigente?.retroalimentacion || '', just: '' });
  const falta = f.nota === '' || f.retro.trim().length < 5 || (publicada && vigente && f.just.trim().length < 5);

  async function guardar() {
    try {
      await api('/calificaciones/sesiones', { method: 'POST', body: {
        asignacion_id: asignacionId, sesion_id: String(s._id), nota: Number(f.nota), retroalimentacion: f.retro, ...(publicada && f.just ? { justificacion: f.just } : {}) } });
      avisar('ok', publicada ? 'Corrección registrada y nota final recalculada.' : 'Nota de la sesión guardada.');
      setEditando(false); alGuardar();
    } catch (e) { avisar('error', e.message); }
  }

  return (
    <div className="sesion-nota">
      <div><b>{fecha(String(s.fecha_sesion).slice(0, 10))}</b> · {s.horas} h {s.validacion_automatica && <small>(confirmada automáticamente)</small>}<br />{s.resumen_actividades}</div>
      <div className="sesion-evidencias"><span className="gris">Evidencias del estudiante:</span> <Evidencias sesion={s} alError={(m) => avisar('error', m)} /></div>
      {s.observacion_tutor && <div className="gris">Observación del tutor: {s.observacion_tutor}</div>}
      {!editando && vigente ? (
        <p>Nota: <b>{vigente.nota}</b> — {vigente.retroalimentacion} {vigente.es_correccion && <small className="gris">(corregida)</small>}{' '}
          <button className="sec" onClick={() => setEditando(true)}>{publicada ? 'Corregir nota' : 'Cambiar nota'}</button></p>
      ) : (
        <>
          <div className="fila">
            <div><label>Nota (0.0 – 5.0)</label><input type="number" min="0" max="5" step="0.1" aria-label={`Nota de la sesión ${s.resumen_actividades}`} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} /></div>
            <div><label>Retroalimentación</label><input aria-label={`Retroalimentación de la sesión ${s.resumen_actividades}`} value={f.retro} onChange={(e) => setF({ ...f, retro: e.target.value })} /></div>
            {publicada && vigente && <div><label>Justificación de la corrección</label><input value={f.just} onChange={(e) => setF({ ...f, just: e.target.value })} /></div>}
          </div>
          <p><button disabled={falta} onClick={guardar}>{vigente ? 'Guardar nueva nota' : 'Guardar nota'}</button></p>
        </>
      )}
    </div>
  );
}
