import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Estudiante from './pages/Estudiante.jsx';

const items = (cumple) => [
  { clave: 'semestre', etiqueta: 'Semestre', actual: cumple ? 8 : 5, requerido: 7, unidad: '', cumple },
  { clave: 'creditos', etiqueta: 'Créditos aprobados', actual: cumple ? 81.9 : 45, requerido: 70, unidad: '%', detalle: cumple ? '131 de 160 créditos' : '72 de 160 créditos', cumple },
];
const solicitud = (o = {}) => ({
  estado_solicitud: 'no_solicitado', etiqueta: 'No solicitado', motivo_rechazo: null, puede_enviar: true, bloqueo: null, solicitud: null,
  requisitos: { cumple: true, faltantes: [], items: items(true), programa: 'Ingeniería de Sistemas', facultad: 'Facultad de Ingenierías', horas_practica: 160, practica: 'Práctica Profesional', semestre_ejecucion: 8, periodo: '2026-II' }, ...o,
});
const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });

/** Simula el Gateway. estado = lo que devuelve /solicitudes/mia; post = comportamiento de POST /solicitudes */
function simular({ sol, post }) {
  let actual = sol;
  const llamadas = [];
  global.fetch = vi.fn((url, opts = {}) => {
    llamadas.push(`${opts.method || 'GET'} ${url}`);
    if (url.endsWith('/solicitudes/mia')) return json(actual);
    if (url.endsWith('/asignaciones/mia')) return json({ error: 'Aún no tiene una práctica asignada' }, 404);
    if (url.endsWith('/solicitudes') && opts.method === 'POST') return post(() => { actual = solicitud({ estado_solicitud: 'pendiente', etiqueta: 'Pendiente de asignación', puede_enviar: false, solicitud: { practica: 'Práctica Profesional', semestre: 8, periodo: '2026-II', fecha: '2026-10-28T20:00:00Z' } }); });
    return json({}, 404);
  });
  return llamadas;
}
const montar = (ruta = '/solicitud', bloquearMenu) => render(<MemoryRouter initialEntries={[ruta]}><Estudiante usuario={{ perfil_id: 1 }} bloquearMenu={bloquearMenu} /></MemoryRouter>);

test('Pasos 2-3: muestra ✔ por requisito y campos de solo lectura con práctica, semestre de ejecución y período', async () => {
  simular({ sol: solicitud() });
  montar();
  expect(await screen.findByText('Solicitud de práctica')).toBeTruthy();
  expect(screen.getAllByText('✔')).toHaveLength(2);
  expect(screen.getAllByText(/Cumple/)).toHaveLength(2);
  expect(screen.getByText(/131 de 160 créditos/)).toBeTruthy();                 // créditos reales, no solo un porcentaje
  expect(screen.getByText(/Facultad de Ingenierías/)).toBeTruthy();             // el estudiante ve su programa
  const campos = screen.getAllByRole('textbox');
  expect(campos.map((c) => c.value)).toEqual(['Práctica Profesional', '8', '2026-II']);
  campos.forEach((c) => expect(c.readOnly).toBe(true));
  expect(screen.getByText('No solicitado')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Enviar solicitud' }).disabled).toBe(false);
});

test('Paso 4-5: «Enviar» abre un MODAL; al confirmar registra y REDIRIGE a «Consultar seguimiento» con estado «Pendiente de asignación»', async () => {
  const llamadas = simular({ sol: solicitud(), post: (marcar) => { marcar(); return json({ estado_solicitud: 'pendiente' }, 201); } });
  montar();
  await userEvent.click(await screen.findByRole('button', { name: 'Enviar solicitud' }));
  const modal = await screen.findByRole('dialog');
  expect(within(modal).getByText(/¿Confirma que desea enviar/)).toBeTruthy();
  expect(llamadas.some((l) => l.startsWith('POST'))).toBe(false);        // todavía NO se envió nada
  await userEvent.click(within(modal).getByRole('button', { name: 'Confirmar envío' }));
  expect(await screen.findByText('Estado de mi solicitud')).toBeTruthy();   // redirigido
  expect(screen.getAllByText('Pendiente de asignación').length).toBeGreaterThan(0);
  expect(screen.getByRole('alert').textContent).toMatch(/Solicitud registrada/); // toast
  expect(llamadas.filter((l) => l.startsWith('POST'))).toHaveLength(1);
});

test('Cancelar en el modal no envía nada', async () => {
  const llamadas = simular({ sol: solicitud() });
  montar();
  await userEvent.click(await screen.findByRole('button', { name: 'Enviar solicitud' }));
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(llamadas.some((l) => l.startsWith('POST'))).toBe(false);
});

test('Flujo 1a: con solicitud en trámite, entrar a /solicitud REDIRIGE automáticamente a «Consultar seguimiento»', async () => {
  simular({ sol: solicitud({ estado_solicitud: 'pendiente', etiqueta: 'Pendiente de asignación', puede_enviar: false, solicitud: { practica: 'Práctica Profesional', semestre: 8, periodo: '2026-II', fecha: '2026-10-28T20:00:00Z' } }) });
  montar('/solicitud');
  expect(await screen.findByText('Estado de mi solicitud')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Enviar solicitud' })).toBeNull();
});

test('Flujo 2a: requisitos incumplidos -> alertas en rojo, controles inhabilitados y no se puede enviar', async () => {
  simular({ sol: solicitud({ puede_enviar: false, requisitos: { cumple: false, faltantes: ['Semestre mínimo 7 (actual: 5)', 'Créditos aprobados mínimo 70% (actual: 45%)'], items: items(false), practica: 'Práctica Profesional', semestre_ejecucion: 5, periodo: '2026-II' } }) });
  montar();
  expect(await screen.findAllByText('✖')).toHaveLength(2);
  expect(screen.getByText(/No puede enviar la solicitud/)).toBeTruthy();
  expect(screen.getByText(/Semestre mínimo 7 \(actual: 5\)/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Enviar solicitud' }).disabled).toBe(true);
  screen.getAllByRole('textbox').forEach((c) => expect(c.disabled).toBe(true));
});

test('Excepción E1: fallo de red -> Toast de error, botón rehabilitado, sin redirección', async () => {
  simular({ sol: solicitud(), post: () => Promise.reject(new TypeError('Failed to fetch')) });
  montar();
  await userEvent.click(await screen.findByRole('button', { name: 'Enviar solicitud' }));
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmar envío' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Error de conexión/));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('Solicitud de práctica')).toBeTruthy();            // sigue en el formulario
  expect(screen.getByRole('button', { name: 'Enviar solicitud' }).disabled).toBe(false); // botón rehabilitado
});

test('Solicitud rechazada en este período: muestra el motivo y bloquea el envío', async () => {
  simular({ sol: solicitud({ estado_solicitud: 'rechazado', etiqueta: 'Rechazada', motivo_rechazo: 'Documentación incompleta', puede_enviar: false, bloqueo: 'Su solicitud fue rechazada para este período lectivo' }) });
  montar();
  expect(await screen.findByText(/Documentación incompleta/)).toBeTruthy();
  expect(screen.getByText(/rechazada para este período/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Enviar solicitud' }).disabled).toBe(true);
});

test('Estudiante con práctica: ve la nota del docente por sesión y descarga su bitácora en PDF', async () => {
  const llamadas = [];
  URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn(); HTMLAnchorElement.prototype.click = vi.fn();
  global.fetch = vi.fn((url, opts = {}) => {
    llamadas.push(url);
    if (url.endsWith('/solicitudes/mia')) return json(solicitud({ estado_solicitud: 'asignado', etiqueta: 'Asignado', puede_enviar: false }));
    if (url.endsWith('/asignaciones/mia')) return json({ id: 1, estado: 'calificado', institucion: 'Clínica Santa Ana', tutor: 'Tomás', docente: 'Diana', fecha_inicio_practica: '2026-10-01' });
    if (url.endsWith('/bitacora/1/pdf')) return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['%PDF'])) });
    if (url.endsWith('/bitacora/1')) return json({ horas_acumuladas: 8, horas_requeridas: 160, calificacion: { nota: 4.3, retroalimentacion: 'Buen desempeño' },
      sesiones: [{ _id: 'a1', fecha_sesion: '2026-10-05T00:00:00Z', horas: 4, resumen_actividades: 'Soporte técnico', estado_validacion: 'validada_tutor', calificacion: { nota: 4.5, retroalimentacion: 'Buen manejo' } }] });
    return json({}, 404);
  });
  montar('/seguimiento');
  expect(await screen.findByText('Nota del docente')).toBeTruthy();
  expect(await screen.findByText('4.5 — Buen manejo')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));
  await waitFor(() => expect(llamadas.some((u) => u.endsWith('/bitacora/1/pdf'))).toBe(true));
});

test('Con práctica asignada pide inhabilitar «Solicitar práctica» en el menú; sin asignación no bloquea nada', async () => {
  global.fetch = vi.fn((url) => {
    if (url.endsWith('/solicitudes/mia')) return json(solicitud({ estado_solicitud: 'asignado', etiqueta: 'Asignado', puede_enviar: false }));
    if (url.endsWith('/asignaciones/mia')) return json({ id: 1, estado: 'en_curso', institucion: 'Clínica Santa Ana', tutor: 'Tomás', docente: 'Diana', fecha_inicio_practica: '2026-10-01' });
    if (url.endsWith('/bitacora/1')) return json({ horas_acumuladas: 0, horas_requeridas: 160, calificacion: null, sesiones: [] });
    return json({}, 404);
  });
  const bloquear = vi.fn();
  const { unmount } = montar('/solicitud', bloquear);
  expect(await screen.findByText('Mi práctica')).toBeTruthy();                  // /solicitud redirige al seguimiento
  await waitFor(() => expect(bloquear).toHaveBeenLastCalledWith({ solicitud: 'Ya tiene una práctica asignada' }));
  unmount();

  simular({ sol: solicitud() });
  const libre = vi.fn();
  montar('/solicitud', libre);
  expect(await screen.findByText('Solicitud de práctica')).toBeTruthy();
  expect(libre).toHaveBeenLastCalledWith({});
});
