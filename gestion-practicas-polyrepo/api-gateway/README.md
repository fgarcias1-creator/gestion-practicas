# api-gateway

Punto único de entrada. Valida el JWT y enruta cada /api/v1/<recurso> al servicio dueño del dominio. No tiene base de datos.

Repositorio **independiente** (patrón polyrepo): tiene su propio `package.json`, Dockerfile y configuración; no importa código de otros servicios.
Se comunica con los demás únicamente por REST.

## Ejecutar
```bash
cp .env.example .env     # ajuste las variables
npm install
npm start                # puerto 3000
```
Salud: `GET http://localhost:3000/health`

## API
Proxy de `/api/v1/auth|usuarios` → Identidad · `solicitudes|instituciones|convenios|asignaciones|catalogos` → Prácticas · `sesiones|bitacora|auditoria` → Seguimiento · `evaluaciones|calificaciones` → Evaluación · `reportes` → Reportes. Las rutas `/internal` NO se exponen.

## Variables de entorno
```
PORT_GATEWAY=3000
JWT_SECRET=cambie-este-secreto-en-produccion
URL_IDENTIDAD=http://localhost:3001
URL_PRACTICAS=http://localhost:3002
URL_SEGUIMIENTO=http://localhost:3003
URL_EVALUACION=http://localhost:3004
URL_REPORTES=http://localhost:3005
```
`JWT_SECRET` e `INTERNAL_KEY` deben ser **iguales en todos los servicios**.

## Docker
```bash
docker build -t api-gateway .
```
La orquestación completa está en el repositorio `infraestructura/`.
