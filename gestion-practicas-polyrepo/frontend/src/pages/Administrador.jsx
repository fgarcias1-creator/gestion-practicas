import { useState } from 'react';
import { api } from '../api.js';
import { useDatos, useAccion, Tarjeta, Insignia, Modal, Filtros, useFiltros, coincide, fecha } from '../ui.jsx';

/**
 * Panel del ADMINISTRADOR (personal de sistemas de la universidad).
 * Es el único rol que crea y gestiona usuarios (estudiantes, tutores, docentes, directores, administradores)
 * y que registra instituciones, convenios, adendas y cupos, y programas académicos (ingenierías, licenciaturas, etc.).
 * Sus opciones están en la barra lateral (Usuarios, Instituciones, Programas). El director NO tiene estos permisos: solo aprueba/rechaza
 * solicitudes y asigna institución, tutor y docente al estudiante.
 */
export default function Administrador({ usuario, seccion = 'usuarios' }) {
  const Vista = { usuarios: Usuarios, instituciones: Instituciones, programas: Programas }[seccion] || Usuarios;
  return <Vista usuario={usuario} />;
}

// ---------------------------------------------------------------------
// Astah «Gestionar instituciones y convenios»
// ---------------------------------------------------------------------
function Instituciones() {
  const insts = useDatos(() => api('/instituciones'));
  const [f, setF] = useState({ nit: '', nombre: '', cupo_total: 1 });
  const [c, setC] = useState({ institucion_id: '', fecha_inicio: '', fecha_fin: '' });
  const { ejecutar, aviso } = useAccion();
  const recargar = () => insts.recargar();
  const filtros = useFiltros({ q: '', estado: '' });
  const { q, estado } = filtros.valores;
  const visibles = (insts.datos || []).filter((i) => coincide(i, ['nit', 'nombre'], q)
    && (!estado || (estado === 'activa' ? i.activa : estado === 'inhabilitada' ? !i.activa : estado === 'vigente' ? i.convenio_vigente : !i.convenio_vigente)));

  const adenda = (v) => {
    const nueva = prompt('Nueva fecha de fin del convenio (AAAA-MM-DD):', v.fecha_fin);
    if (nueva) ejecutar(() => api(`/convenios/${v.id}/adenda`, { method: 'PATCH', body: { fecha_fin: nueva } }).then(recargar), 'Adenda registrada');
  };
  const cupos = (i) => {
    const n = prompt(`Nuevo cupo total para ${i.nombre}:`, i.cupo_total);
    if (n !== null && n !== '') ejecutar(() => api(`/instituciones/${i.id}`, { method: 'PUT', body: { cupo_total: Number(n) } }).then(recargar), 'Cupos actualizados');
  };
  const inhabilitar = (i) => {
    if (window.confirm(`¿Inhabilitar ${i.nombre}? No podrá recibir nuevos practicantes.`)) ejecutar(() => api(`/instituciones/${i.id}/inhabilitar`, { method: 'PATCH' }).then(recargar), 'Institución inhabilitada');
  };

  return (
    <>
      {aviso}
      <Tarjeta titulo="Instituciones y convenios">
        <Filtros filtros={filtros} buscar="Nombre o NIT de la institución…" total={insts.datos?.length ?? 0} mostrados={visibles.length}
          selects={[{ k: 'estado', etiqueta: 'Mostrar', opciones: [['', 'Todas'], ['activa', 'Activas'], ['inhabilitada', 'Inhabilitadas'], ['vigente', 'Con convenio vigente'], ['sin_vigente', 'Sin convenio vigente']] }]} />
        <table>
          <thead><tr><th>NIT</th><th>Institución</th><th>Cupos</th><th>Convenios</th><th></th></tr></thead>
          <tbody>{visibles.map((i) => (
            <tr key={i.id}><td>{i.nit}</td><td>{i.nombre}{!i.activa && ' (inhabilitada)'}</td><td>{i.cupo_disponible}/{i.cupo_total}</td>
              <td>{i.convenios.map((v) => <div key={v.id}><Insignia estado={v.estado} /> {fecha(v.fecha_inicio)} → {fecha(v.fecha_fin)} <button className="link" onClick={() => adenda(v)}>Adenda</button></div>)}</td>
              <td>{i.activa && <><button className="sec" onClick={() => cupos(i)}>Cupos</button><button className="mal" onClick={() => inhabilitar(i)}>Inhabilitar</button></>}</td></tr>))}</tbody>
        </table>
      </Tarjeta>
      <Tarjeta titulo="Nueva institución">
        <div className="fila">
          <div><label>NIT</label><input value={f.nit} onChange={(e) => setF({ ...f, nit: e.target.value })} /></div>
          <div><label>Razón social</label><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
          <div><label>Cupos</label><input type="number" min="0" value={f.cupo_total} onChange={(e) => setF({ ...f, cupo_total: +e.target.value })} /></div>
        </div>
        <button onClick={() => ejecutar(() => api('/instituciones', { method: 'POST', body: f }).then(recargar), 'Institución creada')}>Crear</button>
      </Tarjeta>
      <Tarjeta titulo="Nuevo convenio">
        <div className="fila">
          <div><label>Institución</label><select value={c.institucion_id} onChange={(e) => setC({ ...c, institucion_id: e.target.value })}><option value="">Seleccione…</option>{insts.datos?.filter((i) => i.activa).map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></div>
          <div><label>Inicio</label><input type="date" value={c.fecha_inicio} onChange={(e) => setC({ ...c, fecha_inicio: e.target.value })} /></div>
          <div><label>Fin</label><input type="date" value={c.fecha_fin} onChange={(e) => setC({ ...c, fecha_fin: e.target.value })} /></div>
        </div>
        <button onClick={() => ejecutar(() => api('/convenios', { method: 'POST', body: { ...c, institucion_id: +c.institucion_id } }).then(recargar), 'Convenio creado')}>Crear convenio</button>
      </Tarjeta>
    </>
  );
}


// ---------------------------------------------------------------------
// Programas académicos: de cada programa dependen los requisitos de la práctica (semestre, % de créditos y horas).
// Incluye licenciaturas (práctica pedagógica). El administrador agrega o ajusta carreras sin tocar el código.
// ---------------------------------------------------------------------
const PROGRAMA_VACIO = { nombre: '', facultad: '', creditos_totales: 160, semestre_minimo: 7, porcentaje_minimo: 70, horas_practica: 240, nombre_practica: 'Práctica Profesional' };

function Programas() {
  const lista = useDatos(() => api('/programas'));
  const [f, setF] = useState(PROGRAMA_VACIO);
  const [editando, setEditando] = useState(null);
  const { ejecutar, aviso } = useAccion();
  const filtros = useFiltros({ q: '', facultad: '' });
  const facultades = [...new Set((lista.datos || []).map((p) => p.facultad))].sort();
  const visibles = (lista.datos || []).filter((p) => coincide(p, ['nombre', 'facultad', 'nombre_practica'], filtros.valores.q) && (!filtros.valores.facultad || p.facultad === filtros.valores.facultad));
  const texto = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const numero = (k) => (e) => setF({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) });
  const valido = f.nombre.trim().length >= 3 && f.facultad.trim().length >= 3 && f.creditos_totales > 0 && f.horas_practica > 0 && f.semestre_minimo >= 1 && f.semestre_minimo <= 14
    && f.porcentaje_minimo >= 0 && f.porcentaje_minimo <= 100 && f.nombre_practica.trim().length >= 3;
  const guardar = async () => {
    const cuerpo = { ...f, nombre: f.nombre.trim(), facultad: f.facultad.trim(), nombre_practica: f.nombre_practica.trim() };
    const ok = await ejecutar(() => (editando
      ? api(`/programas/${editando}`, { method: 'PUT', body: cuerpo })
      : api('/programas', { method: 'POST', body: cuerpo })).then(lista.recargar), editando ? 'Programa actualizado' : 'Programa creado');
    if (ok) { setF(PROGRAMA_VACIO); setEditando(null); }
  };
  const editar = (p) => { setEditando(p.id); setF({ nombre: p.nombre, facultad: p.facultad, creditos_totales: p.creditos_totales, semestre_minimo: p.semestre_minimo,
    porcentaje_minimo: p.porcentaje_minimo, horas_practica: p.horas_practica, nombre_practica: p.nombre_practica || 'Práctica Profesional' }); };
  return (
    <>
      <Tarjeta titulo={`Programas académicos (${lista.datos?.length ?? 0})`}>
        <Filtros filtros={filtros} buscar="Programa, facultad o tipo de práctica…" total={lista.datos?.length ?? 0} mostrados={visibles.length}
          selects={[{ k: 'facultad', etiqueta: 'Facultad', opciones: [['', 'Todas'], ...facultades.map((x) => [x, x])] }]} />
        <table>
          <thead><tr><th>Programa</th><th>Facultad</th><th>Créditos del plan</th><th>Semestre mínimo para solicitar</th><th>Créditos aprobados exigidos</th><th>Horas de práctica</th><th>Tipo de práctica</th><th></th></tr></thead>
          <tbody>{visibles.map((p) => (
            <tr key={p.id}><td>{p.nombre}</td><td>{p.facultad}</td><td>{p.creditos_totales}</td><td>{p.semestre_minimo}</td><td>{p.porcentaje_minimo}% ({Math.ceil((p.creditos_totales * p.porcentaje_minimo) / 100)} de {p.creditos_totales})</td><td>{p.horas_practica}</td><td>{p.nombre_practica}</td>
              <td><button className="sec" onClick={() => editar(p)}>Editar</button></td></tr>))}</tbody>
        </table>
        {lista.error && <p className="aviso error">{lista.error}</p>}
      </Tarjeta>
      <Tarjeta titulo={editando ? 'Editar programa' : 'Nuevo programa'}>
        <div className="fila">
          <div><label>Nombre del programa</label><input value={f.nombre} onChange={texto('nombre')} placeholder="Ej.: Licenciatura en Educación Física" /></div>
          <div><label>Facultad</label><input value={f.facultad} onChange={texto('facultad')} placeholder="Ej.: Facultad de Educación" /></div>
          <div><label>Tipo de práctica</label><input value={f.nombre_practica} onChange={texto('nombre_practica')} placeholder="Ej.: Práctica Pedagógica" /></div>
        </div>
        <div className="fila">
          <div><label>Créditos del plan</label><input type="number" min="1" value={f.creditos_totales} onChange={numero('creditos_totales')} /></div>
          <div><label>Semestre mínimo para solicitar (1-14)</label><input type="number" min="1" max="14" value={f.semestre_minimo} onChange={numero('semestre_minimo')} />
            <span className="gris">El estudiante debe estar al menos en este semestre.</span></div>
          <div><label>Porcentaje del plan que debe tener aprobado (0-100)</label><input type="number" min="0" max="100" value={f.porcentaje_minimo} onChange={numero('porcentaje_minimo')} />
            <span className="gris">{f.creditos_totales > 0 && f.porcentaje_minimo !== '' ? `Equivale a ${Math.ceil((f.creditos_totales * f.porcentaje_minimo) / 100)} de ${f.creditos_totales} créditos aprobados para poder solicitar la práctica.` : 'Porcentaje de créditos aprobados exigido para solicitar la práctica.'}</span></div>
          <div><label>Horas de práctica que debe cumplir</label><input type="number" min="1" value={f.horas_practica} onChange={numero('horas_practica')} /></div>
        </div>
        <p><button disabled={!valido} onClick={guardar}>{editando ? 'Guardar cambios' : 'Crear programa'}</button>
          {editando && <button className="sec" onClick={() => { setEditando(null); setF(PROGRAMA_VACIO); }}>Cancelar</button>}</p>
        {aviso}
        <p className="gris">Los cambios aplican a las nuevas solicitudes; no modifican prácticas ya asignadas.</p>
      </Tarjeta>
    </>
  );
}

// ---------------------------------------------------------------------
// Usuarios: el administrador crea estudiantes, tutores, docentes, directores y otros administradores.
// Llama a POST /auth/registro (Identidad), que crea la cuenta y su perfil de rol (Prácticas).
// El estudiante pertenece a un PROGRAMA y se registran sus créditos APROBADOS (el % se calcula contra el plan).
// ---------------------------------------------------------------------
const PERFIL_INICIAL = {
  estudiante: { codigo_estudiantil: '', programa_id: '', semestre: 1, creditos_aprobados: 0 },
  tutor: { institucion_id: '', cargo: '', telefono: '' },
  docente: { area: '' },
  director: { programa_academico: '' },
  administrador: {},
};
const contrasenaAleatoria = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => c[n % c.length]).join('') + '*7';
};

function Usuarios({ usuario }) {
  const lista = useDatos(() => api('/usuarios'));
  const insts = useDatos(() => api('/instituciones'));
  const programas = useDatos(() => api('/programas'));
  const [f, setF] = useState({ nombre_completo: '', email: '', password: '', rol: 'estudiante' });
  const [perfil, setPerfil] = useState(PERFIL_INICIAL.estudiante);
  const [creado, setCreado] = useState(null);
  const filtros = useFiltros({ q: '', rol: '', estado: '' });
  const { ejecutar, aviso } = useAccion();
  const [reset, setReset] = useState(null);   // usuario al que se le restablece la contraseña
  const [nueva, setNueva] = useState('');
  const [entregar, setEntregar] = useState(null);

  const cambiarEstado = (u) => {
    const estado = u.estado === 'activo' ? 'inactivo' : 'activo';
    if (estado === 'inactivo' && !window.confirm(`¿Desactivar la cuenta de ${u.nombre_completo}? No podrá iniciar sesión.`)) return;
    ejecutar(() => api(`/usuarios/${u.id}/estado`, { method: 'PATCH', body: { estado } }).then(lista.recargar), estado === 'activo' ? 'Cuenta activada' : 'Cuenta desactivada');
  };
  const restablecer = async () => {
    const ok = await ejecutar(() => api(`/usuarios/${reset.id}/password`, { method: 'PATCH', body: { password: nueva } }), 'Contraseña restablecida');
    if (ok) { setEntregar({ email: reset.email, password: nueva }); setReset(null); setNueva(''); }
  };

  const cambiarRol = (rol) => { setF({ ...f, rol }); setPerfil(PERFIL_INICIAL[rol]); };
  const campo = (k) => (e) => setPerfil({ ...perfil, [k]: e.target.value });
  const prog = programas.datos?.find((p) => p.id === Number(perfil.programa_id));
  const pct = prog && perfil.creditos_aprobados !== '' ? Math.round((Number(perfil.creditos_aprobados) * 1000) / prog.creditos_totales) / 10 : null;

  async function crear() {
    // Los campos numéricos viajan como número; los textos opcionales vacíos se omiten
    const limpio = Object.fromEntries(Object.entries(perfil).filter(([, v]) => v !== ''));
    for (const k of ['programa_id', 'semestre', 'creditos_aprobados', 'institucion_id']) if (limpio[k] !== undefined) limpio[k] = Number(limpio[k]);
    const ok = await ejecutar(async () => {
      if (f.rol === 'estudiante') {
        if (!prog) throw new Error('Seleccione el programa académico del estudiante.');
        if (!(limpio.semestre >= 1 && limpio.semestre <= 14)) throw new Error('El semestre debe estar entre 1 y 14.');
        if (!(limpio.creditos_aprobados >= 0 && limpio.creditos_aprobados <= prog.creditos_totales)) {
          throw new Error(`Los créditos aprobados deben estar entre 0 y ${prog.creditos_totales} (plan de ${prog.nombre}).`);
        }
      }
      await api('/auth/registro', { method: 'POST', body: { ...f, perfil: limpio } });
      setCreado({ email: f.email, password: f.password, rol: f.rol });
      setF({ nombre_completo: '', email: '', password: '', rol: f.rol });
      setPerfil(PERFIL_INICIAL[f.rol]);
      await lista.recargar();
    }, 'Usuario creado correctamente');
    if (!ok) setCreado(null);
  }

  const { q, rol: rolF, estado: estadoF } = filtros.valores;
  const visibles = (lista.datos || []).filter((u) => coincide(u, ['nombre_completo', 'email'], q) && (!rolF || u.rol === rolF) && (!estadoF || u.estado === estadoF));
  return (
    <>
      <Tarjeta titulo="Crear usuario">
        <div className="fila">
          <div><label>Rol</label>
            <select value={f.rol} onChange={(e) => cambiarRol(e.target.value)}>
              <option value="estudiante">Estudiante</option><option value="tutor">Tutor de institución</option>
              <option value="docente">Docente asesor</option><option value="director">Director de programa</option>
              <option value="administrador">Administrador de sistemas</option>
            </select></div>
          <div><label>Nombre completo</label><input value={f.nombre_completo} onChange={(e) => setF({ ...f, nombre_completo: e.target.value })} /></div>
          <div><label>Correo institucional</label><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><label>Contraseña inicial (mín. 8 caracteres)</label>
            <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <button type="button" className="sec" onClick={() => setF({ ...f, password: contrasenaAleatoria() })}>Generar</button></div>
        </div>

        <h4>Datos del perfil ({f.rol})</h4>
        <div className="fila">
          {f.rol === 'estudiante' && <>
            <div><label>Código estudiantil</label><input value={perfil.codigo_estudiantil} onChange={campo('codigo_estudiantil')} /></div>
            <div><label>Programa académico</label>
              <select value={perfil.programa_id} onChange={campo('programa_id')}><option value="">Seleccione…</option>
                {programas.datos?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
              {prog && <span className="gris">{prog.facultad} · plan de {prog.creditos_totales} créditos</span>}</div>
            <div><label>Semestre actual</label><input type="number" min="1" max="14" value={perfil.semestre} onChange={campo('semestre')} /></div>
            <div><label>Créditos aprobados{prog ? ` (de ${prog.creditos_totales})` : ''}</label>
              <input type="number" min="0" max={prog?.creditos_totales} value={perfil.creditos_aprobados} onChange={campo('creditos_aprobados')} />
              {pct !== null && <span className="gris">= {pct}% del plan · para solicitar práctica se exige {prog.porcentaje_minimo}% y semestre {prog.semestre_minimo}</span>}</div>
          </>}
          {f.rol === 'tutor' && <>
            <div><label>Institución</label>
              <select value={perfil.institucion_id} onChange={campo('institucion_id')}><option value="">Seleccione…</option>
                {insts.datos?.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></div>
            <div><label>Cargo (opcional)</label><input value={perfil.cargo} onChange={campo('cargo')} /></div>
            <div><label>Teléfono (opcional)</label><input value={perfil.telefono} onChange={campo('telefono')} /></div>
          </>}
          {f.rol === 'docente' && <div><label>Área académica (opcional)</label><input value={perfil.area} onChange={campo('area')} /></div>}
          {f.rol === 'director' && <div><label>Programa académico (opcional)</label><input value={perfil.programa_academico} onChange={campo('programa_academico')} /></div>}
          {f.rol === 'administrador' && <p className="gris">El administrador no tiene datos de perfil: solo cuenta de acceso.</p>}
        </div>

        <p><button disabled={!f.nombre_completo || !f.email || f.password.length < 8} onClick={crear}>Crear usuario</button></p>
        {aviso}
        {creado && <p className="aviso ok">Entregue estas credenciales al usuario: <b>{creado.email}</b> / <b>{creado.password}</b> (rol {creado.rol}). La contraseña no se vuelve a mostrar.</p>}
      </Tarjeta>

      <Tarjeta titulo={`Usuarios registrados (${visibles.length} de ${lista.datos?.length ?? 0})`}>
        <Filtros filtros={filtros} buscar="Nombre o correo…" total={lista.datos?.length ?? 0} mostrados={visibles.length}
          selects={[
            { k: 'rol', etiqueta: 'Rol', opciones: [['', 'Todos los roles'], ...['estudiante', 'tutor', 'docente', 'director', 'administrador'].map((r) => [r, r])] },
            { k: 'estado', etiqueta: 'Estado', opciones: [['', 'Todos'], ['activo', 'Activos'], ['inactivo', 'Inactivos']] }]} />
        <table>
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
          <tbody>{visibles.map((u) => (
            <tr key={u.id}><td>{u.nombre_completo}</td><td>{u.email}</td><td><Insignia estado={u.rol} /></td><td><Insignia estado={u.estado} /></td><td>{fecha(u.fecha_creacion)}</td>
              <td>{u.id === usuario?.id
                ? <span className="gris">Su cuenta</span>
                : <>
                    <button className="sec" onClick={() => { setReset(u); setNueva(''); }}>Restablecer contraseña</button>
                    <button className={u.estado === 'activo' ? 'mal' : 'sec'} onClick={() => cambiarEstado(u)}>{u.estado === 'activo' ? 'Desactivar' : 'Activar'}</button>
                  </>}</td></tr>))}</tbody>
        </table>
      </Tarjeta>

      {entregar && <p className="aviso ok">Entregue la nueva contraseña a <b>{entregar.email}</b>: <b>{entregar.password}</b>. No se vuelve a mostrar.</p>}
      {reset && (
        <Modal titulo={`Restablecer la contraseña de ${reset.nombre_completo}`} acciones={<>
          <button className="sec" onClick={() => setReset(null)}>Cancelar</button>
          <button disabled={nueva.length < 8} onClick={restablecer}>Restablecer</button></>}>
          <label>Nueva contraseña (mín. 8 caracteres)</label>
          <input value={nueva} onChange={(e) => setNueva(e.target.value)} autoFocus />
          <button type="button" className="sec" onClick={() => setNueva(contrasenaAleatoria())}>Generar</button>
        </Modal>
      )}
    </>
  );
}
