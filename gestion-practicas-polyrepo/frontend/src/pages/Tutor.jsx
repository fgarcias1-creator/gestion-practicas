import { useState } from 'react';
import { api } from '../api.js';
import Ilustracion, { EstadoVacio } from '../Ilustracion.jsx';
import { useDatos, useAccion, Tarjeta, Insignia, Filtros, useFiltros, coincide, enRango, ESTADOS_SESION, fecha, Evidencias } from '../ui.jsx';

/** Panel del tutor: validar asistencia con UN clic (RNF01), rechazar con observación y evaluar desempeño. */
export default function Tutor() {
  const asigs = useDatos(() => api('/asignaciones'));
  const [sel, setSel] = useState(null);
  const filtros = useFiltros({ q: '', estado: '' });
  const visibles = (asigs.datos || []).filter((a) => coincide(a, ['estudiante', 'institucion', 'programa'], filtros.valores.q) && (!filtros.valores.estado || a.estado === filtros.valores.estado));
  return (
    <>
      <Tarjeta titulo="Mis estudiantes">
        <Filtros filtros={filtros} buscar="Estudiante o institución…" total={asigs.datos?.length ?? 0} mostrados={visibles.length}
          selects={[{ k: 'estado', etiqueta: 'Estado', opciones: [['', 'Todos'], ['asignado', 'Asignado'], ['en_curso', 'En curso'], ['evaluado', 'Evaluado'], ['calificado', 'Calificado'], ['finalizado', 'Finalizado']] }]} />
        <table>
          <thead><tr><th>Estudiante</th><th>Institución</th><th>Estado</th><th></th></tr></thead>
          <tbody>{visibles.map((a) => (
            <tr key={a.id}><td>{a.estudiante}</td><td>{a.institucion}</td><td><Insignia estado={a.estado} /></td>
              <td><button onClick={() => setSel(a)}>Ver sesiones</button></td></tr>))}</tbody>
        </table>
        {asigs.datos?.length === 0 && <EstadoVacio titulo="Aún no tiene estudiantes a cargo.">Cuando el director le asigne practicantes de su institución, aparecerán aquí.</EstadoVacio>}
      </Tarjeta>
      {sel && <Sesiones key={sel.id} asignacion={sel} />}
    </>
  );
}

function Sesiones({ asignacion }) {
  const ses = useDatos(() => api(`/sesiones?asignacion_id=${asignacion.id}`), [asignacion.id]);
  const { ejecutar, aviso } = useAccion();
  const filtros = useFiltros({ q: '', estado: '', desde: '', hasta: '' });
  const { q, estado, desde, hasta } = filtros.valores;
  const visibles = (ses.datos || []).filter((s) => coincide(s, ['resumen_actividades'], q) && (!estado || s.estado_validacion === estado) && enRango(s.fecha_sesion, desde, hasta));
  return (
    <>
      <Tarjeta titulo={`Sesiones de ${asignacion.estudiante}`}>
        {aviso}
        <Filtros filtros={filtros} buscar="Actividades de la sesión…" fechas total={ses.datos?.length ?? 0} mostrados={visibles.length}
          selects={[{ k: 'estado', etiqueta: 'Estado', opciones: ESTADOS_SESION.filter(([v]) => v !== 'borrador') }]} />
        <table>
          <thead><tr><th>Fecha</th><th>Horas</th><th>Actividades</th><th>Evidencia</th><th>Estado</th><th></th></tr></thead>
          <tbody>{visibles.map((s) => (
            <tr key={s._id}>
              <td>{fecha(s.fecha_sesion.slice(0, 10))}</td><td>{s.horas}</td><td>{s.resumen_actividades}</td>
              <td><Evidencias sesion={s} /></td>
              <td><Insignia estado={s.estado_validacion} /></td>
              <td>{s.estado_validacion === 'pendiente' && <>
                {/* RNF01: un solo control, sin formularios intermedios */}
                <button className="ok" onClick={() => ejecutar(() => api(`/sesiones/${s._id}/validar`, { method: 'PATCH' }).then(ses.recargar), 'Sesión validada')}>Validar</button>
                <button className="mal" onClick={() => {
                  const observacion = prompt('Observación obligatoria para el estudiante:');
                  if (observacion) ejecutar(() => api(`/sesiones/${s._id}/rechazar`, { method: 'PATCH', body: { observacion } }).then(ses.recargar), 'Sesión rechazada');
                }}>Rechazar</button></>}</td>
            </tr>))}</tbody>
        </table>
      </Tarjeta>
      <Evaluacion asignacion={asignacion} />
    </>
  );
}

/**
 * Evaluación de desempeño del tutor. Se registra UNA vez: al pulsar «Registrar» queda guardada, el formulario desaparece
 * y se muestra en solo lectura (el servidor también rechaza un segundo registro).
 */
function Evaluacion({ asignacion }) {
  const det = useDatos(() => api(`/evaluaciones/${asignacion.id}`).catch(() => ({ evaluaciones: [] })), [asignacion.id]);
  const [f, setF] = useState({ disposicion: 5, cumplimiento: 5, observaciones: '' });
  const [registrada, setRegistrada] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const guardada = registrada || det.datos?.evaluaciones?.[0];
  const evaluable = ['en_curso', 'evaluado'].includes(asignacion.estado);

  async function registrar() {
    setEnviando(true); setError('');
    try { setRegistrada(await api('/evaluaciones', { method: 'POST', body: { asignacion_id: asignacion.id, ...f } })); }
    catch (e) { setError(e.message); det.recargar(); } // si ya existía, se recarga y se muestra la guardada
    finally { setEnviando(false); }
  }

  if (det.cargando) return <Tarjeta titulo="Evaluación de desempeño"><p className="gris">Cargando…</p></Tarjeta>;
  if (guardada) {
    return (
      <Tarjeta titulo="Evaluación de desempeño" acciones={<span className="sello-bloqueado">🔒 Registrada · no editable</span>}>
        <div className="evaluacion-guardada">
          <Ilustracion tipo="evaluado" className="evaluacion-arte" />
          <div>
            {registrada && <p className="aviso ok" role="status">✔ Evaluación registrada y guardada.</p>}
            <div className="puntajes">
              <div><small>Disposición</small><Estrellas n={guardada.disposicion} /></div>
              <div><small>Cumplimiento</small><Estrellas n={guardada.cumplimiento} /></div>
            </div>
            <small className="gris">Observaciones</small>
            <blockquote className="observacion-guardada">{guardada.observaciones || 'Sin observaciones.'}</blockquote>
            <p className="gris">Registrada el {fecha(guardada.fecha_evaluacion)} · El docente la tendrá en cuenta para la nota final.</p>
          </div>
        </div>
      </Tarjeta>
    );
  }
  const num = (k) => <select value={f[k]} onChange={(e) => setF({ ...f, [k]: +e.target.value })}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>;
  return (
    <Tarjeta titulo="Evaluar desempeño (el tutor no asigna nota; el docente califica)">
      {!evaluable && <p className="aviso warn">La práctica aún no está en curso; podrá evaluarla cuando el estudiante inicie.</p>}
      <fieldset disabled={!evaluable || enviando}>
        <div className="fila"><div><label>Disposición (1-5)</label>{num('disposicion')}</div><div><label>Cumplimiento (1-5)</label>{num('cumplimiento')}</div></div>
        <label>Observaciones</label><textarea rows="3" value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} placeholder="Fortalezas, aspectos por mejorar, puntualidad…" />
        <p className="gris">🔒 Al registrar, la evaluación queda guardada y ya no se podrá editar.</p>
        <button onClick={registrar}>{enviando ? 'Registrando…' : 'Registrar evaluación'}</button>
      </fieldset>
      {error && <p className="aviso error" role="alert">{error}</p>}
    </Tarjeta>
  );
}

const Estrellas = ({ n }) => (
  <span className="estrellas" aria-label={`${n} de 5`}>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? 'llena' : ''}>★</span>)}<b>{n}/5</b></span>
);
