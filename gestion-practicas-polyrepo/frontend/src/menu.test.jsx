import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout.jsx';
import { MENU } from './menu.js';

const json = (data) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
const etiquetas = (rol) => MENU[rol].map((m) => m.etiqueta);

test('Cada rol tiene su barra lateral con sus propias funciones', () => {
  expect(etiquetas('administrador')).toEqual(['Usuarios', 'Instituciones', 'Programas']);
  expect(etiquetas('director')).toEqual(['Solicitudes', 'Asignaciones', 'Seguimiento', 'Instituciones', 'Reportes']);
  expect(etiquetas('docente')).toEqual(['Mis estudiantes', 'Solicitudes']);
  expect(etiquetas('tutor')).toEqual(['Mis estudiantes']);
  expect(etiquetas('estudiante')).toEqual(['Solicitar práctica', 'Consultar seguimiento']);
});

test('Permisos en el menú: solo el administrador gestiona usuarios y programas; nadie tiene Auditoría', () => {
  for (const rol of Object.keys(MENU)) {
    expect(etiquetas(rol)).not.toContain('Auditoría');
    if (rol !== 'administrador') { expect(etiquetas(rol)).not.toContain('Usuarios'); expect(etiquetas(rol)).not.toContain('Programas'); }
  }
});

test('Layout dibuja la barra lateral con un enlace por opción y marca la activa', () => {
  global.fetch = () => json({ items: [], no_leidas: 0 });
  render(<MemoryRouter initialEntries={['/programas']}><Layout usuario={{ nombre: 'Sandra', rol: 'administrador' }} menu={MENU.administrador}><div /></Layout></MemoryRouter>);
  const nav = screen.getByRole('navigation', { name: 'Menú principal' });
  expect(within(nav).getAllByRole('link')).toHaveLength(3);
  expect(within(nav).getByRole('link', { name: /Programas/ }).className).toBe('activa');
  expect(within(nav).getByRole('link', { name: /Usuarios/ }).className).toBe('');
});
