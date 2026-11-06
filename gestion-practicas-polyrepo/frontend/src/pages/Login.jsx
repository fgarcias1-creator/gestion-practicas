import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, sesion } from '../api.js';
import { Aviso } from '../ui.jsx';

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

  return (
    <div className="tarjeta login">
      <h2 style={{ color: 'var(--azul)' }}>Gestión de Prácticas</h2>
      <form onSubmit={ingresar}>
        <label>Correo institucional</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <label>Contraseña</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Aviso>{error}</Aviso>
        <button style={{ width: '100%', marginTop: '1rem' }}>Ingresar</button>
      </form>
      <p className="gris">Demo: admin@udi.edu.co · director@udi.edu.co · docente@udi.edu.co · tutor@santaana.com · estudiante1@udi.edu.co<br />Contraseña: Practicas2026*</p>
    </div>
  );
}
