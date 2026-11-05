import { useState } from 'react';
import { api, descargar } from '../api.js';
import { useDatos, useAccion, Tarjeta, Insignia, Filtros, useFiltros, coincide, enRango, ESTADOS_SESION, fecha } from '../ui.jsx';

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
              <td>{s.evidencias.map((e) => <button key={e.archivo} className="link" onClick={() => descargar(`/sesiones/${s._id}/evidencias/${e.archivo}`, e.nombre_original)}>{e.nombre_original}</button>)}</td>
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

function Evaluacion({ asignacion }) {
  const [f, setF] = useState({ disposicion: 5, cumplimiento: 5, observaciones: '' });
  const { ejecutar, aviso } = useAccion();
  const num = (k) => <select value={f[k]} onChange={(e) => setF({ ...f, [k]: +e.target.value })}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>;
  return (
    <Tarjeta titulo="Evaluar desempeño (el tutor no asigna nota; el docente califica)">
      <div className="fila"><div><label>Disposición (1-5)</label>{num('disposicion')}</div><div><label>Cumplimiento (1-5)</label>{num('cumplimiento')}</div></div>
      <label>Observaciones</label><textarea rows="2" value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} />
      <button onClick={() => ejecutar(() => api('/evaluaciones', { method: 'POST', body: { asignacion_id: asignacion.id, ...f } }), 'Evaluación registrada')}>Registrar evaluación</button>
      {aviso}
    </Tarjeta>
  );
}
