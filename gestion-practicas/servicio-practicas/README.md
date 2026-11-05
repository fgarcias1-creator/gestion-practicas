# servicio-practicas

RF01 solicitud de práctica · RF02 asignación · RF03 instituciones y convenios. Base de datos: PostgreSQL.

Repositorio **independiente** (patrón polyrepo): tiene su propio `package.json`, Dockerfile y configuración; no importa código de otros servicios.
Se comunica con los demás únicamente por REST.

## Ejecutar
```bash
cp .env.example .env     # ajuste las variables
npm install
npm start                # puerto 3002
```
Salud: `GET http://localhost:3002/health`

## API
`/solicitudes` · `/instituciones` · `/convenios` (+`/alertas`, adenda) · `/asignaciones` (+`/mia`, `/reasignar`, `/estado`) · `/catalogos/tutores|docentes` · rutas internas `/internal/perfil`

## Variables de entorno
```
PORT_PRACTICAS=3002
PG_URL=postgres://practicas:practicas@localhost:5433/practicas
JWT_SECRET=cambie-este-secreto-en-produccion
INTERNAL_KEY=cambie-esta-clave-interna
URL_SEGUIMIENTO=http://localhost:3003
MAX_ESTUDIANTES_TUTOR=3
MAX_ESTUDIANTES_DOCENTE=10
NOMBRE_PRACTICA=Práctica Profesional
```
`JWT_SECRET` e `INTERNAL_KEY` deben ser **iguales en todos los servicios**.

## Docker
```bash
docker build -t servicio-practicas .
```
La orquestación completa está en el repositorio `infraestructura/`.

## Caso de uso «Solicitar práctica» (Astah)
- `GET /solicitudes/mia`: estado de cada requisito (cumple / no cumple), datos automáticos de la práctica (nombre, semestre de ejecución, período vigente) y si puede enviar.
- `POST /solicitudes`: valida flujo 1a (ya existe una) y 2a (requisitos) y registra la solicitud asociada a **práctica, semestre y período** en una sola sentencia atómica (sin registros parciales).
- El bloqueo de nuevas solicitudes es **por período lectivo**: en trámite/aprobada siempre bloquea; rechazada bloquea solo en el mismo período.
- Al arrancar, el servicio agrega (si faltan) las columnas `solicitud_practica`, `solicitud_semestre`, `solicitud_periodo` y `fecha_solicitud` a `estudiantes`, por lo que una base ya creada se actualiza sola.

## Modelo académico
- Cada estudiante pertenece a un **programa** (tabla `programas`: facultad, créditos del plan, semestre mínimo, % mínimo de créditos y horas de práctica). Los requisitos de la solicitud ya **no son globales**: dependen del programa.
- Del estudiante se guardan los **créditos aprobados** (número); el porcentaje se calcula contra el plan, así que no puede superar 100 %.
- `GET /programas` (administrador, director, docente); `POST /programas` y `PUT /programas/:id` solo **administrador**. Cada programa tiene `nombre_practica` («Práctica Profesional» o «Práctica Pedagógica» en las licenciaturas). Al arrancar se agregan, si faltan, las licenciaturas de ejemplo. Las horas requeridas del programa viajan en `/asignaciones` (`horas_requeridas`) y las usa Seguimiento.
- **Asignar práctica (Astah):** `E1` institución sin convenio vigente o sin cupos → 409 «La institución seleccionada no cuenta con cupos vigentes»; `E2` tutor/docente con carga completa → **advertencia** (`advertencias`) sin bloquear; reasignar antes del inicio libera el cupo anterior; al asignar/reasignar se notifica a estudiante, tutor, docente y se registra el aviso (simulado) a la institución.
- La lista de espera (`GET /solicitudes`) sale en **orden de llegada**.

## Permisos de instituciones y convenios (RF03)
`POST/PUT /instituciones`, `PATCH /instituciones/:id/inhabilitar`, `POST /convenios` y `PATCH /convenios/:id/adenda` son **solo del administrador**.
Director y docente únicamente **consultan** (`GET /instituciones`, `GET /convenios`). La pantalla ya no muestra avisos de convenios por vencer.
La asignación de práctica (RF02) y los catálogos de tutores/docentes siguen siendo del **director**.

## Correo (RF01 y RF02)
Se envía correo al estudiante cuando se **rechaza o devuelve** su solicitud, y a **estudiante, tutor e institución** al asignar o reasignar.
Variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Sin `SMTP_HOST` el correo queda **simulado** (consola y auditoría). Un fallo de correo nunca bloquea la operación.
Con Docker, los correos llegan a **MailHog**: http://localhost:8025.
