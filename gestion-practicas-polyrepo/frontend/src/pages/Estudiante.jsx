import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, descargar } from '../api.js';
import { useDatos, useAccion, useToast, Tarjeta, Insignia, Modal, Pasos, Filtros, useFiltros, coincide, enRango, ESTADOS_SESION, fecha, Evidencias } from '../ui.jsx';

/**
 * Panel del estudiante. Implementa la especificación Astah del caso de uso «Solicitar práctica»:
 *  /solicitud   -> formulario. Flujo alterno 1a: si ya tiene una solicitud en trámite o aprobada, REDIRIGE a /seguimiento.
 *  /seguimiento -> «Consultar seguimiento» (RF05). Si no tiene práctica ni solicitud, redirige a /solicitud.
 *  Con práctica asignada, la opción «Solicitar práctica» del menú queda inhabilitada (bloquearMenu).
 * Las dos opciones están en la barra lateral (Layout); aquí solo se resuelven las rutas.
 */
export default function Estudiante({ usuario, bloquearMenu }) {
  const [toast, avisar] = useToast();
  const sol = useDatos(() => api('/solicitudes/mia'));
  const asg = useDatos(() => api('/asignaciones/mia').catch(() => null)); // 404 = aún sin práctica

  // Con la práctica ya asignada, «Solicitar práctica» queda inhabilitada en el menú (no hay nada más que solicitar).
  const asignado = Boolean(asg.datos) || sol.datos?.estado_solicitud === 'asignado';
  useEffect(() => {
    bloquearMenu?.(asignado ? { solicitud: 'Ya tiene una práctica asignada' } : {});
  }, [asignado]); // eslint-disable-line react-hooks/exhaustive-deps

  if (sol.cargando || asg.cargando) return <p>Cargando…</p>;
  if (sol.error) return <p className='aviso error'>{sol.error}</p>;
  const s = sol.datos;
  const enTramite = Boolean(asg.datos) || ['pendiente', 'asignado'].includes(s.estado_solicitud);
  const recargar = () => Promise.all([sol.recargar(), asg.recargar()]);

  return (
    <>
      {toast}
      <Routes>
        <Route path='/solicitud' element={enTramite ? <Navigate to='/seguimiento' replace /> : <Solicitud datos={s} avisar={avisar} alEnviar={recargar} />} />
        <Route path='/seguimiento' element={enTramite ? <Seguimiento usuario={usuario} solicitud={s} asignacion={asg.datos} /> : <Navigate to='/solicitud' replace />} />
        <Route path='*' element={<Navigate to={enTramite ? '/seguimiento' : '/solicitud'} replace />} />
      </Routes>
    </>
  );
}

/** Pasos 1-5 del caso de uso. Tras registrar, recargar() hace que la ruta redirija sola a /seguimiento. */
function Solicitud({ datos: s, avisar, alEnviar }) {
  const r = s.requisitos;
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const bloqueado = !s.puede_enviar; // flujo 2a: requisitos incumplidos (o solicitud ya rechazada en este período)

  async function enviar() {
    setEnviando(true);
    try {
      await api('/solicitudes', { method: 'POST' });
      setConfirmando(false);
      avisar('ok', 'Solicitud registrada en estado «Pendiente de asignación».');
      await alEnviar();
    } catch (e) {
      // Excepción E1: se informa con un Toast, el botón se vuelve a habilitar y el servidor no guarda registros parciales
      setConfirmando(false);
      avisar('error', e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tarjeta titulo='Solicitud de práctica' acciones={<Insignia estado={s.estado_solicitud} etiqueta={s.etiqueta} />}>
      <h4>1. Cumplimiento de requisitos académicos</h4>
      {r.programa && <p className='gris'>Programa: <b>{r.programa}</b> · {r.facultad} · Práctica de {r.horas_practica} horas</p>}
      <ul className='requisitos'>
        {r.items.map((i) => (
          <li key={i.clave} className={i.cumple ? 'req ok' : 'req mal'}>
            <span>{i.cumple ? '✔' : '✖'}</span> {i.etiqueta}: <b>{i.actual}{i.unidad}</b>{i.detalle && <> ({i.detalle})</>} — mínimo {i.requerido}{i.unidad} — {i.cumple ? 'Cumple' : 'No cumple'}
          </li>
        ))}
      </ul>
      {!r.cumple && (
        <div className='aviso error' role='alert'><b>No puede enviar la solicitud.</b> Requisitos faltantes:
          <ul>{r.faltantes.map((f) => <li key={f}>{f}</li>)}</ul></div>
      )}
      {s.motivo_rechazo && <div className='aviso error' role='alert'>{s.estado_solicitud === 'devuelto' ? 'Solicitud devuelta para corrección' : 'Solicitud rechazada'}: {s.motivo_rechazo}</div>}
      {s.bloqueo && <div className='aviso error' role='alert'>{s.bloqueo}</div>}

      <h4>2. Información de la práctica <span className='gris'>(detectada automáticamente, solo lectura)</span></h4>
      <fieldset disabled={bloqueado}>
        <div className='fila'>
          <div><label>Nombre de la práctica</label><input value={r.practica} readOnly disabled={bloqueado} /></div>
          <div><label>Semestre de ejecución</label><input value={r.semestre_ejecucion} readOnly disabled={bloqueado} /></div>
          <div><label>Período lectivo vigente</label><input value={r.periodo} readOnly disabled={bloqueado} /></div>
        </div>
        <p><button onClick={() => setConfirmando(true)} disabled={bloqueado || enviando}>{enviando ? 'Enviando…' : 'Enviar solicitud'}</button></p>
      </fieldset>

      {confirmando && (
        <Modal titulo='Confirmar solicitud' acciones={<>
          <button className='sec' disabled={enviando} onClick={() => setConfirmando(false)}>Cancelar</button>
          <button disabled={enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Confirmar envío'}</button></>}>
          <p>¿Confirma que desea enviar la solicitud de inicio de práctica?</p>
          <ul>
            <li>Práctica: <b>{r.practica}</b></li><li>Semestre de ejecución: <b>{r.semestre_ejecucion}</b></li><li>Período lectivo: <b>{r.periodo}</b></li>
          </ul>
          <p className='gris'>Una vez enviada, no podrá registrar otra solicitud en este período.</p>
        </Modal>
      )}
    </Tarjeta>
  );
}

/** «Consultar seguimiento»: con práctica asignada muestra la bitácora; con solicitud pendiente, su estado. */
function Seguimiento({ usuario, solicitud: s, asignacion }) {
  if (asignacion) return <MiPractica usuario={usuario} asignacion={asignacion} />;
  const d = s.solicitud;
  return (
    <Tarjeta titulo='Estado de mi solicitud' acciones={<Insignia estado='pendiente' etiqueta='Pendiente de asignación' />}>
      <Pasos estado='pendiente_asignacion' />
      <ul>
        <li>Práctica: <b>{d?.practica ?? s.requisitos.practica}</b></li>
        <li>Semestre de ejecución: <b>{d?.semestre ?? s.requisitos.semestre_ejecucion}</b></li>
        <li>Período lectivo: <b>{d?.periodo ?? s.requisitos.periodo}</b></li>
        <li>Fecha de la solicitud: <b>{d?.fecha ? fecha(d.fecha) : '—'}</b></li>
      </ul>
      <p>Su solicitud está <b>pendiente de asignación</b>: el director del programa le asignará una institución y un tutor.</p>
      <p className='gris'>Las nuevas solicitudes quedan inhabilitadas para este período lectivo.</p>
    </Tarjeta>
  );
}

function MiPractica({ usuario, asignacion }) {
  const bit = useDatos(() => api(`/bitacora/${usuario.perfil_id}`));
  const [toast, avisar] = useToast();
  const pdf = () => descargar(`/bitacora/${usuario.perfil_id}/pdf`, 'mi_bitacora.pdf').catch((e) => avisar('error', e.message));
  const [reemplaza, setReemplaza] = useState(null);   // sesión rechazada que se reenvía como nueva entrega
  const [editando, setEditando] = useState(null);     // borrador que se está editando
  const filtros = useFiltros({ q: '', estado: '', desde: '', hasta: '' });
  const b = bit.datos;
  const pct = b ? Math.min(100, Math.round((b.horas_acumuladas / b.horas_requeridas) * 100)) : 0;
  const { q, estado, desde, hasta } = filtros.valores;
  const sesiones = (b?.sesiones || []).filter((s) => coincide(s, ['resumen_actividades', 'observacion_tutor', (x) => x.calificacion?.retroalimentacion], q)
    && (!estado || s.estado_validacion === estado) && enRango(s.fecha_sesion, desde, hasta));
  const terminar = () => { setReemplaza(null); setEditando(null); bit.recargar(); };
  return (
    <>
      {toast}
      <Tarjeta titulo="Mi práctica" acciones={<><button className="sec" onClick={pdf}>Descargar PDF</button> <Insignia estado={asignacion.estado} /></>}>
        <Pasos estado={asignacion.estado} />
        <p><b>{asignacion.institucion}</b> · Tutor de la institución: {asignacion.tutor} · Docente asesor: {asignacion.docente} · Inicio: {fecha(asignacion.fecha_inicio_practica)}</p>
        {b && <>
          <p>Horas acumuladas: <b>{b.horas_acumuladas}</b> de {b.horas_requeridas} <span className="gris">(solo suman las sesiones validadas)</span></p>
          <div className="barra-prog"><div style={{ width: pct + '%' }} /></div>
          {b.calificacion && <p><b>Nota final: {b.calificacion.nota}</b> — {b.calificacion.retroalimentacion}</p>}
        </>}
        <p className="gris">El PDF trae las sesiones enviadas con su estado, la observación del tutor y la calificación del docente. Los borradores no se incluyen.</p>
      </Tarjeta>
      {(asignacion.estado === 'en_curso' || editando) && (
        <FormSesion key={editando?._id || reemplaza?._id || 'nueva'} desde={asignacion.fecha_inicio_practica} borrador={editando} reemplaza={reemplaza} alTerminar={terminar} />)}
      <Tarjeta titulo="Bitácora de sesiones">
        <Filtros filtros={filtros} buscar="Actividades, observación o calificación…" fechas total={b?.sesiones.length ?? 0} mostrados={sesiones.length}
          selects={[{ k: 'estado', etiqueta: 'Estado', opciones: ESTADOS_SESION }]} />
        <table>
          <thead><tr><th>Fecha</th><th>Horas</th><th>Actividades</th><th>Evidencias</th><th>Estado</th><th>Observación del tutor</th><th>Nota del docente</th><th></th></tr></thead>
          <tbody>
            {sesiones.map((s) => (
              <tr key={s._id}>
                <td>{fecha(s.fecha_sesion.slice(0, 10))}</td><td>{s.horas}</td><td>{s.resumen_actividades || <span className="gris">(sin resumen)</span>}</td>
                <td><Evidencias sesion={s} alError={(m) => avisar('error', m)} /></td>
                <td><Insignia estado={s.estado_validacion} />{s.validacion_automatica && <small> (automática)</small>}</td>
                <td>{s.observacion_tutor || '—'}</td>
                <td>{s.calificacion ? `${s.calificacion.nota} — ${s.calificacion.retroalimentacion}` : '—'}</td>
                <td>
                  {s.estado_validacion === 'borrador' && <Borrador s={s} alCambiar={bit.recargar} alEditar={() => { setReemplaza(null); setEditando(s); }} />}
                  {s.estado_validacion === 'requiere_correccion' && <button className="sec" onClick={() => { setEditando(null); setReemplaza(s); }}>Reenviar corrección</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {b && b.sesiones.length === 0 && <p className="gris">Aún no ha registrado sesiones.</p>}
        {b && b.sesiones.length > 0 && sesiones.length === 0 && <p className="gris">Ninguna sesión coincide con los filtros.</p>}
      </Tarjeta>
    </>
  );
}

/** Acciones de un borrador: volver a editarlo, enviarlo al tutor o eliminarlo. */
function Borrador({ s, alCambiar, alEditar }) {
  const { ejecutar, aviso } = useAccion();
  return <>
    <button className="sec" onClick={alEditar}>Editar</button>
    <button className="ok" onClick={() => ejecutar(() => api(`/sesiones/${s._id}/enviar`, { method: 'POST' }).then(alCambiar), 'Sesión enviada al tutor')}>Enviar</button>
    <button className="mal" onClick={() => { if (window.confirm('¿Eliminar este borrador? No se puede deshacer.')) ejecutar(() => api(`/sesiones/${s._id}`, { method: 'DELETE' }).then(alCambiar), 'Borrador eliminado'); }}>Eliminar</button>{aviso}
  </>;
}

/**
 * Registrar una sesión, o EDITAR un borrador (`borrador`): cambiar fecha, horas y resumen, quitar o agregar evidencias y
 * guardarlo de nuevo como borrador o enviarlo al tutor. La evidencia puede ser de cualquier formato (el servidor valida el tamaño).
 */
function FormSesion({ desde, borrador, reemplaza, alTerminar }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState(borrador
    ? { fecha_sesion: String(borrador.fecha_sesion).slice(0, 10), horas: borrador.horas, resumen_actividades: borrador.resumen_actividades || '' }
    : { fecha_sesion: hoy, horas: 3, resumen_actividades: '' });
  const [archivos, setArchivos] = useState([]);
  const [quitar, setQuitar] = useState([]);              // evidencias del borrador marcadas para quitar
  const [entrada, setEntrada] = useState(0);             // cambia para vaciar el selector de archivos
  const { ejecutar, aviso } = useAccion();
  const raiz = useRef(null);
  useEffect(() => { raiz.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }, [borrador?._id]);
  const alternar = (archivo) => setQuitar((q) => (q.includes(archivo) ? q.filter((x) => x !== archivo) : [...q, archivo]));

  async function guardar(enviar) {
    const form = new FormData();
    Object.entries({ ...f, enviar }).forEach(([k, v]) => form.append(k, v));
    if (borrador) form.append('quitar', JSON.stringify(quitar));
    else if (reemplaza) form.append('reemplaza_a', reemplaza._id);
    [...archivos].forEach((a) => form.append('evidencias', a));
    const ok = await ejecutar(() => (borrador ? api(`/sesiones/${borrador._id}`, { method: 'PUT', form }) : api('/sesiones', { method: 'POST', form })),
      enviar ? 'Sesión enviada al tutor' : borrador ? 'Cambios guardados en el borrador' : 'Borrador guardado');
    if (ok) { setF({ ...f, resumen_actividades: borrador ? f.resumen_actividades : '' }); setArchivos([]); setQuitar([]); setEntrada((n) => n + 1); alTerminar(); }
  }

  return (
    <div ref={raiz}>
      <Tarjeta titulo={borrador ? 'Editar borrador' : reemplaza ? 'Reenviar sesión corregida (nueva entrega)' : 'Registrar sesión'}>
        <div className="fila">
          <div><label>Fecha de la sesión</label><input type="date" min={desde} max={hoy} value={f.fecha_sesion} onChange={(e) => setF({ ...f, fecha_sesion: e.target.value })} /></div>
          <div><label>Horas realizadas</label><input type="number" min="0.5" max="12" step="0.5" value={f.horas} onChange={(e) => setF({ ...f, horas: e.target.value })} /></div>
        </div>
        <label>Resumen de actividades</label>
        <textarea rows="3" value={f.resumen_actividades} onChange={(e) => setF({ ...f, resumen_actividades: e.target.value })} />
        {borrador?.evidencias.length > 0 && <>
          <label>Evidencias guardadas</label>
          <ul className="evidencias">{borrador.evidencias.map((e) => (
            <li key={e.archivo} style={quitar.includes(e.archivo) ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
              {e.nombre_original} <button type="button" className="link" onClick={() => alternar(e.archivo)}>{quitar.includes(e.archivo) ? 'Conservar' : 'Quitar'}</button></li>))}</ul>
        </>}
        <label>{borrador ? 'Agregar más evidencias' : 'Evidencia'} (cualquier formato, máx. 5 MB por archivo)</label>
        <input key={entrada} type="file" multiple onChange={(e) => setArchivos(e.target.files)} />
        <p>
          <button className="sec" onClick={() => guardar(false)}>{borrador ? 'Guardar cambios' : 'Guardar borrador'}</button>
          <button onClick={() => guardar(true)}>{borrador ? 'Guardar y enviar al tutor' : 'Enviar sesión'}</button>
          {(borrador || reemplaza) && <button className="sec" onClick={alTerminar}>Cancelar</button>}
        </p>
        {aviso}
      </Tarjeta>
    </div>
  );
}
