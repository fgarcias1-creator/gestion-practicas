import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, sesion } from '../api.js';
import { Aviso } from '../ui.jsx';
import Ilustracion from '../Ilustracion.jsx';

/** Pantalla de ingreso (sección 9.1): el Gateway reenvía al Servicio de Identidad, que devuelve el JWT. */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const nav = useNavigate();

  async function ingresar(e) {
    e.preventDefault();
    try {
      const { token, usuario } = await api('/auth/login', { method: 'POST', body: { email, password } });
      sesion.guardar(token, usuario);
      nav('/'); // Panel redirige según el rol
    } catch (err) { setError(err.message); }
  }

  const DEMO = [['Administrador', 'admin@udi.edu.co'], ['Director', 'director@udi.edu.co'], ['Docente', 'docente@udi.edu.co'], ['Tutor', 'tutor@santaana.com'], ['Estudiante', 'estudiante1@udi.edu.co']];
  const usarDemo = (correo) => { setEmail(correo); setPassword('Practicas2026*'); setError(''); };

  return (
    <div className="ingreso">
      <section className="ingreso-arte" aria-hidden="false">
        <div className="ingreso-marca"><span className="ingreso-logo">🎓</span> Prácticas UDI</div>
        <h1>Tu práctica académica, de la solicitud a la nota final.</h1>
        <p>Solicita, registra tus sesiones con evidencias y sigue tu avance en un solo lugar, junto a tu tutor, tu docente y la dirección del programa.</p>
        <Ilustracion tipo="login" className="ingreso-ilustracion" />
        <ul className="ingreso-puntos">
          <li><span>📝</span>Solicitud en línea</li><li><span>📒</span>Bitácora con evidencias</li><li><span>⭐</span>Calificación transparente</li>
        </ul>
      </section>
      <section className="ingreso-form">
        <div className="tarjeta login">
          <h2>Bienvenido de nuevo</h2>
          <p className="gris">Ingrese con su correo institucional.</p>
          <form onSubmit={ingresar}>
            <label htmlFor="correo">Correo institucional</label>
            <input id="correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="nombre@udi.edu.co" />
            <label htmlFor="clave">Contraseña</label>
            <input id="clave" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Aviso>{error}</Aviso>
            <button style={{ width: '100%', marginTop: '1rem' }}>Ingresar</button>
          </form>
          <div className="ingreso-demo">
            <p className="gris">Usuarios de demostración <small>(contraseña: Practicas2026*)</small></p>
            <div>{DEMO.map(([rol, correo]) => <button key={correo} type="button" className="chip" onClick={() => usarDemo(correo)} title={correo}>{rol}</button>)}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
