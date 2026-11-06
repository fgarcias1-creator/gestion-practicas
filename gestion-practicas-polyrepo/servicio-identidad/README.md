# servicio-identidad

Autenticación (login → JWT) y gestión de usuarios por rol. Base de datos: PostgreSQL (tabla `usuarios`).

Repositorio **independiente** (patrón polyrepo): tiene su propio `package.json`, Dockerfile y configuración; no importa código de otros servicios.
Se comunica con los demás únicamente por REST.

## Ejecutar
```bash
cp .env.example .env     # ajuste las variables
npm install
npm start                # puerto 3001
```
Salud: `GET http://localhost:3001/health`

## API
`POST /api/v1/auth/login` · `GET /api/v1/auth/me` · y, **solo para el rol `administrador`**:
`POST /api/v1/auth/registro` · `GET /api/v1/usuarios` · `PATCH /api/v1/usuarios/:id/estado` (`activo`/`inactivo`; nadie puede desactivarse a sí mismo) · `PATCH /api/v1/usuarios/:id/password`

Roles: `estudiante`, `tutor`, `docente`, `director`, `administrador`. El administrador no tiene perfil (no consulta a Prácticas).
Al arrancar amplía el CHECK de `usuarios.rol` y, si no existe ningún administrador y están definidas `ADMIN_EMAIL` y `ADMIN_PASSWORD`, crea el primero.

## Variables de entorno
```
PORT_IDENTIDAD=3001
PG_URL=postgres://practicas:practicas@localhost:5433/practicas
JWT_SECRET=cambie-este-secreto-en-produccion
JWT_EXPIRES=8h
INTERNAL_KEY=cambie-esta-clave-interna
URL_PRACTICAS=http://localhost:3002
URL_SEGUIMIENTO=http://localhost:3003
ADMIN_EMAIL=admin@udi.edu.co
ADMIN_PASSWORD=Practicas2026*
ADMIN_NOMBRE=Administrador del sistema
```
`JWT_SECRET` e `INTERNAL_KEY` deben ser **iguales en todos los servicios**.

## Docker
```bash
docker build -t servicio-identidad .
```
La orquestación completa está en el repositorio `infraestructura/`.
