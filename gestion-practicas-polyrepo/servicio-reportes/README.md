# servicio-reportes

RF07 reportes. No tiene base de datos: agrega Prácticas + Seguimiento + Evaluación solo por REST y exporta CSV.

Repositorio **independiente** (patrón polyrepo): tiene su propio `package.json`, Dockerfile y configuración; no importa código de otros servicios.
Se comunica con los demás únicamente por REST.

## Ejecutar
```bash
cp .env.example .env     # ajuste las variables
npm install
npm start                # puerto 3005
```
Salud: `GET http://localhost:3005/health`

## API
`GET /api/v1/reportes/asignaciones?estado&institucion_id&tutor_id&docente_id&desde&hasta[&formato=csv]`

## Variables de entorno
```
PORT_REPORTES=3005
JWT_SECRET=cambie-este-secreto-en-produccion
URL_PRACTICAS=http://localhost:3002
URL_SEGUIMIENTO=http://localhost:3003
URL_EVALUACION=http://localhost:3004
```
`JWT_SECRET` e `INTERNAL_KEY` deben ser **iguales en todos los servicios**.

## Docker
```bash
docker build -t servicio-reportes .
```
La orquestación completa está en el repositorio `infraestructura/`.
