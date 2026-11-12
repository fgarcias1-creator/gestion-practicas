import { useState, useEffect, useCallback } from 'react';
import { descargar, obtenerArchivo } from './api.js';

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

// ---------------------------------------------------------------------
// Evidencias: vista previa en la página (sin descargar) + descarga opcional
// ---------------------------------------------------------------------
/**
 * Formatos que se pueden VER en la página. Lista cerrada a propósito: HTML, SVG como documento u otros formatos activos
 * NO se abren aquí (podrían ejecutar código dentro del sistema); esos solo se descargan.
 * Word (.docx) se convierte a texto con formato y se muestra en un marco aislado (sandbox, sin scripts).
 */
const VISTA = {
  imagen: { ext: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'], mime: { jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' } },
  pdf: { ext: ['pdf'], mime: { pdf: 'application/pdf' } },
  word: { ext: ['docx'], mime: {} },
  texto: { ext: ['txt', 'csv', 'md', 'json', 'log'], mime: {} },
  video: { ext: ['mp4', 'webm', 'ogv', 'mov'], mime: { mov: 'video/mp4', ogv: 'video/ogg' } },
  audio: { ext: ['mp3', 'wav', 'ogg', 'm4a'], mime: { mp3: 'audio/mpeg', m4a: 'audio/mp4' } },
};
const extension = (nombre = '') => (nombre.includes('.') ? nombre.split('.').pop().toLowerCase() : '');
/** Formato guardado por el servidor (mime) -> tipo de vista, para archivos cuyo nombre no trae extensión reconocible. */
const porMime = (m = '') => (m === 'application/pdf' ? 'pdf'
  : /^image\/(png|jpeg|gif|webp|bmp|avif)$/.test(m) ? 'imagen'
    : m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? 'word'
      : m === 'text/plain' || m === 'text/csv' ? 'texto' : /^video\/(mp4|webm|ogg)$/.test(m) ? 'video' : /^audio\//.test(m) ? 'audio' : '');
/** Tipo de vista previa según la extensión del nombre original (o el formato guardado). '' = no se puede ver, solo descargar. */
export const tipoVista = (nombre, mime) => {
  const ext = extension(nombre);
  return Object.keys(VISTA).find((k) => VISTA[k].ext.includes(ext)) || porMime(mime);
};
const mimeVista = (tipo, ext, mime) => VISTA[tipo].mime[ext] || (porMime(mime) === tipo ? mime : '')
  || `${{ imagen: 'image', video: 'video', audio: 'audio', texto: 'text', pdf: 'application' }[tipo]}/${tipo === 'texto' ? 'plain' : ext}`;
const ICONO = { imagen: '🖼️', pdf: '📄', word: '📘', texto: '📝', video: '🎬', audio: '🎵', '': '📎' };
const MAX_TEXTO = 200000; // caracteres que se muestran de un archivo de texto
const leer = (blob, como) => (como === 'texto' && blob.text ? blob.text() : como === 'bytes' && blob.arrayBuffer ? blob.arrayBuffer() : new Promise((ok, mal) => {
  const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => mal(new Error('No se pudo leer el archivo'));
  if (como === 'texto') r.readAsText(blob); else r.readAsArrayBuffer(blob);
}));
/** Word -> HTML (librería cargada solo cuando se abre un .docx). El resultado se muestra en un iframe sandbox: nunca ejecuta código. */
async function wordAHtml(blob) {
  const { default: mammoth } = await import('mammoth');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await leer(blob, 'bytes') });
  return `<!doctype html><meta charset="utf-8"><style>body{font-family:"Source Sans 3",system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 28px;color:#1b2230;line-height:1.5}
img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #d9deea;padding:4px 8px}h1,h2,h3{color:#0b3d91}</style>${value || '<p><i>El documento está vacío.</i></p>'}`;
}

/** Modal que muestra la evidencia dentro de la página. El archivo se pide con el token y se muestra desde memoria. */
export function VisorEvidencia({ sesionId, evidencia: e, alCerrar }) {
  const nombre = e.nombre_original || e.archivo;
  const tipo = tipoVista(nombre, e.mime);
  const ruta = `/sesiones/${sesionId}/evidencias/${e.archivo}`;
  const [estado, setEstado] = useState({ cargando: Boolean(tipo), url: '', texto: '', html: '', error: '' });

  useEffect(() => {
    if (!tipo) return undefined;
    let url = ''; let vivo = true;
    const listo = (d) => vivo && setEstado({ cargando: false, url: '', texto: '', html: '', error: '', ...d });
    obtenerArchivo(ruta).then(async (blob) => {
      if (!vivo) return;
      if (tipo === 'texto') return listo({ texto: String(await leer(blob, 'texto')) });
      if (tipo === 'word') return listo({ html: await wordAHtml(blob) });
      url = URL.createObjectURL(new Blob([blob], { type: mimeVista(tipo, extension(nombre), e.mime) }));
      return listo({ url });
    }).catch((x) => listo({ error: x.message || 'No se pudo abrir el archivo' }));
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [ruta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tecla = (ev) => ev.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar]);

  const bajar = () => descargar(ruta, nombre).catch((x) => setEstado((s) => ({ ...s, error: x.message })));
  const { cargando, url, texto, html, error } = estado;
  return (
    <div className="modal-fondo" onClick={(ev) => ev.target === ev.currentTarget && alCerrar()}>
      <div className="modal visor" role="dialog" aria-modal="true" aria-label={`Vista previa de ${nombre}`}>
        <div className="visor-cab">
          <b title={nombre}>{ICONO[tipo]} {nombre}</b>
          <span>
            {url && ['pdf', 'imagen', 'video'].includes(tipo) && <a className="boton sec" href={url} target="_blank" rel="noopener noreferrer">↗ Abrir en otra pestaña</a>}
            <button className="sec" onClick={bajar}>⬇ Descargar</button>
            <button className="sec" aria-label="Cerrar vista previa" onClick={alCerrar}>✕</button>
          </span>
        </div>
        <div className={'visor-cuerpo visor-' + (tipo || 'otro')}>
          {cargando && <div className="visor-cargando"><span className="girando" aria-hidden="true" /> Abriendo archivo…</div>}
          {error && <div className="visor-nada"><span>⚠️</span><p><b>No se pudo mostrar el archivo.</b></p><p className="gris">{error}</p><button onClick={bajar}>⬇ Intentar descargarlo</button></div>}
          {!tipo && <div className="visor-nada"><span>📎</span><p>Este tipo de archivo (<b>.{extension(nombre) || '?'}</b>) no se puede ver en la página.</p>
            <p className="gris">Descárguelo para abrirlo con el programa correspondiente (Excel, PowerPoint, Word antiguo .doc…).</p>
            <button onClick={bajar}>⬇ Descargar archivo</button></div>}
          {url && tipo === 'imagen' && <img src={url} alt={nombre} />}
          {url && tipo === 'pdf' && <object data={url} type="application/pdf" aria-label={nombre}>
            <div className="visor-nada"><span>📄</span><p>Su navegador no muestra PDF dentro de la página.</p>
              <a className="boton" href={url} target="_blank" rel="noopener noreferrer">↗ Abrir el PDF en otra pestaña</a></div></object>}
          {url && tipo === 'video' && <video src={url} controls />}
          {url && tipo === 'audio' && <audio src={url} controls />}
          {html && <iframe className="visor-word" sandbox="" srcDoc={html} title={nombre} />}
          {tipo === 'texto' && !cargando && !error && <pre>{texto.slice(0, MAX_TEXTO)}{texto.length > MAX_TEXTO && '\n…(archivo recortado; descárguelo para verlo completo)'}</pre>}
        </div>
      </div>
    </div>
  );
}

/**
 * Evidencias de una sesión: al pulsar el nombre se ABRE la vista previa en la página; el botón ⬇ la descarga.
 * El servidor verifica que quien la pide tenga relación con la sesión. La usan estudiante, tutor, docente y director.
 */
export function Evidencias({ sesion, alError }) {
  const [abierta, setAbierta] = useState(null);
  const lista = sesion.evidencias || [];
  if (!lista.length) return <span className="gris">Sin evidencias</span>;
  const bajar = (e) => descargar(`/sesiones/${sesion._id}/evidencias/${e.archivo}`, e.nombre_original || e.archivo).catch((x) => alError?.(x.message));
  return (
    <>
      <ul className="evidencias-lista">
        {lista.map((e) => {
          const nombre = e.nombre_original || e.archivo;
          return (
            <li key={e.archivo}>
              <button type="button" className="link" aria-label={`Ver ${nombre}`} title={tipoVista(nombre, e.mime) ? 'Ver en la página' : 'Este formato solo se puede descargar'} onClick={() => setAbierta(e)}>{ICONO[tipoVista(nombre, e.mime)]} {nombre}</button>
              <button type="button" className="link evidencia-bajar" aria-label={`Descargar ${nombre}`} title="Descargar" onClick={() => bajar(e)}>⬇</button>
            </li>
          );
        })}
      </ul>
      {abierta && <VisorEvidencia sesionId={sesion._id} evidencia={abierta} alCerrar={() => setAbierta(null)} />}
    </>
  );
}
