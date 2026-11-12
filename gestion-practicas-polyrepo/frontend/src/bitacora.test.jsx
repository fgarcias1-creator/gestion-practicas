import { render, screen, within } from '@testing-library/react';
import Bitacora from './Bitacora.jsx';

const json = (d, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(d) });
const base = {
  estado_general: 'evaluado', horas_acumuladas: 12, horas_requeridas: 160, calificacion: null,
  asignacion: { estudiante: 'Sara En-Curso', institucion: 'Clínica Santa Ana', programa: 'Ingeniería de Sistemas', tutor: 'Tomás', docente: 'Diana', fecha_inicio_practica: '2026-10-01' },
};

test('Bitácora del docente: cada actividad calificada muestra su nota y arriba aparece el promedio de actividades', async () => {
  global.fetch = vi.fn(() => json({ ...base, promedio_sesiones: 4.3, sesiones_calificadas: 2, sesiones_validadas: 3, sesiones: [
    { _id: 'a', fecha_sesion: '2026-10-20', horas: 4, resumen_actividades: 'Soporte técnico', estado_validacion: 'validada_tutor', calificacion: { nota: 4.6, retroalimentacion: 'Excelente' } },
    { _id: 'b', fecha_sesion: '2026-10-21', horas: 4, resumen_actividades: 'Inventario', estado_validacion: 'validada_tutor', calificacion: { nota: 4, retroalimentacion: '' } },
    { _id: 'c', fecha_sesion: '2026-10-22', horas: 4, resumen_actividades: 'Documentación', estado_validacion: 'validada_tutor', calificacion: null },
  ] }));
  render(<Bitacora estudianteId={3} />);
  expect(await screen.findByText('4.3')).toBeTruthy();
  expect(screen.getByText('Promedio de actividades (2 de 3 calificadas)')).toBeTruthy();
  const fila = (t) => screen.getByText(t).closest('tr');
  expect(within(fila('Soporte técnico')).getByText('4.6').className).toContain('alta');
  expect(within(fila('Soporte técnico')).getByText('Excelente')).toBeTruthy();
  expect(within(fila('Inventario')).getByText('4.0')).toBeTruthy();
  expect(within(fila('Documentación')).getByText('Sin calificar')).toBeTruthy();
  expect(screen.getByText('Nota final pendiente')).toBeTruthy();
});

test('Bitácora sin actividades calificadas: el promedio lo indica y la nota final aparece cuando se publica', async () => {
  global.fetch = vi.fn(() => json({ ...base, promedio_sesiones: null, sesiones_calificadas: 0, sesiones_validadas: 0, sesiones: [],
    calificacion: { nota: 4.2, retroalimentacion: 'Buen desempeño general' } }));
  render(<Bitacora estudianteId={3} />);
  expect(await screen.findByText('Promedio: aún sin actividades calificadas')).toBeTruthy();
  expect(screen.getByText('4.2')).toBeTruthy();
  expect(screen.getByText('Nota final publicada')).toBeTruthy();
  expect(screen.getByText(/Buen desempeño general/)).toBeTruthy();
});
