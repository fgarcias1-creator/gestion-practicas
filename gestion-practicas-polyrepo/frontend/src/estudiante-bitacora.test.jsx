import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Estudiante from './pages/Estudiante.jsx';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
const ASG = { id: 5, estudiante_id: 1, estado: 'en_curso', institucion: 'Clínica Santa Ana', tutor: 'Tomás', docente: 'Diana', fecha_inicio_practica: '2026-01-10' };
const BIT = {
  estudiante_id: 1, estado_general: 'en_curso', horas_acumuladas: 0, horas_requeridas: 240, calificacion: null, asignacion: ASG,
  sesiones: [
    { _id: 'b1', fecha_sesion: '2026-02-01T00:00:00.000Z', horas: 2, resumen_actividades: 'Borrador de prueba', estado_validacion: 'borrador', evidencias: [{ archivo: 'x.zip', nombre_original: 'informe.zip' }], calificacion: null },
    { _id: 'p1', fecha_sesion: '2026-02-02T00:00:00.000Z', horas: 3, resumen_actividades: 'Sesión ya enviada', estado_validacion: 'pendiente', evidencias: [], calificacion: null },
  ],
};

function simular() {
  const llamadas = [];
  global.fetch = vi.fn((url, opts = {}) => {
    const m = opts.method || 'GET'; llamadas.push({ m, url, body: opts.body });
    if (url.endsWith('/solicitudes/mia')) return json({ estado_solicitud: 'asignado', etiqueta: 'Asignado', requisitos: { practica: 'Práctica Pedagógica', semestre_ejecucion: 8, periodo: '2026-II', items: [], cumple: true, faltantes: [] } });
    if (url.endsWith('/asignaciones/mia')) return json(ASG);
    if (m === 'GET' && url.endsWith('/bitacora/1')) return json(BIT);
    if (m === 'PUT' && url.endsWith('/sesiones/b1')) return json({ _id: 'b1' });
    return json({ error: 'sin simular ' + m + ' ' + url }, 404);
  });
  return llamadas;
}
const montar = () => render(<MemoryRouter initialEntries={['/seguimiento']}><Estudiante usuario={{ perfil_id: 1 }} /></MemoryRouter>);

test('Evidencias: el selector de archivos acepta cualquier formato (sin restricción de tipo)', async () => {
  simular();
  const { container } = montar();
  await screen.findByRole('heading', { name: 'Registrar sesión' });
  const archivo = container.querySelector('input[type=file]');
  expect(archivo).toBeTruthy();
  expect(archivo.hasAttribute('accept')).toBe(false);
  expect(screen.getByText(/cualquier formato/)).toBeTruthy();
});

test('Borrador: el estudiante lo vuelve a editar, quita una evidencia y lo envía al tutor', async () => {
  const llamadas = simular();
  montar();
  await screen.findByText('Borrador de prueba');
  const fila = screen.getByText('Borrador de prueba').closest('tr');
  expect(within(fila).getByRole('button', { name: 'Editar' })).toBeTruthy();
  expect(within(screen.getByText('Sesión ya enviada').closest('tr')).queryByRole('button', { name: 'Editar' })).toBeNull();   // una sesión enviada no se edita

  await userEvent.click(within(fila).getByRole('button', { name: 'Editar' }));
  await screen.findByRole('heading', { name: 'Editar borrador' });
  const resumen = screen.getByDisplayValue('Borrador de prueba');
  await userEvent.type(resumen, ' y ampliado');
  await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Guardar y enviar al tutor' }));

  await waitFor(() => expect(llamadas.some((l) => l.m === 'PUT' && l.url.endsWith('/sesiones/b1'))).toBe(true));
  const cuerpo = llamadas.find((l) => l.m === 'PUT').body;
  expect(cuerpo.get('enviar')).toBe('true');
  expect(cuerpo.get('resumen_actividades')).toBe('Borrador de prueba y ampliado');
  expect(JSON.parse(cuerpo.get('quitar'))).toEqual(['x.zip']);
});

test('Filtros (estudiante): la bitácora se filtra por estado', async () => {
  simular();
  montar();
  await screen.findByText('Borrador de prueba');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'borrador');
  expect(screen.queryByText('Sesión ya enviada')).toBeNull();
  expect(screen.getByText('Borrador de prueba')).toBeTruthy();
});
