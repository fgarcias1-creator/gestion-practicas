# Guía paso a paso — Gestión de Prácticas Académicas

Esta guía sirve para **levantar el proyecto en su computador** y probar el flujo completo con el nuevo rol **Administrador**.

> **Cambio principal de esta versión**
> Ahora existe un usuario **Administrador** (personal de sistemas de la universidad). Solo él **crea los usuarios** (estudiantes, docentes, tutores, directores) y **registra instituciones y convenios**.
> El **Director** ya no hace nada de eso: únicamente **aprueba o rechaza solicitudes** y **asigna la institución, el tutor y el docente** al estudiante.

## Novedades de esta versión
1. **Barra lateral** en todos los roles: a la izquierda aparecen solo las funciones de cada rol.
2. **Filtros de búsqueda** en las listas (texto, estado/rol/programa y fechas, según la lista).
3. **Administrador:** se quitó la sección de Auditoría.
4. **Estudiante:** evidencias de **cualquier formato**; los **borradores se pueden volver a editar** y enviar; el **PDF** trae las sesiones con sus calificaciones y **sin borradores**.

---

## 0. Quién puede hacer qué

| Acción | Administrador | Director | Docente | Tutor | Estudiante |
|---|:-:|:-:|:-:|:-:|:-:|
| Crear usuarios, activar/desactivar cuentas, restablecer contraseñas | ✅ | ❌ | ❌ | ❌ | ❌ |
| Crear instituciones, convenios, adendas, cupos | ✅ | ❌ (solo consulta) | ❌ | ❌ | ❌ |
| Aprobar / rechazar / devolver solicitudes | ❌ | ✅ | ✅ (rechazar/devolver) | ❌ | ❌ |
| Asignar institución + tutor + docente al estudiante | ❌ | ✅ | ❌ | ❌ | ❌ |
| Solicitar práctica y subir sesiones | ❌ | ❌ | ❌ | ❌ | ✅ |
| Validar sesiones y evaluar desempeño | ❌ | ❌ | ❌ | ✅ | ❌ |
| Calificar y publicar nota final | ❌ | ❌ | ✅ | ❌ | ❌ |
| Reportes | ❌ | ✅ | ❌ | ❌ | ❌ |
| Programas académicos (incluye licenciaturas) | ✅ | ❌ (solo los ve al asignar) | ❌ | ❌ | ❌ |

Estas reglas las valida **el servidor** en cada petición (si alguien intenta llamar la API directamente con otro rol, recibe error 403).

---

## 1. Qué necesita instalar

**Para la opción A (recomendada, todo con Docker):**
1. **Docker Desktop** (Windows, Mac o Linux): https://www.docker.com/products/docker-desktop
   - En Windows pide activar WSL 2; acepte lo que sugiera el instalador y reinicie si se lo pide.
2. Nada más. Docker descarga PostgreSQL, MongoDB y Node por usted.

**Para la opción B (desarrollo, sin construir imágenes de los servicios):**
- Docker Desktop (solo para las bases de datos)
- **Node.js 20 o superior** (recomendado 22): https://nodejs.org
- En Windows, **Git Bash** (viene con Git: https://git-scm.com) si quiere usar los scripts `.sh`.

Compruebe las versiones abriendo una terminal (PowerShell, CMD, Terminal o Git Bash):
```bash
docker --version
docker compose version
node -v        # solo opción B
```

---

## 2. Descomprimir el proyecto

1. Descomprima `gestion-practicas-polyrepo-con-administrador.zip` (por ejemplo en `C:\proyectos\` o en su carpeta personal).
2. Evite rutas con tildes o espacios muy largos.
3. Debe quedar una carpeta `gestion-practicas-polyrepo` con subcarpetas como `api-gateway`, `servicio-identidad`, `frontend`, `infraestructura`, etc.

---

## 3. Opción A — Todo con Docker (recomendada)

### Paso 1. Abra Docker Desktop
Espere a que diga **“Engine running”** (el icono de la ballena queda fijo).

### Paso 2. Abra una terminal en la carpeta `infraestructura`
```bash
cd gestion-practicas-polyrepo/infraestructura
```

### Paso 3. Cree el archivo de configuración `.env`
- Mac / Linux / Git Bash:
  ```bash
  cp .env.example .env
  ```
- Windows PowerShell o CMD:
  ```bat
  copy .env.example .env
  ```

### Paso 4. (Opcional pero recomendado) Cambie las claves
Abra `.env` con el Bloc de notas o VS Code y cambie al menos:
```
JWT_SECRET=una-frase-larga-y-unica
INTERNAL_KEY=otra-frase-larga-y-unica
ADMIN_EMAIL=admin@udi.edu.co
ADMIN_PASSWORD=UnaClaveFuerte2026*
```
> Si va a **probar rápido**, puede dejarlo como está: la contraseña de todos los usuarios demo es `Practicas2026*`.
> Si cambia `ADMIN_PASSWORD` **después** de la primera ejecución, no afecta al admin demo ya creado (use el botón *Restablecer contraseña* del panel).

### Paso 5. Construya y levante todo
```bash
docker compose up --build -d
```
La primera vez tarda varios minutos (descarga imágenes e instala dependencias). Qué se levanta:
- PostgreSQL y MongoDB
- `db-init` (crea tablas y datos demo **solo si la base está vacía**, y termina)
- 5 microservicios + API Gateway
- Frontend (nginx)
- MailHog (bandeja de correos de prueba)

### Paso 6. Verifique que todo está arriba
```bash
docker compose ps
```
Todos los servicios deben decir `running` (y `db-init` aparece como `exited (0)`, que es lo correcto).
Si algo falla, vea la sección 8.

### Paso 7. Abra la aplicación
- **Aplicación:** http://localhost:8080
- **Correos de prueba (MailHog):** http://localhost:8025
- API Gateway: http://localhost:3000/health

### Paso 8. Ingrese con el administrador
Correo `admin@udi.edu.co` · Contraseña `Practicas2026*`

---

## 4. Primer recorrido (para comprobar que todo funciona)

### 4.1 Como **Administrador** (`admin@udi.edu.co`)
1. Menú lateral → **Programas**: ya vienen las licenciaturas (Educación Infantil, Ciencias Naturales, Matemáticas, Lenguas Extranjeras) y las demás carreras de ejemplo. Ajuste créditos del plan, semestre mínimo, porcentaje del plan que el estudiante debe tener aprobado para solicitar la práctica (el formulario muestra cuántos créditos equivale) y horas, o cree otras (*Nuevo programa*).
2. Menú lateral → **Instituciones** → *Nueva institución* (NIT, razón social, cupos) → **Crear**.
3. En *Nuevo convenio* elija la institución, fecha de inicio y de fin → **Crear convenio**.
   (Una institución solo puede recibir estudiantes con convenio vigente y cupos.)
4. Menú lateral → **Usuarios** → *Crear usuario*:
   - Rol **Tutor de institución** (elija la institución del paso 1).
   - Rol **Docente asesor**.
   - Rol **Director de programa**.
   - Rol **Estudiante** (programa —por ejemplo una licenciatura—, semestre y créditos aprobados; el % se calcula solo).
   - Use **Generar** para una contraseña aleatoria y **entregue las credenciales** que muestra la pantalla (no se vuelven a mostrar).
5. En la lista de usuarios puede **Desactivar/Activar** una cuenta y **Restablecer contraseña**.

### 4.2 Como **Estudiante** (por ejemplo `estudiante1@udi.edu.co`)
- *Solicitar práctica*. Si cumple los requisitos del programa, queda **pendiente de asignación**.

### 4.3 Como **Director** (`director@udi.edu.co`)
1. Menú lateral → **Solicitudes** → seleccione al estudiante → elija **institución, tutor y docente** y la fecha de inicio → **Asignar práctica**.
   - También puede **Devolver** (para corregir) o **Rechazar** (con motivo obligatorio).
2. Verá que *Instituciones* es **solo de consulta** y que **no existe** la opción *Usuarios* en su menú.
3. Revise el correo que recibió el estudiante en http://localhost:8025.

### 4.4 Siguientes pasos del flujo
- **Estudiante** (menú *Consultar seguimiento*): registra sesiones con evidencia de **cualquier formato** (≤ 5 MB por archivo).
  - *Guardar borrador* deja la sesión sin enviar. En la tabla, el borrador tiene **Editar**: cambie fecha, horas o resumen, quite o agregue evidencias y pulse **Guardar y enviar al tutor** (o *Guardar cambios* para seguir después).
  - **Descargar PDF**: trae la bitácora con cada sesión enviada, la observación del tutor y la calificación del docente. **No incluye borradores.**
- **Tutor** (`tutor@santaana.com`): valida o rechaza sesiones y evalúa desempeño.
- **Docente** (`docente@udi.edu.co`): califica cada sesión y publica la nota final.
- **Director:** *Seguimiento* (ver bitácora y descargar PDF) y *Reportes* (CSV).

---

### 4.5 Barra lateral y filtros (para probar)
- Entre con cada rol y compruebe que el menú de la izquierda cambia: administrador (Usuarios, Instituciones, Programas), director (Solicitudes, Asignaciones, Seguimiento, Instituciones, Reportes), docente (Mis estudiantes, Solicitudes), tutor (Mis estudiantes), estudiante (Solicitar práctica, Consultar seguimiento).
- En cualquier lista use el cuadro **Buscar** (no distingue tildes ni mayúsculas), las listas desplegables y, donde aparece, **Desde/Hasta**. El texto «Mostrando X de Y» indica cuántos resultados quedan; **Limpiar filtros** los quita.

## 5. Usuarios demo

Contraseña de todos: **`Practicas2026*`**

| Rol | Correo |
|---|---|
| Administrador | `admin@udi.edu.co` |
| Director | `director@udi.edu.co` |
| Docente | `docente@udi.edu.co` |
| Tutor | `tutor@santaana.com` |
| Estudiante | `estudiante1@udi.edu.co` … `estudiante4@udi.edu.co` |

---

## 6. Si ya tenía la versión anterior corriendo

**Opción 1 — Conservar los datos** (recomendada):
```bash
cd gestion-practicas-polyrepo/infraestructura
docker compose up --build -d
```
Al arrancar, `servicio-identidad` actualiza la restricción de roles y crea el administrador de `ADMIN_EMAIL`/`ADMIN_PASSWORD` si todavía no existe ninguno. Si usa el `.env` anterior, agregue estas dos líneas:
```
ADMIN_EMAIL=admin@udi.edu.co
ADMIN_PASSWORD=Practicas2026*
```
> Los directores antiguos conservan su cuenta, pero **ya no podrán crear usuarios ni instituciones**: pídaselo al administrador.

**Opción 2 — Empezar desde cero** (borra TODOS los datos y recarga los datos demo):
```bash
docker compose down -v
docker compose up --build -d
```

---

## 7. Opción B — Servicios con npm (para desarrollar)

1. **Bases de datos con Docker** (desde `infraestructura`):
   ```bash
   docker compose -f docker-compose.bases.yml up -d
   ```
2. **Instalar dependencias y crear los `.env`** de cada carpeta:
   ```bash
   bash scripts/instalar-todo.sh
   ```
   *(Sin Git Bash: entre a cada carpeta —`api-gateway`, `servicio-identidad`, `servicio-practicas`, `servicio-seguimiento`, `servicio-evaluacion`, `servicio-reportes`, `frontend`, `infraestructura`— copie `.env.example` a `.env` y ejecute `npm install`.)*
3. **Crear tablas y datos demo** (borra y recrea el esquema):
   ```bash
   npm run db:init
   ```
4. **Arrancar los 6 servicios:**
   ```bash
   bash scripts/dev-local.sh
   ```
   *(Sin Git Bash: una terminal por carpeta con `npm start`, en este orden: identidad, prácticas, seguimiento, evaluación, reportes, api-gateway.)*
5. **Arrancar el frontend** en otra terminal:
   ```bash
   cd ../frontend
   npm run dev
   ```
   Abra http://localhost:5173 e ingrese con `admin@udi.edu.co`.

> En la opción B no hay MailHog: los correos quedan **simulados** (se ven en la consola de `servicio-practicas`).

---

## 8. Pruebas

**Pruebas de interfaz** (no necesitan el sistema levantado):
```bash
cd frontend
npm install
npm test
```

**Prueba de extremo a extremo** (necesita el sistema levantado y los datos demo **recién creados**):
```bash
cd pruebas-e2e
npm install
cp .env.example .env        # en Windows: copy .env.example .env
npm test
```
Si cambió `INTERNAL_KEY` en `infraestructura/.env`, ponga el mismo valor en `pruebas-e2e/.env`.
Incluye las verificaciones de permisos del administrador (el director, docente, tutor y estudiante reciben **403** al crear usuarios, instituciones o programas, o al consultar la auditoría). Cada ejecución crea un usuario de prueba, por lo que para repetirla debe recargar los datos demo (`docker compose down -v` y `up --build -d`, o `npm run db:init`).

---

## 9. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Cannot connect to the Docker daemon` | Docker Desktop apagado | Ábralo y espere “Engine running”. |
| `port is already allocated` (8080, 3000-3005, 5433, 27017, 8025, 1025) | Otro programa usa ese puerto | Ciérrelo, o cambie el puerto a la izquierda en `docker-compose.yml` (ej.: `"8081:80"`). |
| La página no carga o dice “Servicio no disponible” | Un servicio aún arranca o falló | `docker compose ps` y luego `docker compose logs servicio-identidad` (o el servicio que falle). Espere 30–60 s tras el primer arranque. |
| “Credenciales inválidas” con el admin | Base creada antes de esta versión, o contraseña cambiada | Revise `ADMIN_EMAIL`/`ADMIN_PASSWORD` en `.env` y reinicie: `docker compose up -d --build servicio-identidad`. Si no hay administradores, se crea al arrancar. |
| El director ve “No tiene permisos” al crear usuarios | Es lo correcto en esta versión | Entre como administrador. |
| `db-init` termina con error | PostgreSQL aún no estaba listo | `docker compose up -d` otra vez; si persiste, `docker compose logs db-init`. |
| Quiero empezar limpio | — | `docker compose down -v` borra bases y archivos subidos. |
| Cambié código y no se refleja | Imagen vieja | `docker compose up --build -d`. |

Comandos útiles (desde `infraestructura`):
```bash
docker compose logs -f servicio-practicas   # ver el registro de un servicio
docker compose restart api-gateway          # reiniciar un servicio
docker compose down                          # detener (conserva datos)
docker compose down -v                       # detener y BORRAR datos
```

---

## 10. Antes de publicarlo para usuarios reales
- Cambie `JWT_SECRET`, `INTERNAL_KEY` y `ADMIN_PASSWORD` por valores largos y secretos (no los suba a Git).
- Cambie la contraseña de cada usuario demo o elimine esos usuarios.
- Configure correo real en `servicio-practicas` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
- Publique detrás de HTTPS (por ejemplo con un proxy inverso) y no exponga las bases de datos ni los puertos 3001-3005.
- Entregue las cuentas de **administrador** solo al personal de sistemas autorizado.
