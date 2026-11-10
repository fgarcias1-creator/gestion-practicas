/**
 * Cliente del API Gateway. Adjunta el JWT guardado al iniciar sesión.
 * Si el servidor responde 401 (token vencido) cierra la sesión.
 */
const BASE = '/api/v1';

export const sesion = {
  guardar: (token, usuario) => { sessionStorage.setItem('token', token); sessionStorage.setItem('usuario', JSON.stringify(usuario)); },
  usuario: () => JSON.parse(sessionStorage.getItem('usuario') || 'null'),
  token: () => sessionStorage.getItem('token'),
  cerrar: () => sessionStorage.clear(),
};

async function pedir(ruta, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (sesion.token()) headers.Authorization = `Bearer ${sesion.token()}`;
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(BASE + ruta, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  } catch {
    // Astah, excepción E1: fallo de red/conexión
    throw new Error('Error de conexión: no se pudo comunicar con el servidor. Verifique su red e intente nuevamente.');
  }
  if (res.status === 401 && ruta !== '/auth/login') { sesion.cerrar(); window.location.href = '/login'; }
  return res;
}

/** Devuelve el JSON o lanza Error con el mensaje del servidor (y el detalle si existe). */
export async function api(ruta, opts) {
  const res = await pedir(ruta, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detalle = Array.isArray(data?.detalle) ? ': ' + data.detalle.map((d) => (d.campo ? d.campo + ' - ' + d.mensaje : d.mensaje || d)).join('; ') : '';
    throw new Error((data?.error || 'Error inesperado') + detalle);
  }
  return data;
}

/** Trae un archivo protegido como Blob (con el token), sin descargarlo. Lo usa la vista previa de evidencias. */
export async function obtenerArchivo(ruta) {
  const res = await pedir(ruta);
  if (!res.ok) throw new Error('No se pudo abrir el archivo');
  return res.blob();
}

/** Descarga un archivo protegido (CSV, evidencias) enviando el token. */
export async function descargar(ruta, nombre) {
  const res = await pedir(ruta);
  if (!res.ok) throw new Error('No se pudo descargar el archivo');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  a.click(); URL.revokeObjectURL(url);
}
