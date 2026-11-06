# servicio-seguimiento

RF04 sesiones y evidencias · RF05 bitácora · RNF01 validación en un clic · RNF02 hora del servidor · RNF03 auditoría insert-only. Base de datos: MongoDB.

Repositorio **independiente** (patrón polyrepo): tiene su propio `package.json`, Dockerfile y configuración; no importa código de otros servicios.
Se comunica con los demás únicamente por REST.

## Evidencias y borradores
- La evidencia puede ser de **cualquier formato** (documentos, imágenes, video, audio, comprimidos…); límite `MAX_EVIDENCIA_MB` por archivo (5 por defecto), 5 archivos por envío y 10 por sesión. Se descargan siempre como adjunto (`nosniff`) y solo con sesión iniciada y alcance sobre la sesión.
- Un **borrador** se puede volver a editar: `PUT /sesiones/:id` (fecha, horas, resumen, `quitar` = JSON con los archivos a quitar y nuevas `evidencias`); con `enviar=true` además lo envía al tutor. Una sesión enviada ya no se edita (RNF02).
- El **PDF** de la bitácora (`GET /bitacora/:estudianteId/pdf`) trae cada sesión enviada con su estado, observación del tutor y calificación del docente, y **nunca incluye borradores**.
- `GET /auditoria` sigue existiendo (solo administrador) para consulta técnica, aunque la pantalla de auditoría se retiró del frontend.

## Ejecutar
```bash
cp .env.example .env     # ajuste las variables
npm install
npm start                # puerto 3003
npm run db:init        # (opcional) crea colecciones e índices en MongoDB
```
Salud: `GET http://localhost:3003/health`

## API
`/sesiones` (+`/enviar`, `/validar`, `/rechazar`, evidencias) · `/bitacora` · `/auditoria` (solo administrador) · rutas internas `/internal/confirmar-vencidas`

## Variables de entorno
```
PORT_SEGUIMIENTO=3003
MONGO_URL=mongodb://localhost:27017/practicas_seguimiento
JWT_SECRET=cambie-este-secreto-en-produccion
INTERNAL_KEY=cambie-esta-clave-interna
URL_PRACTICAS=http://localhost:3002
URL_EVALUACION=http://localhost:3004
HORAS_REQUERIDAS=160
MAX_EVIDENCIA_MB=5
```
`JWT_SECRET` e `INTERNAL_KEY` deben ser **iguales en todos los servicios**.

## Docker
```bash
docker build -t servicio-seguimiento .
```
La orquestación completa está en el repositorio `infraestructura/`.

## Novedades
- **Notificaciones** (colección `notificaciones`): `GET /notificaciones`, `PATCH /notificaciones/leidas`, `PATCH /notificaciones/:id/leida`; ruta interna `POST /internal/notificaciones` (la usan Prácticas y Evaluación).
- La fecha de una sesión **no puede ser anterior al inicio de la práctica** ni futura.
- Las **horas requeridas** de la bitácora salen del programa del estudiante (`HORAS_REQUERIDAS` queda solo como valor por defecto).
- Se avisa al tutor cuando llega una sesión y al estudiante cuando se valida o se devuelve.

- **PDF de la bitácora** (RF05): `GET /bitacora/:estudianteId/pdf` (estudiante, docente asesor y director, según su alcance). El JSON y el PDF salen de la misma función; la bitácora incluye la nota de cada sesión cuando ya se publicó la nota final.
- La confirmación automática a las 24 h avisa al estudiante.
