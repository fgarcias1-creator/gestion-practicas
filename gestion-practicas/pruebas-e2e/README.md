# pruebas-e2e
Repositorio independiente. Prueba RF01–RF07 y RNF01–RNF03 **solo por HTTP** a través del Gateway (más un acceso a Mongo para simular el paso de 24 h).

```bash
cp .env.example .env && npm install
# con TODO el sistema arriba y datos limpios:  (cd ../infraestructura && npm run db:init)
npm test
```
Cada ejecución modifica datos: repita `npm run db:init` en `infraestructura/` antes de volver a correrlas.
