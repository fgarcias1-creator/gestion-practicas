import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { sesion } from './api.js';
import Layout from './Layout.jsx';
import { MENU } from './menu.js';
import Login from './pages/Login.jsx';
import Estudiante from './pages/Estudiante.jsx';
import Tutor from './pages/Tutor.jsx';
import Docente from './pages/Docente.jsx';
import Director from './pages/Director.jsx';
import Administrador from './pages/Administrador.jsx';
import './styles.css';

const PANEL = { estudiante: Estudiante, tutor: Tutor, docente: Docente, director: Director, administrador: Administrador };

/** Ruta protegida: sin sesión -> /login. Con sesión muestra el panel del ROL, con su barra lateral. */
function Panel() {
  const u = sesion.usuario();
  const { pathname } = useLocation();
  if (!u) return <Navigate to="/login" replace />;
  const Vista = PANEL[u.rol];
  const menu = MENU[u.rol] || [];
  const seccion = pathname.split('/')[1];
  // El estudiante resuelve sus propias redirecciones (flujo Astah); en los demás roles una dirección desconocida lleva a la primera opción.
  if (u.rol !== 'estudiante' && menu.length && !menu.some((x) => x.ruta === seccion)) return <Navigate to={'/' + menu[0].ruta} replace />;
  return <Layout usuario={u} menu={menu}><Vista usuario={u} seccion={seccion} /></Layout>;
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<Panel />} />
    </Routes>
  </BrowserRouter>
);
