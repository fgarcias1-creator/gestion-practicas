# Gestión de Prácticas Académicas — Arquitectura Polyrepo

Cada microservicio es un **proyecto independiente** (su propio repositorio): propio `package.json`, `node_modules`, Dockerfile, `.env`
y README. No existe código compartido entre carpetas; las pocas utilidades comunes (JWT, errores, cliente REST) están copiadas en
`src/lib/` de cada servicio. La única forma de colaborar es **REST**.

```
gestion-practicas-polyrepo/
├── api-gateway/            :3000  entrada única, valida JWT y enruta
├── servicio-identidad/     :3001  login/JWT, usuarios            (PostgreSQL)
├── servicio-practicas/     :3002  RF01 RF02 RF03                 (PostgreSQL)
├── servicio-seguimiento/   :3003  RF04 RF05 RNF01-03             (MongoDB)
├── servicio-evaluacion/    :3004  RF06                           (PostgreSQL)
├── servicio-reportes/      :3005  RF07                           (sin BD)
├── frontend/               :5173 / :8080  React
├── infraestructura/        docker-compose, esquema SQL, datos demo, scripts
└── pruebas-e2e/            pruebas de extremo a extremo por HTTP
```

## Opción A — Todo con Docker (recomendada)
```bash
cd infraestructura
cp .env.example .env
docker compose up --build -d      # bases + db-init (solo si están vacías) + 6 servicios + frontend
```
Abra **http://localhost:8080**. Usuarios demo (contraseña `Practicas2026*`): `admin@udi.edu.co`, `director@udi.edu.co`, `docente@udi.edu.co`,
`tutor@santaana.com`, `estudiante1@udi.edu.co` … `estudiante4@udi.edu.co`.

## Opción B — Servicios con npm (desarrollo)
```bash
cd infraestructura
docker compose -f docker-compose.bases.yml up -d     # solo PostgreSQL y MongoDB
bash scripts/instalar-todo.sh                        # .env + npm install en cada carpeta
npm run db:init                                      # esquema + datos demo
bash scripts/dev-local.sh                            # arranca los 6 servicios (Ctrl+C los detiene)
# en otra terminal:  cd ../frontend && npm run dev   -> http://localhost:5173
```
Sin el script (p. ej. Windows): abra una terminal por carpeta y ejecute `npm install && npm start` en cada servicio.

## Correo de pruebas (MailHog)
Con `docker compose`, los correos de rechazo y de asignación llegan a la bandeja de pruebas **http://localhost:8025**. Para correo real configure `SMTP_*` en `servicio-practicas`.

## Modelo universitario y trazabilidad
Los 10 casos de uso de Astah y su estado están en **TRAZABILIDAD_CASOS_DE_USO.md**. El sistema modela programas académicos (facultad, créditos del plan,
requisitos y horas), créditos aprobados (el % se calcula), período lectivo, lista de espera, tutor de la institución / docente asesor y notificaciones (campana 🔔).

## Roles y permisos
| Rol | Qué hace | Qué NO puede hacer |
|---|---|---|
| **Administrador** (personal de sistemas) | Crea y gestiona **usuarios** (estudiantes, tutores, docentes, directores y otros administradores: crear, activar/desactivar, restablecer contraseña) y registra **instituciones, convenios, adendas y cupos** y los **programas académicos** (ingenierías, licenciaturas…). | Aprobar/rechazar solicitudes, asignar prácticas, calificar. |
| **Director** | Aprueba o rechaza (o devuelve) solicitudes y **asigna institución, tutor y docente** al estudiante. Consulta seguimiento y reportes; consulta (sin modificar) instituciones y convenios. | Crear usuarios, crear/modificar instituciones o convenios. |
| Docente | Rechaza/devuelve solicitudes, califica sesiones y publica la nota final. | Crear usuarios, instituciones, asignar. |
| Tutor | Valida sesiones y evalúa el desempeño. | — |
| Estudiante | Solicita la práctica y registra sus sesiones. | — |

### Programas (incluye licenciaturas)
El catálogo trae ejemplos: Ingeniería de Sistemas, Administración de Empresas, Contaduría Pública y las licenciaturas en **Educación Infantil, Ciencias Naturales, Matemáticas y Lenguas Extranjeras** (Facultad de Educación, «Práctica Pedagógica», 240 h). Son valores de ejemplo: el administrador los ajusta o agrega más (p. ej. Educación Física) en la opción **Programas**. Los requisitos de la solicitud (semestre mínimo, % de créditos) y las horas salen del programa de cada estudiante.

El control se aplica **en el servidor** (cada ruta valida el rol del JWT): ocultar un botón en pantalla no es lo que protege el sistema.
El administrador **no tiene perfil académico**: solo una cuenta de acceso (`rol = administrador`).

## Crear usuarios (estudiantes, tutores, docentes, directores y administradores)
Entre como **administrador** (`admin@udi.edu.co`) → opción **Usuarios** del menú lateral → elija el rol, complete nombre, correo y contraseña (botón *Generar* para una aleatoria) y los
datos del perfil del rol (el estudiante requiere **programa, semestre y créditos aprobados**; el tutor, una institución). Al crear, la pantalla muestra las credenciales para entregarlas al usuario.
Por detrás llama a `POST /api/v1/auth/registro` (solo administrador; Identidad crea la cuenta y Prácticas el perfil; si el perfil falla, la cuenta se deshace).
Crear un tutor exige que la institución exista: créela antes en la opción *Instituciones* (también del administrador).
En *Usuarios* puede **desactivar/activar** cuentas y **restablecer contraseñas**.

### Primer administrador
- Base nueva: `db:init` / `db-init` crea `admin@udi.edu.co` (contraseña demo `Practicas2026*`).
- Base ya existente (versión anterior): al arrancar, `servicio-identidad` amplía el CHECK de `usuarios.rol` y, si no hay ningún administrador, crea el de `ADMIN_EMAIL` / `ADMIN_PASSWORD` (`infraestructura/.env`). No se pierden datos.
- **Cambie `ADMIN_PASSWORD` (y `JWT_SECRET`, `INTERNAL_KEY`) antes de publicar el sistema.**

## Convertirlos en repositorios Git independientes
```bash
bash infraestructura/scripts/crear-repos-git.sh      # git init + commit inicial en cada carpeta
```

## Reglas del polyrepo
- Cada repo se instala, prueba y despliega por separado (`docker build` desde su propia carpeta).
- `JWT_SECRET` e `INTERNAL_KEY` deben ser iguales en todos los servicios (el compose los inyecta).
- Un servicio **nunca** importa archivos de otro: se hablan por `/api/v1/...` (las rutas `/internal` no pasan por el Gateway).
- Un cambio en una utilidad común (p. ej. `src/lib/auth.js`) se replica a mano en cada servicio: es el costo del polyrepo.

## Navegación y filtros
- **Barra lateral por rol**: cada rol ve a la izquierda solo sus funciones (administrador: Usuarios, Instituciones, Programas · director: Solicitudes, Asignaciones, Seguimiento, Instituciones, Reportes · docente: Mis estudiantes, Solicitudes · tutor: Mis estudiantes · estudiante: Solicitar práctica, Consultar seguimiento). Cada opción es una dirección (`/usuarios`, `/asignaciones`…), por lo que funciona el botón «Atrás». En pantallas pequeñas el menú pasa arriba.
- **Filtros de búsqueda** donde hay listas: cuadro de búsqueda (ignora tildes y mayúsculas: «clinica» encuentra «Clínica») + listas por estado/rol/programa + rango de fechas en asignaciones y sesiones. Muestran «Mostrando X de Y» y tienen *Limpiar filtros*.
- La **auditoría** ya no tiene pantalla. El sistema sigue registrando las acciones (RNF03) y el administrador puede consultar `GET /api/v1/auditoria` por API.

## Estudiante: evidencias, borradores y PDF
- La **evidencia** puede ser de **cualquier formato** (documento, imagen, video, audio, comprimido…); máximo 5 MB por archivo (`MAX_EVIDENCIA_MB`) y 10 archivos por sesión.
- Un **borrador** se puede **volver a editar** (fecha, horas, resumen, quitar o agregar evidencias) y se envía al tutor con *Guardar y enviar al tutor* (o *Enviar* desde la bitácora). Una sesión ya enviada no se edita.
- El **PDF** de la bitácora trae las sesiones enviadas con su estado, la observación del tutor y la calificación del docente; **no incluye borradores**.

## Guía paso a paso
Vea **GUIA_PASO_A_PASO.md** (instalación con Docker o con npm, primer recorrido por rol, pruebas y solución de problemas).

## Limitaciones conocidas
- **PostgreSQL compartido:** los 3 servicios relacionales usan la misma base (el modelo E-R del documento, sección 8, tiene llaves
  foráneas entre sus tablas). Cada servicio escribe solo en sus tablas, pero `servicio-practicas` hace un `JOIN` de **solo lectura** con
  `usuarios` (de Identidad) para mostrar nombres. Para aislamiento total habría que separar las bases y resolver esos nombres por REST.
- Los Dockerfiles y el `docker-compose` no se pudieron ejecutar en el entorno donde se generó el proyecto; la lógica de los servicios sí
  se probó (ver README de cada servicio).
