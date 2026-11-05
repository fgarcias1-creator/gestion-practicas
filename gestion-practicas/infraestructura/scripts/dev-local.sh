#!/usr/bin/env bash
# Arranca los 6 procesos Node (cada uno desde SU carpeta). Ctrl+C los detiene a todos. Requiere instalar-todo.sh y las bases arriba.
cd "$(dirname "$0")/../.."
trap 'kill 0' EXIT
for d in servicio-identidad servicio-practicas servicio-seguimiento servicio-evaluacion servicio-reportes api-gateway; do
  (cd "$d" && npm start 2>&1 | sed "s/^/[$d] /") &
done
wait
