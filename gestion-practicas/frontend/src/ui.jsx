import { useState, useEffect, useCallback } from 'react';

/** Carga datos de la API y expone recargar(). */
export function useDatos(fn, deps = []) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const recargar = useCallback(() => fn().then((d) => { setDatos(d); setError(''); }).catch((e) => setError(e.message)).finally(() => setCargando(false)), deps); // eslint-disable-line
  useEffect(() => { recargar(); }, [recargar]);
  return { datos, error, recargar, cargando };
}

export const Aviso = ({ tipo = 'error', children }) => (children ? <div className={`aviso ${tipo}`}>{children}</div> : null);
export const Insignia = ({ estado, etiqueta }) => <span className={`insignia ${estado}`}>{etiqueta || String(estado).replaceAll('_', ' ')}</span>;
export const Tarjeta = ({ titulo, children, acciones }) => (
  <section className="tarjeta"><div className="tarjeta-cab"><h3>{titulo}</h3><div>{acciones}</div></div>{children}</section>
);
export const fecha = (v) => (v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: v.length > 10 ? 'short' : undefined }) : '—');

/** Ejecuta una acción mostrando éxito/error. */
export function useAccion() {
  const [msg, setMsg] = useState({ tipo: '', texto: '' });
  const ejecutar = async (fn, ok = 'Listo') => {
    try { await fn(); setMsg({ tipo: 'ok', texto: ok }); return true; }
    catch (e) { setMsg({ tipo: 'error', texto: e.message }); return false; }
  };
  return { msg, ejecutar, aviso: <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> };
}

/** Toast (Astah E1): aviso flotante que se cierra solo. Devuelve [elemento, mostrar(tipo, texto)]. */
export function useToast() {
  const [t, setT] = useState(null);
  const mostrar = (tipo, texto) => { setT({ tipo, texto }); setTimeout(() => setT(null), 7000); };
  return [t ? <div className={`toast ${t.tipo}`} role='alert' onClick={() => setT(null)}>{t.texto}</div> : null, mostrar];
}

/** Modal de confirmación (Astah paso 4). */
export const Modal = ({ titulo, children, acciones }) => (
  <div className='modal-fondo'><div className='modal' role='dialog' aria-modal='true'><h3>{titulo}</h3>{children}<div className='modal-acciones'>{acciones}</div></div></div>
);

/** Línea de estados del proceso de práctica (RF05). */
const PASOS = [['pendiente_asignacion', 'Pendiente de asignación'], ['asignado', 'Asignado'], ['en_curso', 'En curso'], ['evaluado', 'Evaluado'], ['calificado', 'Calificado'], ['finalizado', 'Finalizado']];
export const Pasos = ({ estado }) => {
  const i = PASOS.findIndex(([k]) => k === estado);
  return <ol className='pasos'>{PASOS.map(([k, texto], n) => <li key={k} className={n < i ? 'hecho' : n === i ? 'activo' : ''}>{texto}</li>)}</ol>;
};

/** Modal con un cuadro de texto obligatorio (motivo de rechazo/devolución). Reemplaza al cuadro `prompt` del navegador. */
export function ModalMotivo({ titulo, descripcion, etiqueta = 'Motivo', alConfirmar, alCancelar }) {
  const [m, setM] = useState('');
  const [enviando, setEnviando] = useState(false);
  const valido = m.trim().length >= 5;
  const confirmar = async () => { setEnviando(true); try { await alConfirmar(m.trim()); } finally { setEnviando(false); } };
  return (
    <Modal titulo={titulo} acciones={<>
      <button className='sec' disabled={enviando} onClick={alCancelar}>Cancelar</button>
      <button disabled={!valido || enviando} onClick={confirmar}>{enviando ? 'Enviando…' : 'Confirmar'}</button></>}>
      {descripcion && <p>{descripcion}</p>}
      <label>{etiqueta} (obligatorio, mínimo 5 caracteres)</label>
      <textarea rows='3' value={m} onChange={(e) => setM(e.target.value)} autoFocus />
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Filtros de búsqueda (en el navegador): un cuadro de texto + listas desplegables + rango de fechas opcional
// ---------------------------------------------------------------------
/** Quita tildes y mayúsculas: «matematicas» encuentra «Matemáticas». */
export const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** ¿La fila contiene TODAS las palabras escritas? `campos` = nombres de propiedad o funciones que devuelven texto. */
export const coincide = (fila, campos, q) => {
  const palabras = norm(q).trim().split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const texto = norm(campos.map((c) => (typeof c === 'function' ? c(fila) : fila[c])).join(' '));
  return palabras.every((p) => texto.includes(p));
};
/** ¿La fecha (texto ISO) cae dentro del rango? Cualquier extremo vacío no limita. */
export const enRango = (valor, desde, hasta) => {
  if (!desde && !hasta) return true;
  const d = String(valor ?? '').slice(0, 10);
  return Boolean(d) && (!desde || d >= desde) && (!hasta || d <= hasta);
};

/** Estado de los filtros: { valores, cambiar(clave, valor), limpiar(), activos }. */
export function useFiltros(inicial = { q: '' }) {
  const [valores, setValores] = useState(inicial);
  const cambiar = (k, v) => setValores((x) => ({ ...x, [k]: v }));
  const limpiar = () => setValores(inicial);
  const activos = Object.keys(inicial).some((k) => valores[k] !== inicial[k]);
  return { valores, cambiar, limpiar, activos };
}

/**
 * Barra de filtros. selects = [{ k, etiqueta, opciones: [[valor, texto], …] }]. fechas = true agrega «Desde» y «Hasta».
 * Muestra «Mostrando X de Y» para que se note cuántos resultados quedan.
 */
export function Filtros({ filtros, buscar = 'Buscar…', selects = [], fechas = false, total, mostrados }) {
  const { valores, cambiar, limpiar, activos } = filtros;
  return (
    <div className="filtros" role="search">
      <div className="filtro-texto"><label>Buscar</label>
        <input type="search" aria-label="Buscar" placeholder={buscar} value={valores.q} onChange={(e) => cambiar('q', e.target.value)} /></div>
      {selects.map((s) => (
        <div key={s.k}><label>{s.etiqueta}</label>
          <select aria-label={s.etiqueta} value={valores[s.k]} onChange={(e) => cambiar(s.k, e.target.value)}>
            {s.opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select></div>
      ))}
      {fechas && <>
        <div><label>Desde</label><input type="date" aria-label="Desde" value={valores.desde} onChange={(e) => cambiar('desde', e.target.value)} /></div>
        <div><label>Hasta</label><input type="date" aria-label="Hasta" value={valores.hasta} onChange={(e) => cambiar('hasta', e.target.value)} /></div>
      </>}
      <div className="filtro-pie">
        {activos && <button type="button" className="sec" onClick={limpiar}>Limpiar filtros</button>}
        {total !== undefined && <span className="gris">Mostrando {mostrados} de {total}</span>}
      </div>
    </div>
  );
}

/** Estados de una sesión de la bitácora, para las listas de filtro. */
export const ESTADOS_SESION = [['', 'Todos'], ['borrador', 'Borrador'], ['pendiente', 'Pendiente de validación'], ['validada_tutor', 'Validada por el tutor'], ['confirmada_automatica', 'Confirmada automáticamente'], ['requiere_correccion', 'Requiere corrección']];
