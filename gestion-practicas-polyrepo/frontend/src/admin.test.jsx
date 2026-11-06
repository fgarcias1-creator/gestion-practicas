import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Administrador from './pages/Administrador.jsx';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
const YO = { id: 1, nombre: 'Sandra Sistemas', rol: 'administrador' };
const USUARIOS = [
  { id: 1, nombre_completo: 'Sandra Sistemas', email: 'admin@udi.edu.co', rol: 'administrador', estado: 'activo', fecha_creacion: '2026-01-01' },
  { id: 2, nombre_completo: 'Carlos Director', email: 'director@udi.edu.co', rol: 'director', estado: 'activo', fecha_creacion: '2026-01-01' },
];
const PROGRAMAS = [
  { id: 1, nombre: 'Ingeniería de Sistemas', facultad: 'Facultad de Ingenierías', creditos_totales: 160, semestre_minimo: 7, porcentaje_minimo: 70, horas_practica: 160, nombre_practica: 'Práctica Profesional' },
  { id: 2, nombre: 'Licenciatura en Matemáticas', facultad: 'Facultad de Educación', creditos_totales: 160, semestre_minimo: 7, porcentaje_minimo: 70, horas_practica: 240, nombre_practica: 'Práctica Pedagógica' },
];

function simular(extra = {}) {
  const llamadas = [];
  global.fetch = vi.fn((url, opts = {}) => {
    const m = opts.method || 'GET'; llamadas.push({ m, url, body: opts.body });
    if (extra[`${m} ${url}`]) return extra[`${m} ${url}`](opts);
    if (m === 'GET' && url.endsWith('/usuarios')) return json(USUARIOS);
    if (m === 'GET' && url.endsWith('/instituciones')) return json([]);
    if (m === 'GET' && url.endsWith('/programas')) return json(PROGRAMAS);
    if (m === 'POST' && url.endsWith('/instituciones')) return json({ id: 9 }, 201);
    if (m === 'POST' && url.endsWith('/programas')) return json({ id: 9 }, 201);
    return json({ error: 'sin simular ' + m + ' ' + url }, 404);
  });
  return llamadas;
}

test('Usuarios: se puede elegir el rol Administrador y el estudiante se valida contra el plan del programa', async () => {
  const llamadas = simular();
  render(<Administrador usuario={YO} />);
  await screen.findByRole('heading', { name: 'Crear usuario' });
  const [selRol] = screen.getAllByRole('combobox');
  expect(within(selRol).getAllByRole('option').map((o) => o.value)).toEqual(['estudiante', 'tutor', 'docente', 'director', 'administrador']);
  const [nombre, correo, clave, codigo] = screen.getAllByRole('textbox');
  await userEvent.type(nombre, 'Maria Tarazona'); await userEvent.type(correo, 'maria@udi.edu.co'); await userEvent.type(clave, 'Clave12345'); await userEvent.type(codigo, 'U777');
  await userEvent.selectOptions(screen.getAllByRole('combobox')[1], '1');
  const [semestre, creditos] = screen.getAllByRole('spinbutton');
  await userEvent.clear(semestre); await userEvent.type(semestre, '8');
  await userEvent.clear(creditos); await userEvent.type(creditos, '131');
  expect(await screen.findByText(/= 81.9% del plan/)).toBeTruthy();
  await userEvent.clear(creditos); await userEvent.type(creditos, '200');
  await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
  expect((await screen.findAllByText(/Los créditos aprobados deben estar entre 0 y 160/)).length).toBeGreaterThan(0);
  expect(llamadas.some((l) => l.m === 'POST')).toBe(false);
});

test('Usuarios: puede desactivar a otro usuario, pero no su propia cuenta', async () => {
  const llamadas = simular({ 'PATCH /api/v1/usuarios/2/estado': () => json({ id: 2, estado: 'inactivo' }) });
  window.confirm = vi.fn(() => true);
  render(<Administrador usuario={YO} />);
  await screen.findByText('Carlos Director');
  expect(screen.getByText('Su cuenta')).toBeTruthy();                                   // sin botones para sí mismo
  expect(screen.getAllByRole('button', { name: 'Desactivar' })).toHaveLength(1);        // solo el del director
  await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
  await waitFor(() => expect(llamadas.some((l) => l.m === 'PATCH' && l.url.endsWith('/usuarios/2/estado'))).toBe(true));
  expect(JSON.parse(llamadas.find((l) => l.m === 'PATCH').body)).toEqual({ estado: 'inactivo' });
});

test('Instituciones: el administrador crea instituciones y convenios', async () => {
  const llamadas = simular();
  render(<Administrador usuario={YO} seccion="instituciones" />);
  await screen.findByRole('heading', { name: 'Nueva institución' });
  expect(screen.getByRole('button', { name: 'Crear convenio' })).toBeTruthy();
  const [nit, razon] = screen.getAllByRole('textbox');
  await userEvent.type(nit, '900123456'); await userEvent.type(razon, 'Hospital Universitario');
  await userEvent.click(screen.getByRole('button', { name: 'Crear' }));
  await waitFor(() => expect(llamadas.some((l) => l.m === 'POST' && l.url.endsWith('/instituciones'))).toBe(true));
  expect(JSON.parse(llamadas.find((l) => l.m === 'POST').body)).toMatchObject({ nit: '900123456', nombre: 'Hospital Universitario' });
});

test('Programas: aparecen las licenciaturas y el administrador crea una carrera nueva con su tipo de práctica', async () => {
  const llamadas = simular();
  render(<Administrador usuario={YO} seccion="programas" />);
  expect(await screen.findByText('Licenciatura en Matemáticas')).toBeTruthy();
  expect(screen.getByText('Práctica Pedagógica')).toBeTruthy();
  await userEvent.type(screen.getByPlaceholderText(/Licenciatura en Educación Física/), 'Licenciatura en Educación Física');
  await userEvent.type(screen.getByPlaceholderText(/Facultad de Educación/), 'Facultad de Educación');
  await userEvent.clear(screen.getByPlaceholderText(/Práctica Pedagógica/)); await userEvent.type(screen.getByPlaceholderText(/Práctica Pedagógica/), 'Práctica Pedagógica');
  await userEvent.click(screen.getByRole('button', { name: 'Crear programa' }));
  await waitFor(() => expect(llamadas.some((l) => l.m === 'POST' && l.url.endsWith('/programas'))).toBe(true));
  expect(JSON.parse(llamadas.find((l) => l.m === 'POST').body)).toMatchObject({ nombre: 'Licenciatura en Educación Física', facultad: 'Facultad de Educación', nombre_practica: 'Práctica Pedagógica', horas_practica: 240 });
});

test('Filtros (administrador): en Usuarios se busca por nombre o correo y se filtra por rol', async () => {
  simular();
  render(<Administrador usuario={YO} />);
  await screen.findByText('Carlos Director');
  expect(screen.getByText(/Mostrando 2 de 2/)).toBeTruthy();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rol' }), 'director');
  expect(screen.queryByText('admin@udi.edu.co')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'SANDRA');
  expect(screen.getByText('admin@udi.edu.co')).toBeTruthy();
  expect(screen.queryByText('director@udi.edu.co')).toBeNull();
});

test('Filtros (administrador): en Programas se filtra por texto (licenciaturas)', async () => {
  simular();
  render(<Administrador usuario={YO} seccion="programas" />);
  await screen.findByText('Licenciatura en Matemáticas');
  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'licenciatura');
  expect(screen.queryByText('Ingeniería de Sistemas')).toBeNull();
  expect(screen.getByText('Licenciatura en Matemáticas')).toBeTruthy();
});
