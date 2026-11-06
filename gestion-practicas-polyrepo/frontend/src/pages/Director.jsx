import { useState } from 'react';
import { api, descargar } from '../api.js';
import { useDatos, useToast, Tarjeta, Insignia, Modal, ModalMotivo, Filtros, useFiltros, coincide, enRango, fecha } from '../ui.jsx';
import Bitacora from '../Bitacora.jsx';

const ESTADOS_ASIGNACION = [['', 'Todos'], ['asignado', 'Asignado'], ['en_curso', 'En curso'], ['evaluado', 'Evaluado'], ['calificado', 'Calificado'], ['finalizado', 'Finalizado']];
const hoyISO = () => new Date().toISOString().slice(0, 10);

/**
 * Panel del director (opciones en la barra lateral): aprueba/rechaza solicitudes y asigna institución, tutor y docente (RF02), consulta seguimiento y reportes (RF07). La auditoría (RNF03) es solo del administrador.
 * NO crea usuarios ni gestiona instituciones/convenios: eso lo hace el administrador (personal de sistemas).
 */
export default function Director({ seccion = 'solicitudes' }) {
  const Vista = { solicitudes: Solicitudes, asignaciones: Asignaciones, seguimiento: Seguimiento, instituciones: InstitucionesConsulta, reportes: Reportes }[seccion] || Solicitudes;
  return <Vista />;
}

// ---------------------------------------------------------------------
// Astah «Asignar práctica» + «Validar convenio activo y cupo disponible»
// ---------------------------------------------------------------------

/** Excepción E1: una institución solo se puede elegir con convenio vigente y cupos. `actual` = institución de la asignación que se reasigna. */
function disponibilidad(i, actual) {
  if (!i.activa) return { ok: false, motivo: 'inhabilitada' };
  if (!i.convenio_vigente) return { ok: false, motivo: 'sin convenio vigente' };
  if (i.cupo_disponible <= 0 && i.id !== actual) return { ok: false, motivo: 'sin cupos disponibles' };
  return { ok: true };
}

const useTutores = (f) => useDatos(() => (f.institucion_id ? api(`/catalogos/tutores?institucion_id=${f.institucion_id}`) : Promise.resolve([])), [f.institucion_id]);

/** Campos comunes de «Asignar» y «Reasignar»: institución, tutor, docente y fecha, con las alertas E1 (bloquea) y E2 (advierte). */
function CamposAsignacion({ f, setF, insts, docs, tutores, actual }) {
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'institucion_id' ? { tutor_id: '' } : {}) });
  const noDisponibles = (insts.datos || []).filter((i) => i.activa).map((i) => ({ i, d: disponibilidad(i, actual?.institucion_id) })).filter((x) => !x.d.ok);
  const sobrecargado = (p, idActual) => p && p.carga - (p.id === idActual ? 1 : 0) >= p.limite;
  const tut = tutores.datos?.find((t) => t.id === Number(f.tutor_id));
  const doc = docs.datos?.find((d) => d.id === Number(f.docente_id));
  return (
    <>
      <div className="fila">
        <div><label>Institución de destino</label>
          <select value={f.institucion_id || ''} onChange={set('institucion_id')}>
            <option value="">Seleccione…</option>
            {insts.datos?.filter((i) => i.activa).map((i) => {
              const d = disponibilidad(i, actual?.institucion_id);
              return <option key={i.id} value={i.id} disabled={!d.ok}>{i.nombre} — cupos: {i.cupo_disponible}{d.ok ? '' : ` (${d.motivo})`}</option>;
            })}
          </select></div>
        <div><label>Tutor de la institución</label>
          <select value={f.tutor_id || ''} onChange={set('tutor_id')} disabled={!f.institucion_id}>
            <option value="">Seleccione…</option>
            {tutores.datos?.map((t) => <option key={t.id} value={t.id}>{t.nombre_completo} ({t.carga}/{t.limite} estudiantes)</option>)}
          </select></div>
        <div><label>Docente asesor</label>
          <select value={f.docente_id || ''} onChange={set('docente_id')}>
            <option value="">Seleccione…</option>
            {docs.datos?.map((d) => <option key={d.id} value={d.id}>{d.nombre_completo} ({d.carga}/{d.limite} estudiantes)</option>)}
          </select></div>
        <div><label>Fecha de inicio de la práctica</label><input type="date" min={hoyISO()} value={f.fecha || ''} onChange={set('fecha')} /></div>
      </div>
      {noDisponibles.length > 0 && (
        <div className="aviso error" role="alert">
          {noDisponibles.map(({ i, d }) => <div key={i.id}>⚠ La institución seleccionada no cuenta con cupos vigentes: «{i.nombre}» ({d.motivo}). No se puede elegir.</div>)}
        </div>
      )}
      {sobrecargado(tut, actual?.tutor_id) && <div className="aviso warn" role="alert">⚠ El tutor seleccionado superó el límite de estudiantes bajo su supervisión ({tut.carga}/{tut.limite}). Puede continuar, pero revise la carga.</div>}
      {sobrecargado(doc, actual?.docente_id) && <div className="aviso warn" role="alert">⚠ El docente seleccionado superó el límite de estudiantes bajo su supervisión ({doc.carga}/{doc.limite}). Puede continuar, pero revise la carga.</div>}
    </>
  );
}

const Resumen = ({ f, insts, tutores, docs }) => (
  <ul>
    <li>Institución: <b>{insts.datos?.find((i) => i.id === Number(f.institucion_id))?.nombre}</b></li>
    <li>Tutor de la institución: <b>{tutores.datos?.find((t) => t.id === Number(f.tutor_id))?.nombre_completo}</b></li>
    <li>Docente asesor: <b>{docs.datos?.find((d) => d.id === Number(f.docente_id))?.nombre_completo}</b></li>
    <li>Inicio: <b>{fecha(f.fecha)}</b></li>
  </ul>
);

function Solicitudes() {
  const sol = useDatos(() => api('/solicitudes'));
  const insts = useDatos(() => api('/instituciones'));
  const docs = useDatos(() => api('/catalogos/docentes'));
  const [sel, setSel] = useState(null); // estudiante elegido de la lista de espera
  const [f, setF] = useState({});
  const tutores = useTutores(f);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [toast, avisar] = useToast();
  const completo = sel && f.institucion_id && f.tutor_id && f.docente_id && f.fecha;
  const filtros = useFiltros({ q: '', programa: '' });
  const enEspera = (sol.datos || []).map((x, n) => ({ ...x, orden: n + 1 }));   // el número de turno no cambia al filtrar
  const programas = [...new Set(enEspera.map((x) => x.programa))].sort();
  const visibles = enEspera.filter((x) => coincide(x, ['nombre_completo', 'codigo_estudiantil', 'programa'], filtros.valores.q) && (!filtros.valores.programa || x.programa === filtros.valores.programa));

  async function asignar() {
    setEnviando(true);
    try {
      const r = await api('/asignaciones', { method: 'POST', body: {
        estudiante_id: sel.estudiante_id, institucion_id: +f.institucion_id, tutor_id: +f.tutor_id, docente_id: +f.docente_id, fecha_inicio_practica: f.fecha } });
      setConfirmando(false); setSel(null); setF({});
      avisar('ok', 'Práctica asignada. Se notificó al estudiante, al tutor, al docente y a la institución.' + (r.advertencias.length ? ' Advertencia: ' + r.advertencias.join('; ') : ''));
      await Promise.all([sol.recargar(), insts.recargar(), docs.recargar()]);
    } catch (e) {
      setConfirmando(false);
      avisar('error', e.message);
      await insts.recargar(); // por si otro director consumió el último cupo
    } finally { setEnviando(false); }
  }

  const [rechazo, setRechazo] = useState(null);
  const motivo = (accion, id, nombre) => setRechazo({ accion, id, nombre });
  const confirmarMotivo = async (m) => {
    try {
      await api(`/solicitudes/${rechazo.id}/${rechazo.accion}`, { method: 'PATCH', body: { motivo: m } });
      avisar('ok', 'Solicitud actualizada. Se notificó al estudiante por la campana y por correo.');
      if (sel?.estudiante_id === rechazo.id) setSel(null);
      setRechazo(null); await sol.recargar();
    } catch (e) { setRechazo(null); avisar('error', e.message); }
  };

  return (
    <>
      {toast}
      <Tarjeta titulo={`Lista de espera (${sol.datos?.length ?? 0}) — en orden de llegada`}>
        <Filtros filtros={filtros} buscar="Nombre, código o programa del estudiante…" total={enEspera.length} mostrados={visibles.length}
          selects={[{ k: 'programa', etiqueta: 'Programa', opciones: [['', 'Todos'], ...programas.map((x) => [x, x])] }]} />
        <table>
          <thead><tr><th>#</th><th>Estudiante</th><th>Programa</th><th>Semestre</th><th>Créditos aprobados</th><th>Solicitó</th><th></th></tr></thead>
          <tbody>{visibles.map((s) => (
            <tr key={s.estudiante_id} style={sel?.estudiante_id === s.estudiante_id ? { background: 'var(--azul2)' } : undefined}>
              <td>{s.orden}</td>
              <td>{s.nombre_completo}<br /><span className="gris">{s.codigo_estudiantil}</span></td>
              <td>{s.programa}</td><td>{s.semestre}</td>
              <td>{s.creditos_aprobados}/{s.creditos_totales} ({s.porcentaje_creditos}%)</td>
              <td>{fecha(s.fecha_solicitud)}</td>
              <td>
                <button onClick={() => { setSel(s); setF({}); }}>{sel?.estudiante_id === s.estudiante_id ? 'Seleccionado' : 'Seleccionar'}</button>
                <button className="sec" onClick={() => motivo('devolver', s.estudiante_id, s.nombre_completo)}>Devolver</button>
                <button className="mal" onClick={() => motivo('rechazar', s.estudiante_id, s.nombre_completo)}>Rechazar</button></td></tr>))}
          </tbody>
        </table>
        {sol.datos?.length === 0 && <p className="gris">No hay estudiantes en lista de espera.</p>}
        {enEspera.length > 0 && visibles.length === 0 && <p className="gris">Ningún estudiante coincide con los filtros.</p>}
      </Tarjeta>

      {sel && (
        <Tarjeta titulo={`Asignar práctica a ${sel.nombre_completo}`}>
          <CamposAsignacion f={f} setF={setF} insts={insts} docs={docs} tutores={tutores} />
          <p><button disabled={!completo || enviando} onClick={() => setConfirmando(true)}>Asignar práctica</button></p>
        </Tarjeta>
      )}

      {rechazo && (
        <ModalMotivo titulo={rechazo.accion === 'rechazar' ? `Rechazar la solicitud de ${rechazo.nombre}` : `Devolver la solicitud de ${rechazo.nombre}`}
          descripcion={rechazo.accion === 'rechazar' ? 'El estudiante recibirá el motivo en una notificación y por correo.' : 'El estudiante podrá corregir y volver a enviar su solicitud.'}
          alConfirmar={confirmarMotivo} alCancelar={() => setRechazo(null)} />
      )}

      {confirmando && (
        <Modal titulo="Confirmar asignación" acciones={<>
          <button className="sec" disabled={enviando} onClick={() => setConfirmando(false)}>Cancelar</button>
          <button disabled={enviando} onClick={asignar}>{enviando ? 'Asignando…' : 'Confirmar asignación'}</button></>}>
          <p>Estudiante: <b>{sel.nombre_completo}</b> ({sel.programa})</p>
          <Resumen f={f} insts={insts} tutores={tutores} docs={docs} />
          <p className="gris">Al confirmar: el estudiante pasa a «Asignado», se descuenta 1 cupo a la institución y se notifica automáticamente al estudiante, al tutor, al docente y a la institución.</p>
        </Modal>
      )}
    </>
  );
}

/** Flujo alterno 2a: reasignación o cambio de tutor/institución ANTES de iniciar; libera el cupo anterior. */
function Reasignar({ asignacion: a, insts, docs, avisar, alTerminar }) {
  const [f, setF] = useState({ institucion_id: String(a.institucion_id), tutor_id: String(a.tutor_id), docente_id: String(a.docente_id), fecha: a.fecha_inicio_practica });
  const tutores = useTutores(f);
  const [confirmando, setConfirmando] = useState(false);
  const completo = f.institucion_id && f.tutor_id && f.docente_id && f.fecha;

  async function guardar() {
    try {
      const r = await api(`/asignaciones/${a.id}/reasignar`, { method: 'PATCH', body: {
        institucion_id: +f.institucion_id, tutor_id: +f.tutor_id, docente_id: +f.docente_id, fecha_inicio_practica: f.fecha } });
      avisar('ok', 'Asignación actualizada: se liberó el cupo anterior y se notificó a las partes.' + (r.advertencias.length ? ' Advertencia: ' + r.advertencias.join('; ') : ''));
      alTerminar();
    } catch (e) { avisar('error', e.message); }
    setConfirmando(false);
  }
  return (
    <Tarjeta titulo={`Reasignar la práctica de ${a.estudiante}`}>
      <p className="gris">Actual: {a.institucion} · Tutor: {a.tutor} · Docente: {a.docente} · Inicio: {fecha(a.fecha_inicio_practica)}</p>
      <CamposAsignacion f={f} setF={setF} insts={insts} docs={docs} tutores={tutores} actual={a} />
      <p><button disabled={!completo} onClick={() => setConfirmando(true)}>Guardar reasignación</button>
        <button className="sec" onClick={alTerminar}>Cancelar</button></p>
      {confirmando && (
        <Modal titulo="Confirmar reasignación" acciones={<>
          <button className="sec" onClick={() => setConfirmando(false)}>Cancelar</button><button onClick={guardar}>Confirmar</button></>}>
          <Resumen f={f} insts={insts} tutores={tutores} docs={docs} />
          <p className="gris">Se liberará el cupo de la institución anterior y se notificará a las partes involucradas.</p>
        </Modal>
      )}
    </Tarjeta>
  );
}

function Asignaciones() {
  const a = useDatos(() => api('/asignaciones'));
  const insts = useDatos(() => api('/instituciones'));
  const docs = useDatos(() => api('/catalogos/docentes'));
  const [edit, setEdit] = useState(null);
  const [toast, avisar] = useToast();
  const puedeReasignar = (x) => x.estado === 'asignado' && x.fecha_inicio_practica > hoyISO();
  const filtros = useFiltros({ q: '', estado: '', desde: '', hasta: '' });
  const { q, estado, desde, hasta } = filtros.valores;
  const visibles = (a.datos || []).filter((x) => coincide(x, ['estudiante', 'programa', 'institucion', 'tutor', 'docente'], q) && (!estado || x.estado === estado) && enRango(x.fecha_inicio_practica, desde, hasta));
  return (
    <>
      {toast}
      <Tarjeta titulo="Asignaciones">
        <Filtros filtros={filtros} buscar="Estudiante, programa, institución, tutor o docente…" fechas total={a.datos?.length ?? 0} mostrados={visibles.length}
          selects={[{ k: 'estado', etiqueta: 'Estado', opciones: ESTADOS_ASIGNACION }]} />
        <table>
          <thead><tr><th>Estudiante</th><th>Programa</th><th>Institución</th><th>Tutor</th><th>Docente asesor</th><th>Inicio</th><th>Estado</th><th></th></tr></thead>
          <tbody>{visibles.map((x) => (
            <tr key={x.id}><td>{x.estudiante}</td><td>{x.programa}</td><td>{x.institucion}</td><td>{x.tutor}</td><td>{x.docente}</td><td>{fecha(x.fecha_inicio_practica)}</td>
              <td><Insignia estado={x.estado} /></td>
              <td>{puedeReasignar(x) ? <button className="sec" onClick={() => setEdit(x)}>Reasignar</button> : <span className="gris" title="Solo antes de la fecha de inicio">—</span>}</td></tr>))}</tbody>
        </table>
        {a.datos && visibles.length === 0 && <p className="gris">Ninguna asignación coincide con los filtros.</p>}
      </Tarjeta>
      {edit && <Reasignar key={edit.id} asignacion={edit} insts={insts} docs={docs} avisar={avisar}
        alTerminar={() => { setEdit(null); a.recargar(); insts.recargar(); docs.recargar(); }} />}
    </>
  );
}

// ---------------------------------------------------------------------
// Astah «Consultar seguimiento» (RF05): el director busca un estudiante y ve su bitácora
// ---------------------------------------------------------------------
function Seguimiento() {
  const a = useDatos(() => api('/asignaciones'));
  const [sel, setSel] = useState(null);
  const filtros = useFiltros({ q: '', estado: '' });
  const lista = (a.datos || []).filter((x) => coincide(x, ['estudiante', 'institucion', 'tutor', 'docente', 'programa'], filtros.valores.q) && (!filtros.valores.estado || x.estado === filtros.valores.estado));
  return (
    <>
      <Tarjeta titulo="Consultar seguimiento">
        <Filtros filtros={filtros} buscar="Estudiante, institución, tutor, docente o programa…" total={a.datos?.length ?? 0} mostrados={lista.length}
          selects={[{ k: 'estado', etiqueta: 'Estado', opciones: ESTADOS_ASIGNACION }]} />
        <table>
          <thead><tr><th>Estudiante</th><th>Programa</th><th>Institución</th><th>Estado</th><th></th></tr></thead>
          <tbody>{lista.map((x) => (
            <tr key={x.id}><td>{x.estudiante}</td><td>{x.programa}</td><td>{x.institucion}</td><td><Insignia estado={x.estado} /></td>
              <td><button onClick={() => setSel(x)}>Ver bitácora</button></td></tr>))}</tbody>
        </table>
        {a.datos && lista.length === 0 && <p className="gris">Ningún estudiante coincide con los filtros.</p>}
      </Tarjeta>
      {sel && <Bitacora key={sel.id} estudianteId={sel.estudiante_id} />}
    </>
  );
}

// ---------------------------------------------------------------------
// Instituciones y convenios: el director SOLO CONSULTA (los crea y modifica el administrador de sistemas)
// ---------------------------------------------------------------------
function InstitucionesConsulta() {
  const insts = useDatos(() => api('/instituciones'));
  const filtros = useFiltros({ q: '', estado: '' });
  const { q, estado } = filtros.valores;
  const visibles = (insts.datos || []).filter((i) => coincide(i, ['nit', 'nombre'], q)
    && (!estado || (estado === 'cupos' ? i.activa && i.convenio_vigente && i.cupo_disponible > 0 : estado === 'vigente' ? i.convenio_vigente : !i.convenio_vigente)));
  return (
    <>
      <Tarjeta titulo="Instituciones y convenios (consulta)">
        <p className="gris">Para crear instituciones, convenios, adendas o ajustar cupos, comuníquese con el administrador del sistema.</p>
        <Filtros filtros={filtros} buscar="Nombre o NIT de la institución…" total={insts.datos?.length ?? 0} mostrados={visibles.length}
          selects={[{ k: 'estado', etiqueta: 'Mostrar', opciones: [['', 'Todas'], ['cupos', 'Disponibles para asignar'], ['vigente', 'Con convenio vigente'], ['sin_vigente', 'Sin convenio vigente']] }]} />
        <table>
          <thead><tr><th>NIT</th><th>Institución</th><th>Cupos</th><th>Convenios</th></tr></thead>
          <tbody>{visibles.map((i) => (
            <tr key={i.id}><td>{i.nit}</td><td>{i.nombre}{!i.activa && ' (inhabilitada)'}</td><td>{i.cupo_disponible}/{i.cupo_total}</td>
              <td>{i.convenios.map((v) => <div key={v.id}><Insignia estado={v.estado} /> {fecha(v.fecha_inicio)} → {fecha(v.fecha_fin)}</div>)}</td></tr>))}</tbody>
        </table>
      </Tarjeta>
    </>
  );
}

function Reportes() {
  const [estado, setEstado] = useState('');
  const rep = useDatos(() => api('/reportes/asignaciones' + (estado ? `?estado=${estado}` : '')), [estado]);
  const r = rep.datos;
  const filtros = useFiltros({ q: '' });
  const filas = (r?.filas || []).filter((x) => coincide(x, ['estudiante', 'institucion', 'tutor', 'docente'], filtros.valores.q));
  return (
    <Tarjeta titulo="Reporte de prácticas" acciones={<button className="sec" onClick={() => descargar('/reportes/asignaciones?formato=csv' + (estado ? `&estado=${estado}` : ''), 'reporte_practicas.csv')}>Exportar CSV</button>}>
      <div className="filtros" role="search">
        <div><label>Estado</label><select aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)}>{ESTADOS_ASIGNACION.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
        <div className="filtro-texto"><label>Buscar</label><input type="search" aria-label="Buscar" placeholder="Estudiante, institución, tutor o docente…" value={filtros.valores.q} onChange={(e) => filtros.cambiar('q', e.target.value)} /></div>
        <div className="filtro-pie"><span className="gris">Mostrando {filas.length} de {r?.filas.length ?? 0}</span></div>
      </div>
      <p className="gris">El CSV exportado respeta el filtro de estado.</p>
      {rep.error && <p className="aviso error">{rep.error}</p>}
      {r?.mensaje && <p className="gris">{r.mensaje}</p>}
      <table>
        <thead><tr><th>Estudiante</th><th>Institución</th><th>Tutor</th><th>Docente</th><th>Estado</th><th>Horas</th><th>Avance</th><th>Nota</th></tr></thead>
        <tbody>{filas.map((f) => <tr key={f.asignacion_id}><td>{f.estudiante}</td><td>{f.institucion}</td><td>{f.tutor}</td><td>{f.docente}</td><td><Insignia estado={f.estado} /></td><td>{f.horas_acumuladas}/{f.horas_requeridas}</td><td>{f.avance_pct}%</td><td>{f.nota_final || '—'}</td></tr>)}</tbody>
      </table>
    </Tarjeta>
  );
}
