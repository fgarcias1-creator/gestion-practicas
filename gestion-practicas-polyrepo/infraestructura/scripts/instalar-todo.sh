#!/usr/bin/env bash
# Crea el .env de cada repositorio (si no existe) e instala sus dependencias. Ejecutar desde infraestructura/
set -e
cd "$(dirname "$0")/../.."
for d in api-gateway servicio-identidad servicio-practicas servicio-seguimiento servicio-evaluacion servicio-reportes frontend infraestructura; do
  echo "==> $d"
  [ -f "$d/.env.example" ] && [ ! -f "$d/.env" ] && cp "$d/.env.example" "$d/.env"
  (cd "$d" && npm install --no-audit --no-fund)
done
echo "Listo. Siguiente: docker compose -f infraestructura/docker-compose.bases.yml up -d  y  (cd infraestructura && npm run db:init)"
