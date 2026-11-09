import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Docente from './pages/Docente.jsx';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
const ASIG = [{ id: 1, estudiante_id: 3, estudiante: 'Sara En-Curso', institucion: 'Clínica Santa Ana', tutor: 'Tomás Tutor', estado: 'evaluado' }];
const SESIONES = [
  { _id: 's1', fecha_sesion: '2026-10-20T00:00:00Z', horas: 3, resumen_actividades: 'Soporte a usuarios', observacion_tutor: 'Buen trabajo en sitio',
    evidencias: [{ archivo: 'f1.pdf', nombre_original: 'informe_semana1.pdf' }] },
  { _id: 's2', fecha_sesion: '2026-10-22T00:00:00Z', horas: 2, resumen_actividades: 'Documentación' },
];
const BITACORA = { estudiante_id: 3, estado_general: 'en_curso', horas_acumuladas: 5, horas_requeridas: 160, calificacion: null,
  asignacion: { estudiante: 'Sara En-Curso', institucion: 'Clínica Santa Ana', programa: 'Ingeniería de Sistemas', tutor: 'Tomás Tutor', docente: 'Diana Docente', fecha_inicio_practica: '2026-10-01' },
  sesiones: [{ _id: 's1', fecha_sesion: '2026-10-20T00:00:00Z', horas: 3, resumen_actividades: 'Soporte a usuarios', estado_validacion: 'validada_tutor', calificacion: null,
    evidencias: [{ archivo: 'f1.pdf', nombre_original: 'informe_semana1.pdf' }] }] };

/** Simula el Servicio de Evaluación con estado: guarda notas, calcula el resumen y publica. */
function simular() {
  const llamadas = [];
  const est = { asignacion: ASIG[0], evaluaciones: [{ id: 1, disposicion: 5, cumplimiento: 5, observaciones: 'Excelente' }], sesiones: SESIONES, notas_sesion: [],
    resumen: { total: 2, calificadas: 0, promedio: null, completo: false, faltan: 2 }, vigente: null, historial: [] };
  const recalcular = () => {
    const n = est.notas_sesion.length;
    est.resumen = { total: 2, calificadas: n, promedio: n ? Math.round((est.notas_sesion.reduce((t, x) => t + x.nota, 0) / n) * 10) / 10 : null, completo: n === 2, faltan: 2 - n };
  };
  global.fetch = vi.fn((url, opts = {}) => {
    const m = opts.method || 'GET'; const body = opts.body ? JSON.parse(opts.body) : undefined; llamadas.push({ m, url, body });
    if (m === 'GET' && url.endsWith('/asignaciones')) return json(ASIG);
    if (m === 'GET' && url.endsWith('/evaluaciones/1')) return json(est);
    if (m === 'GET' && url.endsWith('/bitacora/3')) return json(BITACORA);
    if (m === 'GET' && url.endsWith('/sesiones/s1/evidencias/f1.pdf')) return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['%PDF'])) });
    if (m === 'GET' && url.endsWith('/bitacora/3/pdf')) return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['%PDF-1.4'])) });
    if (m === 'POST' && url.endsWith('/calificaciones/sesiones')) {
      est.notas_sesion = [...est.notas_sesion.filter((x) => x.sesion_id !== body.sesion_id), { sesion_id: body.sesion_id, nota: body.nota, retroalimentacion: body.retroalimentacion }];
      recalcular(); return json({ calificacion_sesion: {} }, 201);
    }
    if (m === 'POST' && url.endsWith('/calificaciones')) {
      est.vigente = { id: 9, nota: est.resumen.promedio, retroalimentacion: body.retroalimentacion }; est.historial = [est.vigente]; return json(est.vigente, 201);
    }
    return json({ error: 'sin simular ' + m + ' ' + url }, 404);
  });
  return llamadas;
}

test('RF06: se califica cada sesión, la nota final es el promedio y solo se publica con todas calificadas', async () => {
  const llamadas = simular();
  render(<Docente />);
  await userEvent.click(await screen.findByRole('button', { name: 'Calificar' }));
  expect(await screen.findByText('Calificar sesiones (0 de 2)')).toBeTruthy();
  const publicar = () => screen.getByRole('button', { name: 'Confirmar y publicar nota final' });
  expect(publicar().disabled).toBe(true);
  expect(screen.getByText(/Faltan 2 sesión\(es\) por calificar/)).toBeTruthy();

  await userEvent.type(screen.getByLabelText('Nota de la sesión Soporte a usuarios'), '4');
  await userEvent.type(screen.getByLabelText('Retroalimentación de la sesión Soporte a usuarios'), 'Buen manejo de usuarios');
  await userEvent.click(screen.getAllByRole('button', { name: 'Guardar nota' })[0]);
  expect(await screen.findByText('Calificar sesiones (1 de 2)')).toBeTruthy();
  expect(llamadas.find((l) => l.url.endsWith('/calificaciones/sesiones')).body).toEqual({ asignacion_id: 1, sesion_id: 's1', nota: 4, retroalimentacion: 'Buen manejo de usuarios' });
  expect(publicar().disabled).toBe(true);                                   // todavía falta una sesión

  await userEvent.type(screen.getByLabelText('Nota de la sesión Documentación'), '5');
  await userEvent.type(screen.getByLabelText('Retroalimentación de la sesión Documentación'), 'Excelente documentación');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar nota' }));
  expect(await screen.findByText('Calificar sesiones (2 de 2)')).toBeTruthy();
  expect(screen.getAllByText('4.5').length).toBeGreaterThan(0);              // promedio de 4.0 y 5.0

  await userEvent.type(screen.getByRole('textbox', { name: '' }) , 'Buen desempeño general');
  await waitFor(() => expect(publicar().disabled).toBe(false));
  await userEvent.click(publicar());
  expect(await screen.findByText('Nota final publicada: 4.5')).toBeTruthy();
  expect(llamadas.find((l) => l.m === 'POST' && l.url.endsWith('/calificaciones')).body).toEqual({ asignacion_id: 1, retroalimentacion: 'Buen desempeño general' });
});

test('RF06: después de publicar, cambiar una sesión es una CORRECCIÓN y exige justificación', async () => {
  simular();
  render(<Docente />);
  await userEvent.click(await screen.findByRole('button', { name: 'Calificar' }));
  for (const [s, n] of [['Soporte a usuarios', '4'], ['Documentación', '5']]) {
    await userEvent.type(screen.getByLabelText(`Nota de la sesión ${s}`), n);
    await userEvent.type(screen.getByLabelText(`Retroalimentación de la sesión ${s}`), 'Retroalimentación de prueba');
    await userEvent.click(screen.getAllByRole('button', { name: 'Guardar nota' })[0]);
    await waitFor(() => expect(screen.queryByLabelText(`Nota de la sesión ${s}`)).toBeNull());
  }
  await userEvent.type(screen.getByRole('textbox', { name: '' }), 'Buen desempeño general');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar y publicar nota final' }));
  await screen.findByRole('heading', { name: /Nota final publicada: 4.5/ });
  expect(screen.getByText(/ya está publicada: cambiar la nota de una sesión es una/)).toBeTruthy();
  await userEvent.click(screen.getAllByRole('button', { name: 'Corregir nota' })[0]);
  const guardar = screen.getByRole('button', { name: 'Guardar nueva nota' });
  expect(guardar.disabled).toBe(true);                                      // sin justificación no se puede
  expect(screen.getByText('Justificación de la corrección')).toBeTruthy();
});

test('El docente NO atiende solicitudes: aunque entre a /solicitudes ve «Mis estudiantes» y nunca consulta /solicitudes', async () => {
  const llamadas = simular();
  render(<Docente seccion="solicitudes" />);
  expect(await screen.findByText('Mis estudiantes')).toBeTruthy();
  expect(screen.queryByText(/Solicitudes pendientes/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Rechazar' })).toBeNull();
  expect(llamadas.some((l) => l.url.includes('/solicitudes'))).toBe(false);
});

test('RF05: el docente consulta la bitácora de su estudiante y la descarga en PDF', async () => {
  const llamadas = simular();
  URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn(); HTMLAnchorElement.prototype.click = vi.fn();
  render(<Docente />);
  await userEvent.click(await screen.findByRole('button', { name: 'Ver bitácora' }));
  expect(await screen.findByText('Bitácora de Sara En-Curso')).toBeTruthy();
  expect(screen.getByText(/Soporte a usuarios/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));
  await waitFor(() => expect(llamadas.some((l) => l.url.endsWith('/bitacora/3/pdf'))).toBe(true));
  expect(URL.createObjectURL).toHaveBeenCalled();
});

test('Para calificar, el docente ve y descarga las evidencias que subió el estudiante (también en la bitácora)', async () => {
  const llamadas = simular();
  URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn(); HTMLAnchorElement.prototype.click = vi.fn();
  render(<Docente />);
  await userEvent.click(await screen.findByRole('button', { name: 'Calificar' }));
  await userEvent.click(await screen.findByRole('button', { name: /informe_semana1\.pdf/ }));
  await waitFor(() => expect(llamadas.some((l) => l.url.endsWith('/sesiones/s1/evidencias/f1.pdf'))).toBe(true));
  expect(screen.getByText(/Observación del tutor: Buen trabajo en sitio/)).toBeTruthy();
  expect(screen.getByText('Sin evidencias')).toBeTruthy();                        // la sesión s2 no trae archivos
  await userEvent.click(screen.getByRole('button', { name: 'Ver bitácora' }));
  expect(await screen.findByText('Bitácora de Sara En-Curso')).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Evidencias' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /informe_semana1\.pdf/ })).toBeTruthy();
});
