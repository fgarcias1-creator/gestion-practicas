import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout.jsx';
import { MENU } from './menu.js';

const json = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
const etiquetas = (rol) => MENU[rol].map((m) => m.etiqueta);

test('Cada rol tiene su barra lateral con sus propias funciones', () => {
  expect(etiquetas('administrador')).toEqual(['Usuarios', 'Instituciones', 'Programas']);
  expect(etiquetas('director')).toEqual(['Solicitudes', 'Asignaciones', 'Seguimiento', 'Instituciones', 'Reportes']);
  expect(etiquetas('docente')).toEqual(['Mis estudiantes']);                 // el docente ya no atiende solicitudes
  expect(etiquetas('tutor')).toEqual(['Mis estudiantes']);
  expect(etiquetas('estudiante')).toEqual(['Solicitar práctica', 'Consultar seguimiento']);
});

test('Permisos en el menú: solo el administrador gestiona usuarios y programas; nadie tiene Auditoría', () => {
  for (const rol of Object.keys(MENU)) {
    expect(etiquetas(rol)).not.toContain('Auditoría');
    if (rol !== 'administrador') { expect(etiquetas(rol)).not.toContain('Usuarios'); expect(etiquetas(rol)).not.toContain('Programas'); }
  }
});

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
const conBienvenidaVista = () => sessionStorage.setItem('bienvenida_vista', '1');

test('Layout dibuja la barra lateral con un enlace por opción y marca la activa', () => {
  global.fetch = () => json({ items: [], no_leidas: 0 });
  conBienvenidaVista();
  render(<MemoryRouter initialEntries={['/programas']}><Layout usuario={{ nombre: 'Sandra', rol: 'administrador' }} menu={MENU.administrador}><div /></Layout></MemoryRouter>);
  const nav = screen.getByRole('navigation', { name: 'Menú principal' });
  expect(within(nav).getAllByRole('link')).toHaveLength(3);
  expect(within(nav).getByRole('link', { name: /Programas/ }).className).toBe('activa');
  expect(within(nav).getByRole('link', { name: /Usuarios/ }).className).toBe('');
});

test('Estudiante con práctica asignada: «Solicitar práctica» aparece inhabilitada (no es enlace) y «Consultar seguimiento» sigue activa', () => {
  global.fetch = () => json({ items: [], no_leidas: 0 });
  conBienvenidaVista();
  const menu = MENU.estudiante.map((m) => (m.ruta === 'solicitud' ? { ...m, deshabilitada: true, motivo: 'Ya tiene una práctica asignada' } : m));
  render(<MemoryRouter initialEntries={['/seguimiento']}><Layout usuario={{ nombre: 'Ana', rol: 'estudiante' }} menu={menu}><div /></Layout></MemoryRouter>);
  const nav = screen.getByRole('navigation', { name: 'Menú principal' });
  expect(within(nav).getAllByRole('link')).toHaveLength(1);
  expect(within(nav).queryByRole('link', { name: /Solicitar práctica/ })).toBeNull();
  const opcion = within(nav).getByText('Solicitar práctica');
  expect(opcion.getAttribute('aria-disabled')).toBe('true');
  expect(opcion.getAttribute('title')).toBe('Ya tiene una práctica asignada');
});

test('Bienvenida: al arrancar el dashboard saluda por nombre, ofrece accesos directos y no vuelve a salir en la misma sesión', async () => {
  global.fetch = () => json({ items: [], no_leidas: 0 });
  const montar = () => render(<MemoryRouter initialEntries={['/usuarios']}><Routes><Route path="/*" element={
    <Layout usuario={{ id: 7, nombre: 'Sandra Gómez', rol: 'administrador' }} menu={MENU.administrador}><div /></Layout>} /></Routes></MemoryRouter>);
  const { unmount } = montar();
  const dialogo = screen.getByRole('dialog', { name: /Sandra/ });
  expect(within(dialogo).getByText(/usuarios, las instituciones/)).toBeTruthy();
  await userEvent.click(within(dialogo).getByRole('button', { name: /Programas/ }));   // el atajo navega y cierra
  expect(screen.queryByRole('dialog', { name: /Sandra/ })).toBeNull();
  expect(screen.getByRole('link', { name: /Programas/ }).className).toBe('activa');
  unmount(); montar();
  expect(screen.queryByRole('dialog', { name: /Sandra/ })).toBeNull();                 // ya se vio en esta sesión
});

test('Bienvenida: «No volver a mostrar» la oculta para ese usuario aun en una sesión nueva; los atajos inhabilitados no se pueden pulsar', async () => {
  global.fetch = () => json({ items: [], no_leidas: 0 });
  const menu = MENU.estudiante.map((m) => (m.ruta === 'solicitud' ? { ...m, deshabilitada: true, motivo: 'Ya tiene una práctica asignada' } : m));
  const montar = () => render(<MemoryRouter><Layout usuario={{ id: 9, nombre: 'Ana Ruiz', rol: 'estudiante' }} menu={menu}><div /></Layout></MemoryRouter>);
  const { unmount } = montar();
  const dialogo = screen.getByRole('dialog', { name: /Ana/ });
  expect(within(dialogo).getByRole('button', { name: /Solicitar práctica/ }).disabled).toBe(true);
  expect(within(dialogo).getByRole('button', { name: /Consultar seguimiento/ }).disabled).toBe(false);
  await userEvent.click(within(dialogo).getByRole('checkbox', { name: /No volver a mostrar/ }));
  await userEvent.click(within(dialogo).getByRole('button', { name: 'Empezar' }));
  unmount(); sessionStorage.clear(); montar();                                          // nuevo inicio de sesión
  expect(screen.queryByRole('dialog', { name: /Ana/ })).toBeNull();
});
