/**
 * RF05: descarga de la bitácora en PDF. Función pura (recibe los datos ya armados y devuelve un Buffer),
 * por eso se puede probar sin base de datos.
 */
const PDFDocument = require('pdfkit');

const ESTADO_SESION = {
  borrador: 'Borrador', pendiente: 'Pendiente de validación', validada_tutor: 'Validada por el tutor',
  confirmada_automatica: 'Confirmada automáticamente', requiere_correccion: 'Requiere corrección',
};
const ESTADO_GENERAL = { asignado: 'Asignado', en_curso: 'En curso', evaluado: 'Evaluado', calificado: 'Calificado', finalizado: 'Finalizado' };
const dia = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '—');

function generarPdfBitacora(datos) {
  // Defensa: el PDF nunca incluye borradores, aunque quien lo llame los envíe.
  const b = { ...datos, sesiones: datos.sesiones.filter((s) => s.estado_validacion !== 'borrador') };
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Bitácora de práctica - ${b.asignacion.estudiante}`, Author: 'Gestión de Prácticas Académicas' } });
    const partes = [];
    doc.on('data', (c) => partes.push(c)); doc.on('end', () => resolve(Buffer.concat(partes))); doc.on('error', reject);

    const a = b.asignacion;
    const L = 50, W = 495;
    doc.font('Helvetica-Bold').fontSize(18).text('Bitácora de práctica', L, 50);
    doc.font('Helvetica').fontSize(10).fillColor('#5b6475').text(`Generada el ${dia(b.generado)}`, L, 74).fillColor('#000');

    const dato = (k, v, x, y) => { doc.font('Helvetica-Bold').fontSize(10).text(k, x, y, { continued: true, width: 240 }).font('Helvetica').text(` ${v ?? '—'}`); };
    let y = 100;
    dato('Estudiante:', a.estudiante, L, y); dato('Programa:', a.programa, 300, y); y += 16;
    dato('Institución:', a.institucion, L, y); dato('Inicio:', dia(a.fecha_inicio_practica), 300, y); y += 16;
    dato('Tutor de la institución:', a.tutor, L, y); dato('Docente asesor:', a.docente, 300, y); y += 16;
    dato('Estado general:', ESTADO_GENERAL[b.estado_general] || b.estado_general, L, y); y += 26;

    // Horas acumuladas frente a las requeridas
    const pct = Math.min(100, Math.round((b.horas_acumuladas / b.horas_requeridas) * 100));
    doc.font('Helvetica-Bold').fontSize(11).text(`Horas acumuladas: ${b.horas_acumuladas} de ${b.horas_requeridas} (${pct}%)`, L, y);
    y += 18;
    doc.roundedRect(L, y, W, 10, 3).fill('#e8eefb').fillColor('#000');
    if (pct > 0) doc.roundedRect(L, y, (W * pct) / 100, 10, 3).fill('#0b3d91').fillColor('#000');
    y += 28;

    // Tabla de sesiones
    const anchos = [50, 28, 76, 128, 96, 97];            // fecha, horas, estado, actividades, observación del tutor, calificación del docente
    const titulos = ['Fecha', 'Horas', 'Estado', 'Actividades', 'Obs. del tutor', 'Calificación'];
    const col = anchos.map((w, n) => ({ t: titulos[n], w, x: L + anchos.slice(0, n).reduce((a, c) => a + c, 0) + n * 4 }));
    const encabezado = () => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#5b6475');
      col.forEach((c) => doc.text(c.t, c.x, y, { width: c.w }));
      doc.fillColor('#000').moveTo(L, y + 13).lineTo(L + W, y + 13).strokeColor('#d9deea').stroke();
      y += 20;
    };
    doc.font('Helvetica-Bold').fontSize(12).text(`Sesiones registradas (${b.sesiones.length})`, L, y, { continued: true }).font('Helvetica').fontSize(9).fillColor('#5b6475').text('   No incluye borradores.').fillColor('#000'); y += 20;
    encabezado();
    for (const s of b.sesiones) {
      const estado = `${ESTADO_SESION[s.estado_validacion] || s.estado_validacion}${s.validacion_automatica ? ' (24 h)' : ''}`;
      const nEv = (s.evidencias || []).length;
      const actividades = `${s.resumen_actividades || '—'}${nEv ? `\nEvidencias: ${nEv}` : ''}`;
      const observacion = s.observacion_tutor || '—';
      const calificacion = s.calificacion ? `${s.calificacion.nota}\n${s.calificacion.retroalimentacion || ''}` : '—';
      doc.font('Helvetica').fontSize(9);
      const alto = Math.max(12, ...[estado, actividades, observacion, calificacion].map((t, n) => doc.heightOfString(t, { width: col[n + 2].w })));
      if (y + alto > 780) { doc.addPage(); y = 50; encabezado(); doc.font('Helvetica').fontSize(9); }
      doc.text(dia(s.fecha_sesion), col[0].x, y, { width: col[0].w }).text(String(s.horas), col[1].x, y, { width: col[1].w })
        .text(estado, col[2].x, y, { width: col[2].w }).text(actividades, col[3].x, y, { width: col[3].w })
        .text(observacion, col[4].x, y, { width: col[4].w }).text(calificacion, col[5].x, y, { width: col[5].w });
      y += alto + 8;
    }
    if (!b.sesiones.length) { doc.font('Helvetica').fontSize(9).fillColor('#5b6475').text('Aún no hay sesiones registradas.', L, y); y += 16; doc.fillColor('#000'); }

    // Calificación final
    if (b.calificacion) {
      if (y > 700) { doc.addPage(); y = 50; }
      y += 10;
      doc.font('Helvetica-Bold').fontSize(12).text('Calificación final', L, y); y += 18;
      doc.font('Helvetica-Bold').fontSize(14).text(String(b.calificacion.nota), L, y); y += 20;
      doc.font('Helvetica').fontSize(10).text(b.calificacion.retroalimentacion, L, y, { width: W });
    }
    doc.end();
  });
}

module.exports = { generarPdfBitacora };
