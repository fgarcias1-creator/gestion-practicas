# Trazabilidad: casos de uso (Astah) → sistema

Fuentes: `Proyecto_Integrador_1_0_UseCase.csv` (10 casos), la Figura 1 del documento (diagrama de casos de uso), los requisitos RF01-RF07 y las
descripciones de Astah de *Solicitar práctica* y *Asignar práctica*. Las especificaciones de los casos nuevos están en el documento
«Especificaciones de los casos de uso nuevos».

Leyenda: ✔ implementado · ◐ parcial · «Mongo» = depende de MongoDB y **no se ejecutó contra una instancia real** (la lógica sí se probó con los modelos simulados).

## Casos del diagrama original

| # | Caso de uso | Actor | Dónde está | Estado | Notas |
|---|---|---|---|---|---|
| 1 | Solicitar práctica | Estudiante | `servicio-practicas` `/solicitudes` · *Solicitar práctica* | ✔ | Pasos 1-5, flujos 1a y 2a y excepción E1 de Astah. Requisitos según el **programa**. |
| 2 | Asignar práctica | Director | `/asignaciones` · *Solicitudes* y *Asignaciones* | ✔ | Pasos 1-4, **2a** reasignación, **E1** (sin cupos/convenio: deshabilitada + alerta), **E2** (carga completa: advertencia). Avisa por campana y **por correo** a estudiante, tutor e institución. |
| 3 | Registrar evidencia de sesión | Estudiante | `servicio-seguimiento` `/sesiones` | ✔ (Mongo) | evidencia de **cualquier formato** (≤ 5 MB por archivo), borrador **editable** (`PUT /sesiones/:id`, con envío opcional), hora del servidor, fecha entre el inicio de la práctica y hoy. |
| 4 | Validar asistencia y desempeño | Tutor | `/sesiones/:id/validar\|rechazar`, `/evaluaciones` | ✔ (Mongo) | Un clic; rechazo con observación; evaluación de desempeño; avisa al estudiante. |
| 5 | Calificar práctica | Docente | `servicio-evaluacion` · *Mis estudiantes → Calificar* | ✔ | **Una nota por sesión**, la **nota final es el promedio** y el docente la confirma y publica (RF06). Requiere evaluación del tutor y todas las sesiones calificadas. |
| 6 | Consultar seguimiento | Estudiante, Docente, Director | `/bitacora/:id` y `/bitacora/:id/pdf` | ✔ (Mongo) | Línea de estados, horas del programa, sesiones, nota por sesión y final. El director **busca** estudiantes (pestaña *Seguimiento*); el docente abre la bitácora de los suyos. **Descarga en PDF** (RF05). |
| 7 | Generar reportes | Director | `servicio-reportes` · *Reportes* | ◐ (Mongo) | Filtros por estado y CSV. Faltan filtro por período académico, solicitudes pendientes/rechazadas y PDF/Excel. |
| 8 | Gestionar instituciones y convenios | **Administrador** (el director solo consulta) | `/instituciones`, `/convenios` · *Instituciones* | ✔ | Crear, ajustar cupos, inhabilitar, convenios y adenda. La pantalla ya no muestra avisos de convenios por vencer (el endpoint `/convenios/alertas` sigue existiendo). Falta filtrar convenios por estado y editar los datos de contacto en pantalla (la API sí lo permite). |
| 9 | Rechazar solicitud de práctica | Director | `/solicitudes/:id/rechazar\|devolver` | ✔ | **Solo el director** rechaza o devuelve desde pantalla con un motivo obligatorio (modal). Avisa por campana y por correo. El docente ya no atiende solicitudes (403 en el servidor). |
| 10 | Validar convenio activo y cupo disponible | (incluido en 2) | `validarAsignacion()` en `servicio-practicas` | ✔ | Transacción con la institución bloqueada (`FOR UPDATE`). |

## Cambio de roles (administrador de sistemas)
Se agregó el actor **Administrador**: crea usuarios, instituciones y convenios. El **Director** quedó con: aprobar/rechazar/devolver solicitudes y asignar institución, tutor y docente (casos 2 y 9), seguimiento (6) y reportes (7). Conviene reflejarlo en el diagrama de casos de uso y en el documento del Proyecto Integrador.

## Casos nuevos propuestos para el diagrama

| Caso de uso | Relación | Estado | Notas |
|---|---|---|---|
| Iniciar sesión | Actor abstracto «Usuario» | ✔ | JWT de 8 h, mensaje único «Credenciales inválidas», intentos en auditoría. |
| Gestionar usuarios | **Administrador** (personal de sistemas) | ✔ (crear, listar, activar/desactivar, restablecer contraseña) | Estudiante con programa, semestre y créditos aprobados; rollback si falla el perfil. Ningún otro rol accede (403). Falta editar nombre/correo. |
| Confirmar sesión automáticamente (24 h) | `«extend»` de *Validar asistencia y desempeño* · actor Sistema | ✔ (Mongo) | Cada 5 min; no pisa la decisión del tutor; avisa al estudiante y queda en auditoría. |
| Corregir calificación | `«extend»` de *Calificar práctica* | ✔ | Corrección de una sesión (recalcula la final) o de la nota final; exige justificación; los registros son inmutables. |

## Cómo se modeló la universidad
- **Programa académico** (`programas`): facultad, créditos del plan, semestre mínimo, % mínimo de créditos y **horas de práctica**.
- **Créditos aprobados** como número; el porcentaje se calcula contra el plan.
- **Período lectivo** y bloqueo de nuevas solicitudes **por período**; **lista de espera** en orden de llegada.
- **Tutor de la institución** y **docente asesor**; notificaciones (campana) y correo.

## Navegación, filtros y bitácora
Barra lateral por rol (`frontend/src/menu.js`), filtros de búsqueda en las listas (`Filtros` en `ui.jsx`). La pantalla de auditoría se retiró; el registro (RNF03) y `GET /auditoria` (solo administrador) se conservan. El PDF de la bitácora (caso 6) incluye estado, observación del tutor y calificación por sesión y excluye borradores.

## Programas y licenciaturas
El catálogo incluye licenciaturas (Educación Infantil, Ciencias Naturales, Matemáticas, Lenguas Extranjeras) con «Práctica Pedagógica». El administrador agrega o ajusta programas desde la pestaña *Programas* (`POST/PUT /programas`). La **auditoría** (RNF03) es de consulta exclusiva del administrador.

## Supuestos y pendientes
- *Semestre de ejecución* = semestre actual del estudiante. Los datos académicos los registra el administrador al crear al estudiante (no hay integración con un sistema académico).
- Los programas del catálogo son **valores de ejemplo**: ajústelos.
- Correo: sin `SMTP_HOST` queda simulado; con Docker llega a MailHog (http://localhost:8025). Para un correo real, configure un servidor SMTP.
- RF02 dice que el Gateway orquesta el aviso de asignación; hoy lo envía el servicio de Prácticas.
- Todo lo marcado «Mongo» debe validarse con MongoDB real (`pruebas-e2e`).
