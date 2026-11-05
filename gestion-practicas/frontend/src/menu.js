/** Opciones de la barra lateral de cada rol. `ruta` es la dirección y también la sección que muestra el panel. */
export const MENU = {
  estudiante: [{ ruta: 'solicitud', etiqueta: 'Solicitar práctica', icono: '📝' }, { ruta: 'seguimiento', etiqueta: 'Consultar seguimiento', icono: '📒' }],
  tutor: [{ ruta: 'estudiantes', etiqueta: 'Mis estudiantes', icono: '👥' }],
  docente: [{ ruta: 'estudiantes', etiqueta: 'Mis estudiantes', icono: '👥' }, { ruta: 'solicitudes', etiqueta: 'Solicitudes', icono: '📥' }],
  director: [
    { ruta: 'solicitudes', etiqueta: 'Solicitudes', icono: '📥' }, { ruta: 'asignaciones', etiqueta: 'Asignaciones', icono: '🧭' },
    { ruta: 'seguimiento', etiqueta: 'Seguimiento', icono: '📒' }, { ruta: 'instituciones', etiqueta: 'Instituciones', icono: '🏫' }, { ruta: 'reportes', etiqueta: 'Reportes', icono: '📊' },
  ],
  administrador: [
    { ruta: 'usuarios', etiqueta: 'Usuarios', icono: '👤' }, { ruta: 'instituciones', etiqueta: 'Instituciones', icono: '🏫' }, { ruta: 'programas', etiqueta: 'Programas', icono: '🎓' },
  ],
};
