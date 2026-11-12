import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Evidencias, tipoVista } from './ui.jsx';

vi.mock('mammoth', () => ({ default: { convertToHtml: vi.fn(() => Promise.resolve({ value: '<h1>Informe semanal</h1><script>alert(1)</script>' })) } }));

const sesion = { _id: 'x1', evidencias: [
  { archivo: 'a.jpg', nombre_original: 'foto.JPG' }, { archivo: 'b.txt', nombre_original: 'notas.txt' },
  { archivo: 'c.docx', nombre_original: 'informe.docx' }, { archivo: 'd.html', nombre_original: 'pagina.html' }] };

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:img'); URL.revokeObjectURL = vi.fn();
  global.fetch = vi.fn((url) => Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob([url.endsWith('b.txt') ? 'Hola tutor' : 'x'])) }));
});

test('Solo se previsualizan formatos seguros (Word incluido); HTML, Excel y ejecutables se descargan', () => {
  expect(['foto.JPG', 'a.pdf', 'n.txt', 'v.mp4', 'a.mp3', 'informe.docx'].map((n) => tipoVista(n))).toEqual(['imagen', 'pdf', 'texto', 'video', 'audio', 'word']);
  expect(['p.html', 'x.xlsx', 'sin_extension', 'y.exe'].map((n) => tipoVista(n))).toEqual(['', '', '', '']);
  expect(tipoVista('foto_sin_extension', 'image/jpeg')).toBe('imagen');           // sin extensión: usa el formato guardado
  expect(tipoVista('pagina', 'text/html')).toBe('');                              // HTML nunca se abre en la página
});

test('Word (.docx) se ve en la página dentro de un marco aislado, sin ejecutar scripts', async () => {
  render(<Evidencias sesion={{ _id: 'x1', evidencias: [{ archivo: 'c.docx', nombre_original: 'informe.docx' }] }} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ver informe.docx' }));
  const visor = await screen.findByRole('dialog', { name: 'Vista previa de informe.docx' });
  await waitFor(() => expect(visor.querySelector('iframe.visor-word')).toBeTruthy());
  const marco = visor.querySelector('iframe.visor-word');
  expect(marco.getAttribute('sandbox')).toBe('');                                 // sandbox vacío = sin scripts ni acceso al sistema
  expect(marco.getAttribute('srcdoc')).toContain('<h1>Informe semanal</h1>');
});

test('Si el servidor no encuentra el archivo, el visor explica el motivo en vez de quedar en blanco', async () => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'Evidencia no encontrada' }) }));
  render(<Evidencias sesion={{ _id: 'x1', evidencias: [{ archivo: 'a.jpg', nombre_original: 'foto.jpg' }] }} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ver foto.jpg' }));
  expect(await screen.findByText('No se pudo mostrar el archivo.')).toBeTruthy();
  expect(screen.getByText('Evidencia no encontrada')).toBeTruthy();
});

test('Imagen y texto se ven en la página; un .html muestra el botón de descarga sin pedir el archivo', async () => {
  render(<Evidencias sesion={sesion} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ver foto.JPG' }));
  const img = await screen.findByRole('img', { name: 'foto.JPG' });
  expect(img.getAttribute('src')).toBe('blob:img');
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();

  await userEvent.click(screen.getByRole('button', { name: 'Ver notas.txt' }));
  expect(await screen.findByText('Hola tutor')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Cerrar vista previa' }));

  global.fetch.mockClear();
  await userEvent.click(screen.getByRole('button', { name: 'Ver pagina.html' }));
  const visor = screen.getByRole('dialog', { name: 'Vista previa de pagina.html' });
  expect(within(visor).getByText(/no se puede ver en la página/)).toBeTruthy();
  expect(visor.querySelector('iframe')).toBeNull();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(within(visor).getByRole('button', { name: /Descargar archivo/ })).toBeTruthy();
});
