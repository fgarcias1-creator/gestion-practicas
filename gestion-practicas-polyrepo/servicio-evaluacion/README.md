# servicio-evaluacion

RF06 evaluación del tutor y calificación del docente (con correcciones). Consume Seguimiento y Prácticas por REST. Base de datos: PostgreSQL.

Repositorio **independiente** (patrón polyrepo): tiene su propio `package.json`, Dockerfile y configuración; no importa código de otros servicios.
Se comunica con los demás únicamente por REST.

## Ejecutar
```bash
cp .env.example .env     # ajuste las variables
npm install
npm start                # puerto 3004
```
Salud: `GET http://localhost:3004/health`

## API
`POST /evaluaciones` · `GET /evaluaciones/:asignacionId` · `POST /calificaciones` · `POST /calificaciones/:id/correccion` · `GET /calificaciones[/:asignacionId]`

## Variables de entorno
```
PORT_EVALUACION=3004
PG_URL=postgres://practicas:practicas@localhost:5433/practicas
JWT_SECRET=cambie-este-secreto-en-produccion
INTERNAL_KEY=cambie-esta-clave-interna
URL_PRACTICAS=http://localhost:3002
URL_SEGUIMIENTO=http://localhost:3003
```
`JWT_SECRET` e `INTERNAL_KEY` deben ser **iguales en todos los servicios**.

## Docker
```bash
docker build -t servicio-evaluacion .
```
La orquestación completa está en el repositorio `infraestructura/`.

## RF06 · calificación por sesión
1. `POST /evaluaciones` (tutor): evalúa el desempeño, sin nota.
2. `GET /evaluaciones/:asignacionId`: sesiones validadas + notas por sesión + resumen (calificadas, promedio).
3. `POST /calificaciones/sesiones` (docente): nota 0.0-5.0 y retroalimentación de **una** sesión. Antes de publicar es un borrador (queda el historial); **después de publicar es una corrección**: exige `justificacion`, recalcula y publica una nueva nota final.
4. `POST /calificaciones` (docente) `{asignacion_id, retroalimentacion}`: confirma y publica la **nota final = promedio** (409 si falta la evaluación del tutor o alguna sesión por calificar).
5. `POST /calificaciones/:id/correccion`: corrección manual de la nota final (justificación obligatoria).
6. `GET /calificaciones/:asignacionId`: nota final, historial y notas por sesión (visibles cuando ya está publicada).
La tabla `calificaciones_sesion` es de solo inserción (trigger) y se crea sola al arrancar si falta.
