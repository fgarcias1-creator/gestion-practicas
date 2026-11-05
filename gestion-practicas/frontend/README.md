# frontend

React + Vite. Repositorio independiente: solo conoce la URL del **api-gateway**.

```bash
npm install
npm run dev      # http://localhost:5173 (proxy /api → http://localhost:3000, ver vite.config.js)
npm run build
```
Docker: `docker build -t frontend .` (nginx sirve la app y reenvía /api al gateway).

## Pruebas de interfaz
```bash
npm test      # pruebas de interfaz: Estudiante («Solicitar práctica»), Docente, Director y Administrador (permisos, usuarios, instituciones)
```

## Paneles por rol (`src/pages/`)
`Estudiante`, `Tutor`, `Docente`, `Director` (solicitudes, asignaciones, seguimiento, instituciones en **consulta**, reportes) y
`Administrador` (usuarios, instituciones y convenios, programas). `main.jsx` muestra el panel según el rol del JWT y `Layout.jsx` dibuja la **barra lateral** con las opciones de `menu.js`; cada opción es una ruta (`/usuarios`, `/asignaciones`…). Los **filtros** son el componente `Filtros` de `ui.jsx` (búsqueda sin tildes, listas y fechas). El servidor vuelve a validar cada acción.
