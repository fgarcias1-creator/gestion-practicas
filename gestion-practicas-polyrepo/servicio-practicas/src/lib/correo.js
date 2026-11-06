/**
 * Envío de correos (RF01: rechazo/devolución al estudiante · RF02: asignación a estudiante, tutor e institución).
 * Si NO hay SMTP_HOST configurado el correo queda SIMULADO (se escribe en consola y se audita como «simulado»).
 * Si hay servidor SMTP, se envía de verdad. Un fallo de correo nunca tumba la operación del usuario.
 *   SMTP_HOST, SMTP_PORT (587), SMTP_SECURE (false), SMTP_USER, SMTP_PASS, SMTP_FROM
 */
const nodemailer = require('nodemailer');

let transporte;
function crearTransporte() {
  const e = process.env;
  if (!e.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: e.SMTP_HOST, port: Number(e.SMTP_PORT || 587), secure: e.SMTP_SECURE === 'true',
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 8000,
  });
}

/** @returns {Promise<{enviado:boolean, simulado?:boolean, error?:string}>} */
async function enviarCorreo({ a, asunto, texto }) {
  if (!a) return { enviado: false, error: 'sin destinatario' };
  if (transporte === undefined) transporte = crearTransporte();
  if (!transporte) {
    console.log(`[correo simulado] Para: ${a} · Asunto: ${asunto}`);
    return { enviado: false, simulado: true };
  }
  try {
    await transporte.sendMail({ from: process.env.SMTP_FROM || 'Prácticas académicas <practicas@udi.edu.co>', to: a, subject: asunto, text: texto });
    return { enviado: true };
  } catch (e) {
    console.warn(`[correo] no se pudo enviar a ${a}:`, e.message);
    return { enviado: false, error: e.message };
  }
}

module.exports = { enviarCorreo };
