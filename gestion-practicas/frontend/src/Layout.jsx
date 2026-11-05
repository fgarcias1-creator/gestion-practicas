import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api, sesion } from './api.js';
import { fecha } from './ui.jsx';

/** Campana de notificaciones (asignación, sesiones validadas, calificación…). Se refresca cada 30 s. */
function Campana() {
  const [datos, setDatos] = useState({ items: [], no_leidas: 0 });
  const [abierta, setAbierta] = useState(false);
  const cargar = () => api('/notificaciones').then(setDatos).catch(() => {});
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, []);
  const abrir = async (n) => { if (!n.leida) { await api(`/notificaciones/${n._id}/leida`, { method: 'PATCH' }).catch(() => {}); cargar(); } };
  const todas = async () => { await api('/notificaciones/leidas', { method: 'PATCH' }).catch(() => {}); cargar(); };
  return (
    <span className="campana">
      <button className="link" aria-label="Notificaciones" onClick={() => { setAbierta(!abierta); cargar(); }}>
        🔔{datos.no_leidas > 0 && <b className="contador">{datos.no_leidas}</b>}
      </button>
      {abierta && (
        <div className="panel-notif" role="dialog" aria-label="Notificaciones">
          <div className="panel-notif-cab"><b>Notificaciones</b>{datos.no_leidas > 0 && <button className="link" onClick={todas}>Marcar todas como leídas</button>}</div>
          {datos.items.length === 0 && <p className="gris" style={{ padding: '.8rem' }}>No tiene notificaciones.</p>}
          {datos.items.map((n) => (
            <div key={n._id} className={'notif' + (n.leida ? '' : ' nueva')} onClick={() => abrir(n)}>
              <b>{n.titulo}</b><div>{n.mensaje}</div><small className="gris">{fecha(n.fecha)}</small>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

/**
 * Estructura de la aplicación: encabezado + barra lateral con las funciones del rol + contenido.
 * `menu` = [{ ruta, etiqueta, icono }]. Cada opción es una dirección (/ruta), así que se puede volver con «Atrás» y marcar como favorita.
 */
export default function Layout({ usuario, menu = [], children }) {
  const nav = useNavigate();
  const salir = () => { sesion.cerrar(); nav('/login'); };
  return (
    <>
      <header className="barra">
        <strong>Gestión de Prácticas Académicas</strong>
        <span>{usuario.nombre} · <em>{usuario.rol}</em> <Campana /> <button className="link" onClick={salir}>Salir</button></span>
      </header>
      <div className="app">
        {menu.length > 0 && (
          <aside className="lateral">
            <h2>Menú</h2>
            <nav aria-label="Menú principal">
              {menu.map((m) => (
                <NavLink key={m.ruta} to={'/' + m.ruta} className={({ isActive }) => (isActive ? 'activa' : '')}>
                  <span className="icono" aria-hidden="true">{m.icono}</span>{m.etiqueta}
                </NavLink>
              ))}
            </nav>
          </aside>
        )}
        <main className="principal"><div className="contenedor">{children}</div></main>
      </div>
    </>
  );
}
