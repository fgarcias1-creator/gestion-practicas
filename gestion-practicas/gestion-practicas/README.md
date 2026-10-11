# Gestión de Prácticas Académicas — Backend

API REST en **Node.js/Express** con persistencia políglota: **PostgreSQL** (datos transaccionales) y **MongoDB** (sesiones, evidencias, bitácora, notificaciones y auditoría). Implementa la arquitectura SOA descrita en la sección 5.2 del documento: cada carpeta de `src/modules` es un servicio con su propio dominio y sus datos, listo para desplegarse de forma independiente en la Etapa 3.

| Servicio (módulo) | Motor | Requisitos |
|---|---|---|
| `identidad` | PostgreSQL | Autenticación JWT, usuarios y roles |
| `practicas` | PostgreSQL | RF01 solicitudes, RF02 asignación, RF03 instituciones y convenios |
| `seguimiento` | MongoDB | RF04 sesiones y evidencias, RF05 bitácora |
| `evaluacion` | PostgreSQL | RF06 evaluación del tutor y calificación del docente |
| `reportes` | PG + Mongo (agregador) | RF07 reportes filtrables y exportación CSV |
| `auditoria` | MongoDB | RNF03 historial inmutable y notificaciones |

## Puesta en marcha

```bash
docker compose up -d          # PostgreSQL 16 y MongoDB 7 (o use sus instalaciones locales)
npm install
cp .env.example .env          # ajuste credenciales si es necesario
npm run db:init               # crea el esquema y carga datos de demostración
npm run check                 # verifica la conexión a PostgreSQL y MongoDB
npm run dev                   # http://localhost:3000/api/v1
npm run test:crud            # CRUD de tablas básicas, verificado también directamente en las bases de datos
npm test                      # reinicia los datos y ejecuta la prueba de extremo a extremo (56 verificaciones; requiere el servidor en marcha)
```

**Windows:** si PowerShell bloquea `npm`, ejecute una vez `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`. PostgreSQL de Docker usa el puerto **5433** para no chocar con una instalación local en el 5432; el `.env` ya lo trae configurado.

Usuarios de demostración (contraseña **demo1234**): `director@udi.edu.co`, `docente@udi.edu.co`, `tutor@sanpedro.edu.co`, `tutor@clinicanorte.co`, `sergio@udi.edu.co` (práctica en curso), `fernando@udi.edu.co` (pendiente de asignación), `laura@udi.edu.co` (no cumple requisitos).

## Autenticación

`POST /auth/login` devuelve un JWT; envíelo en cada solicitud: `Authorization: Bearer <token>`. Cada ruta restringe los roles autorizados y los datos visibles (un estudiante solo ve lo suyo, un tutor solo sus estudiantes, etc.).

## Endpoints (`/api/v1`)

| Método y ruta | Rol | Descripción |
|---|---|---|
| POST `/auth/login`, GET `/auth/me` | todos | Sesión JWT |
| POST/GET/PATCH/DELETE `/usuarios` | director | CRUD de usuarios con su perfil de rol |
| GET `/estudiantes?estado=pendiente` | director, docente | Listado (insumo de RF02) |
| POST `/solicitudes` | estudiante | RF01: verifica semestre y créditos; responde 422 con los faltantes |
| PATCH `/solicitudes/:estudianteId/rechazar` | director, docente | Rechazo con motivo obligatorio y notificación |
| GET/POST/PUT/DELETE `/instituciones` (`?disponibles=true`) | director | RF03: CRUD de instituciones |
| POST `/instituciones/:id/convenios`; GET/PUT/DELETE `/convenios`; PATCH `/convenios/:id/prorrogar`; GET `/convenios/alertas` | director | RF03: convenios, filtro por estado, adendas y alertas |
| GET `/tutores`, GET `/docentes` | director | Catálogos para asignar |
| POST `/asignaciones`; GET `/asignaciones`; PATCH `/asignaciones/:id/finalizar` | director / cada rol | RF02: transacción con validación de convenio, cupo y tutor |
| POST `/sesiones` (multipart), PUT/DELETE `/sesiones/:id`, PATCH `/sesiones/:id/enviar`, POST `/sesiones/:id/reenviar` | estudiante | RF04: borrador, envío con evidencia (PDF/imagen ≤ 5 MB), reenvío como nueva entrega |
| PATCH `/sesiones/:id/validar`, PATCH `/sesiones/:id/rechazar`, GET `/sesiones-pendientes` | tutor | RF04/RNF01: validación en un clic |
| GET `/sesiones`, GET `/bitacora/:estudianteId` (`me`) | según rol | RF05: bitácora consolidada |
| POST `/evaluaciones`, GET `/evaluaciones` | tutor | Evaluación de desempeño (sin calificación) |
| GET `/calificaciones/consolidado/:asignacionId`, POST `/calificaciones`, POST `/calificaciones/:id/correccion`, GET `/calificaciones` | docente | RF06: calificación inmutable con corrección auditada |
| GET `/reportes/asignaciones` (`?formato=csv`) | director | RF07: filtros por institución, tutor, docente, estado y fechas |
| GET `/auditoria`, GET `/notificaciones` | director / todos | RNF03: historial de solo lectura |

## Cómo se cumple cada requisito no funcional

- **RNF01 (validación en un clic):** `PATCH /sesiones/:id/validar` no recibe cuerpo ni formularios.
- **RNF02 (evidencias inmutables):** `fecha_carga_servidor` y `fecha_envio` las genera el servidor (campo `immutable` en el esquema); una sesión enviada no se edita ni se elimina, y la corrección se reenvía como entrega nueva.
- **RNF03 (trazabilidad):** `logs_auditoria` es insert-only (los hooks del modelo bloquean updates y deletes y no existen rutas de modificación). Registra asignaciones, validaciones manuales y automáticas, evaluaciones y calificaciones.
- **RF04 (confirmación a las 24 h):** el job `src/jobs/autoconfirm.js` corre cada 10 minutos y marca `validacion_automatica: true`.
- **RF06 (calificación inmutable):** un trigger de PostgreSQL rechaza `UPDATE`/`DELETE` sobre `calificaciones`; la corrección inserta un registro nuevo con `calificacion_original_id` y justificación.
- **RNF05 (REST):** toda la comunicación pasa por `/api/v1`; en la versión distribuida, el módulo de evaluación consumiría al de seguimiento por HTTP en lugar de la llamada en proceso de `seguimiento.service.js`.

## Estructura

```
src/config/        env, conexión a PostgreSQL (con transacciones) y a MongoDB
src/db/            schema.sql (sección 8.2) e init.js (esquema + datos de demostración)
src/middleware/    auth (JWT y roles), validate (zod), error
src/modules/       identidad · practicas · seguimiento · evaluacion · reportes · auditoria
src/jobs/          confirmación automática de sesiones
tests/e2e.js       56 verificaciones sobre ambas bases de datos (resultados en tests/RESULTADOS.txt)
```
