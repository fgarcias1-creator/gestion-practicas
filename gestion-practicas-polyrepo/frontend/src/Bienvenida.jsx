import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Ilustracion from './Ilustracion.jsx';

/** Qué hace cada rol, en una frase. Se muestra en la bienvenida. */
const RESUMEN = {
  estudiante: 'Desde aquí solicita su práctica y, una vez asignada, registra sus sesiones y consulta su avance.',
  tutor: 'Desde aquí valida las sesiones de sus estudiantes y evalúa su desempeño en la institución.',
  docente: 'Desde aquí califica las sesiones de sus estudiantes, consulta su bitácora y publica la nota final.',
  director: 'Desde aquí atiende las solicitudes, asigna institución, tutor y docente y consulta el seguimiento y los reportes.',
  administrador: 'Desde aquí gestiona los usuarios, las instituciones con sus convenios y los programas académicos.',
};

const saludo = (h = new Date().getHours()) => (h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches');
const clave = (u) => `bienvenida_oculta_${u.id ?? u.email ?? u.nombre}`;

// localStorage puede no estar disponible (modo privado, almacenamiento bloqueado): la bienvenida funciona igual sin él.
const leer = (k, almacen) => { try { return almacen.getItem(k); } catch { return null; } };
const escribir = (k, v, almacen) => { try { almacen.setItem(k, v); } catch { /* sin almacenamiento */ } };

/**
 * Bienvenida al arrancar el dashboard: aparece una vez por inicio de sesión (la marca vive en sessionStorage, que se borra al salir).
 * Saluda por nombre, explica en una frase qué hace el rol y ofrece accesos directos a las opciones del menú.
 * «No volver a mostrar» la oculta para ese usuario en este navegador.
 */
export default function Bienvenida({ usuario, menu = [] }) {
  const nav = useNavigate();
  const [visible, setVisible] = useState(() => !leer('bienvenida_vista', sessionStorage) && leer(clave(usuario), localStorage) !== '1');
  const [noMostrar, setNoMostrar] = useState(false);
  if (!visible) return null;

  const cerrar = (ruta) => {
    escribir('bienvenida_vista', '1', sessionStorage);
    if (noMostrar) escribir(clave(usuario), '1', localStorage);
    setVisible(false);
    if (ruta) nav('/' + ruta);
  };
  const nombre = String(usuario.nombre || '').split(' ')[0];

  return (
    <div className="modal-fondo" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="modal bienvenida" role="dialog" aria-modal="true" aria-labelledby="bienvenida-titulo">
        <Ilustracion tipo="bienvenida" className="bienvenida-arte" />
        <p className="bienvenida-rol">{usuario.rol}</p>
        <h3 id="bienvenida-titulo">{saludo()}, {nombre} 👋</h3>
        <p>{RESUMEN[usuario.rol] || 'Bienvenido al sistema de Gestión de Prácticas Académicas.'}</p>
        {menu.length > 0 && <>
          <p className="gris">¿Por dónde quiere empezar?</p>
          <div className="atajos">
            {menu.map((m) => (
              <button key={m.ruta} type="button" className="atajo" disabled={m.deshabilitada} title={m.deshabilitada ? m.motivo : undefined} onClick={() => cerrar(m.ruta)}>
                <span className="icono" aria-hidden="true">{m.deshabilitada ? '🔒' : m.icono}</span>
                <span>{m.etiqueta}{m.deshabilitada && m.motivo && <small>{m.motivo}</small>}</span>
              </button>
            ))}
          </div>
        </>}
        <div className="modal-acciones bienvenida-pie">
          <label className="check"><input type="checkbox" checked={noMostrar} onChange={(e) => setNoMostrar(e.target.checked)} /> No volver a mostrar</label>
          <button onClick={() => cerrar()}>Empezar</button>
        </div>
      </div>
    </div>
  );
}
