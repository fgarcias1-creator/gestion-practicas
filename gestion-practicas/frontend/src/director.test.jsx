import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Director from './pages/Director.jsx';
import Layout from './Layout.jsx';

const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
const inst = (o) => ({ id: 1, nombre: 'Clínica Santa Ana', activa: true, convenio_vigente: true, cupo_disponible: 3, cupo_total: 5, convenios: [], nit: '1', ...o });
const INSTITUCIONES = [
  inst({}),
  inst({ id: 2, nombre: 'Alcaldía Sin Cupos', cupo_disponible: 0 }),
  inst({ id: 3, nombre: 'Soluciones TI', convenio_vigente: false }),
];
const SOLICITUDES = [{ estudiante_id: 1, nombre_completo: 'Elena Estudiante', codigo_estudiantil: 'U1', programa: 'Ingeniería de Sistemas', semestre: 8,
  creditos_aprobados: 131, creditos_totales: 160, porcentaje_creditos: 81.9, fecha_solicitud: '2026-10-28T10:00:00Z' }];
const DOCENTES = [{ id: 1, nombre_completo: 'Diana Docente', carga: 10, limite: 10 }];
const TUTORES = [{ id: 1, nombre_completo: 'Tomás Tutor', institucion_id: 1, carga: 3, limite: 3 }];
const PROGRAMAS = [{ id: 1, nombre: 'Ingeniería de Sistemas', facultad: 'Facultad de Ingenierías', creditos_totales: 160, semestre_minimo: 7, porcentaje_minimo: 70, horas_practica: 160 }];
const ASIGNACIONES = [
  { id: 10, estudiante_id: 1, estudiante: 'Elena', programa: 'IS', institucion: 'Clínica Santa Ana', institucion_id: 1, tutor: 'Tomás', tutor_id: 1, docente: 'Diana', docente_id: 1, fecha_inicio_practica: '2030-01-10', estado: 'asignado' },
  { id: 11, estudiante_id: 2, estudiante: 'Sara', programa: 'IS', institucion: 'Clínica Santa Ana', institucion_id: 1, tutor: 'Tomás', tutor_id: 1, docente: 'Diana', docente_id: 1, fecha_inicio_practica: '2026-01-10', estado: 'en_curso' },
];

const BITACORA = { estudiante_id: 2, estado_general: 'en_curso', horas_acumuladas: 8, horas_requeridas: 160, calificacion: null,
  asignacion: { estudiante: 'Sara', institucion: 'Clínica Santa Ana', programa: 'IS', tutor: 'Tomás', docente: 'Diana', fecha_inicio_practica: '2026-01-10' },
  sesiones: [{ _id: 'a1', fecha_sesion: '2026-02-01T00:00:00Z', horas: 4, resumen_actividades: 'Soporte técnico', estado_validacion: 'validada_tutor', calificacion: null }] };

function simular(extra = {}) {
  const llamadas = [];
  global.fetch = vi.fn((url, opts = {}) => {
    const m = opts.method || 'GET'; llamadas.push({ m, url, body: opts.body });
    if (extra[`${m} ${url}`]) return extra[`${m} ${url}`](opts);
    if (m === 'GET' && url.endsWith('/solicitudes')) return json(SOLICITUDES);
    if (m === 'GET' && url.endsWith('/instituciones')) return json(INSTITUCIONES);
    if (m === 'GET' && url.endsWith('/catalogos/docentes')) return json(DOCENTES);
    if (m === 'GET' && url.includes('/catalogos/tutores')) return json(TUTORES);
    if (m === 'GET' && url.endsWith('/asignaciones')) return json(ASIGNACIONES);
    if (m === 'GET' && /\/bitacora\/\d+$/.test(url)) return json(BITACORA);
    if (m === 'PATCH' && /\/solicitudes\/1\/rechazar$/.test(url)) return json({ estado_solicitud: 'rechazado' });
    if (m === 'GET' && url.endsWith('/programas')) return json(PROGRAMAS);
    if (m === 'GET' && url.endsWith('/usuarios')) return json([]);
    if (m === 'POST' && url.endsWith('/asignaciones')) return json({ asignacion: { id: 12 }, advertencias: ['El docente seleccionado superó el límite de estudiantes bajo su supervisión'] }, 201);
    return json({ error: 'sin simular ' + m + ' ' + url }, 404);
  });
  return llamadas;
}

test('Asignar práctica (E1): las instituciones sin cupos o sin convenio quedan DESHABILITADAS y se muestra la alerta', async () => {
  simular();
  render(<Director />);
  expect(await screen.findByText(/Lista de espera \(1\)/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Seleccionar' }));
  const [, selInst] = await screen.findAllByRole('combobox');            // el primero es el filtro «Programa» de la lista de espera
  const opciones = within(selInst).getAllByRole('option');
  const por = (t) => opciones.find((o) => o.textContent.includes(t));
  expect(por('Clínica Santa Ana').disabled).toBe(false);
  expect(por('Alcaldía Sin Cupos').disabled).toBe(true);
  expect(por('Soluciones TI').disabled).toBe(true);
  const alertas = screen.getAllByText(/La institución seleccionada no cuenta con cupos vigentes/);
  expect(alertas.length).toBe(2);
});

test('Asignar práctica (E2 + confirmación): advierte carga completa, pide confirmar y notifica a las partes', async () => {
  const llamadas = simular();
  render(<Director />);
  await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar' }));
  const [, selInst, selTutor, selDoc] = await screen.findAllByRole('combobox'); // el primero es el filtro «Programa»
  await userEvent.selectOptions(selInst, '1');
  await waitFor(() => expect(within(selTutor).getAllByRole('option').length).toBeGreaterThan(1));
  await userEvent.selectOptions(selTutor, '1');
  await userEvent.selectOptions(selDoc, '1');
  fireEvent.change(document.querySelector('input[type=date]'), { target: { value: '2030-03-01' } });
  expect(screen.getByText(/El tutor seleccionado superó el límite/)).toBeTruthy();   // 3/3
  expect(screen.getByText(/El docente seleccionado superó el límite/)).toBeTruthy(); // 10/10
  await userEvent.click(screen.getByRole('button', { name: 'Asignar práctica' }));
  const modal = await screen.findByRole('dialog');
  expect(within(modal).getByText(/se notifica automáticamente al estudiante, al tutor, al docente y a la institución/)).toBeTruthy();
  expect(llamadas.some((l) => l.m === 'POST')).toBe(false);
  await userEvent.click(within(modal).getByRole('button', { name: 'Confirmar asignación' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Práctica asignada.*notificó/));
  const post = llamadas.find((l) => l.m === 'POST');
  expect(JSON.parse(post.body)).toEqual({ estudiante_id: 1, institucion_id: 1, tutor_id: 1, docente_id: 1, fecha_inicio_practica: '2030-03-01' });
});

test('Flujo 2a: solo se puede REASIGNAR una práctica que aún no inicia', async () => {
  simular();
  render(<Director seccion="asignaciones" />);
  await screen.findByText('Sara');
  expect(screen.getAllByRole('button', { name: 'Reasignar' })).toHaveLength(1);        // solo la de inicio 2030
  await userEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
  expect(await screen.findByText(/Reasignar la práctica de Elena/)).toBeTruthy();
});

test('Permisos: el director solo CONSULTA instituciones; no puede crear ni modificar nada (eso es del administrador)', async () => {
  simular();
  render(<Director seccion="instituciones" />);
  expect(await screen.findByText(/Instituciones y convenios \(consulta\)/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Crear' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Crear convenio' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Inhabilitar' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Cupos' })).toBeNull();
  expect(screen.queryByText(/vence en/)).toBeNull();                          // sin avisos de convenios por vencer
});

test('Campana: muestra las no leídas, abre la lista y marca como leída', async () => {
  const llamadas = simular({
    'GET /api/v1/notificaciones': () => json({ no_leidas: 1, items: [{ _id: 'n1', titulo: 'Práctica asignada', mensaje: 'Realizará su práctica en Clínica Santa Ana', leida: false, fecha: '2026-10-28T10:00:00Z' }] }),
    'PATCH /api/v1/notificaciones/n1/leida': () => json({ ok: true }),
  });
  render(<MemoryRouter><Layout usuario={{ nombre: 'Elena', rol: 'estudiante' }}><div /></Layout></MemoryRouter>);
  const campana = await screen.findByRole('button', { name: 'Notificaciones' });
  await waitFor(() => expect(campana.textContent).toContain('1'));
  await userEvent.click(campana);
  await userEvent.click(await screen.findByText('Práctica asignada'));
  await waitFor(() => expect(llamadas.some((l) => l.m === 'PATCH' && l.url.endsWith('/notificaciones/n1/leida'))).toBe(true));
});

test('Consultar seguimiento (director): busca un estudiante y ve su bitácora', async () => {
  simular();
  render(<Director seccion="seguimiento" />);
  expect(await screen.findByText('Elena')).toBeTruthy();
  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'Sara');
  expect(screen.queryByText('Elena')).toBeNull();                              // el buscador filtra
  await userEvent.click(screen.getByRole('button', { name: 'Ver bitácora' }));
  expect(await screen.findByText('Bitácora de Sara')).toBeTruthy();
  expect(screen.getByText('Soporte técnico')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeTruthy();
});

test('Rechazar solicitud (director): exige un motivo en un modal y notifica', async () => {
  const llamadas = simular();
  render(<Director />);
  await userEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
  const modal = await screen.findByRole('dialog');
  expect(within(modal).getByRole('button', { name: 'Confirmar' }).disabled).toBe(true);
  await userEvent.type(within(modal).getByRole('textbox'), 'Documentación incompleta');
  await userEvent.click(within(modal).getByRole('button', { name: 'Confirmar' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/notificó al estudiante/));
  expect(JSON.parse(llamadas.find((l) => l.m === 'PATCH').body)).toEqual({ motivo: 'Documentación incompleta' });
});

test('Filtros (director): en Asignaciones se filtra por estado y por texto, y se puede limpiar', async () => {
  simular();
  render(<Director seccion="asignaciones" />);
  await screen.findByText('Sara');
  expect(screen.getByText(/Mostrando 2 de 2/)).toBeTruthy();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'en_curso');
  expect(screen.queryByText('Elena')).toBeNull();
  expect(screen.getByText('Sara')).toBeTruthy();
  expect(screen.getByText(/Mostrando 1 de 2/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  expect(screen.getByText('Elena')).toBeTruthy();
});

test('Filtros (director): la búsqueda ignora tildes y mayúsculas en Instituciones', async () => {
  simular();
  render(<Director seccion="instituciones" />);
  await screen.findByText('Clínica Santa Ana');
  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'clinica');
  expect(screen.getByText('Clínica Santa Ana')).toBeTruthy();
  expect(screen.queryByText('Soluciones TI')).toBeNull();
});
