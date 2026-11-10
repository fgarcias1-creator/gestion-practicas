#!/usr/bin/env bash
# Convierte cada carpeta en un repositorio Git independiente (polyrepo). Luego añada el remoto de GitHub de cada uno.
cd "$(dirname "$0")/../.."
for d in api-gateway servicio-identidad servicio-practicas servicio-seguimiento servicio-evaluacion servicio-reportes frontend infraestructura pruebas-e2e; do
  [ -d "$d/.git" ] || (cd "$d" && git init -q && git add . && git commit -q -m "Commit inicial: $d" && echo "repo creado: $d")
done
echo "Ejemplo: cd servicio-identidad && git remote add origin https://github.com/<usuario>/servicio-identidad.git && git push -u origin main"
