import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Evidencias, tipoVista } from './ui.jsx';

const sesion = { _id: 'x1', evidencias: [
  { archivo: 'a.jpg', nombre_original: 'foto.JPG' }, { archivo: 'b.txt', nombre_original: 'notas.txt' },
  { archivo: 'c.docx', nombre_original: 'informe.docx' }, { archivo: 'd.html', nombre_original: 'pagina.html' }] };

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:img'); URL.revokeObjectURL = vi.fn();
  global.fetch = vi.fn((url) => Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob([url.endsWith('b.txt') ? 'Hola tutor' : 'x'])) }));
});

test('Solo se previsualizan formatos seguros; HTML y Office se descargan', () => {
  expect(['foto.JPG', 'a.pdf', 'n.txt', 'v.mp4', 'a.mp3'].map(tipoVista)).toEqual(['imagen', 'pdf', 'texto', 'video', 'audio']);
  expect(['p.html', 'x.docx', 'sin_extension', 'y.exe'].map(tipoVista)).toEqual(['', '', '', '']);
});

test('Imagen y texto se ven en la página; un .docx muestra el botón de descarga sin pedir el archivo', async () => {
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
