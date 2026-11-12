import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Tutor from './pages/Tutor.jsx';

const json = (d, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(d) });
const ASIG = [{ id: 7, estudiante: 'Elena Estudiante', institucion: 'Clínica Santa Ana', estado: 'en_curso' }];

function simular({ evaluaciones = [] } = {}) {
  const llamadas = [];
  global.fetch = vi.fn((url, opts = {}) => {
    const m = opts.method || 'GET';
    llamadas.push({ m, url, body: opts.body && JSON.parse(opts.body) });
    if (m === 'GET' && url.endsWith('/asignaciones')) return json(ASIG);
    if (m === 'GET' && url.includes('/sesiones?asignacion_id=7')) return json([]);
    if (m === 'GET' && url.endsWith('/evaluaciones/7')) return json({ evaluaciones });
    if (m === 'POST' && url.endsWith('/evaluaciones')) return json({ id: 1, asignacion_id: 7, disposicion: 4, cumplimiento: 5, observaciones: 'Muy puntual', fecha_evaluacion: '2026-11-09T15:00:00Z' }, 201);
    return json({}, 404);
  });
  return llamadas;
}

test('Al registrar la evaluación, el formulario desaparece y queda guardada en solo lectura (sin opción de editar)', async () => {
  const llamadas = simular();
  render(<Tutor />);
  await userEvent.click(await screen.findByRole('button', { name: 'Ver sesiones' }));
  const obs = await screen.findByPlaceholderText(/Fortalezas/);
  await userEvent.selectOptions(screen.getAllByRole('combobox').at(-2), '4');
  await userEvent.type(obs, 'Muy puntual');
  await userEvent.click(screen.getByRole('button', { name: 'Registrar evaluación' }));
  expect(await screen.findByText('✔ Evaluación registrada y guardada.')).toBeTruthy();
  expect(llamadas.find((l) => l.m === 'POST').body).toMatchObject({ asignacion_id: 7, disposicion: 4, cumplimiento: 5, observaciones: 'Muy puntual' });
  expect(screen.queryByRole('button', { name: 'Registrar evaluación' })).toBeNull();
  expect(screen.queryByPlaceholderText(/Fortalezas/)).toBeNull();
  expect(screen.getByText('🔒 Registrada · no editable')).toBeTruthy();
  expect(screen.getByText('Muy puntual')).toBeTruthy();
});

test('Si la evaluación ya existía, al abrir el estudiante se muestra guardada y no aparece el formulario', async () => {
  simular({ evaluaciones: [{ id: 1, disposicion: 3, cumplimiento: 4, observaciones: 'Debe mejorar la puntualidad', fecha_evaluacion: '2026-11-01T10:00:00Z' }] });
  render(<Tutor />);
  await userEvent.click(await screen.findByRole('button', { name: 'Ver sesiones' }));
  expect(await screen.findByText('Debe mejorar la puntualidad')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Registrar evaluación' })).toBeNull();
  expect(within(screen.getByText('Disposición').parentElement).getByLabelText('3 de 5')).toBeTruthy();
});
