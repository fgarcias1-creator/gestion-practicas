-- =====================================================================
-- Modelo relacional (PostgreSQL) - sección 8.2 del documento.
-- Extensiones respecto al diccionario: instituciones.nit/activa/persona_contacto (RF03),
-- estudiantes.motivo_rechazo (RF01), calificaciones.justificacion (RF06) y estado
-- 'devuelto' / 'no_iniciado'.
-- =====================================================================
DROP TABLE IF EXISTS programas, calificaciones_sesion, calificaciones, evaluaciones_tutor, asignaciones, directores, docentes,
                     tutores, estudiantes, convenios, instituciones, usuarios CASCADE;
DROP FUNCTION IF EXISTS bloquear_modificacion_calificacion();

-- Servicio de Identidad ------------------------------------------------
-- Rol 'administrador' (personal de sistemas de la universidad): crea y gestiona usuarios, instituciones y convenios.
-- No tiene tabla de perfil: no es parte del proceso académico, solo administra el sistema.
CREATE TABLE usuarios (
  id              SERIAL PRIMARY KEY,
  nombre_completo VARCHAR(150) NOT NULL,
  email           VARCHAR(150) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  rol             VARCHAR(20)  NOT NULL CHECK (rol IN ('estudiante','tutor','docente','director','administrador')),
  estado          VARCHAR(20)  DEFAULT 'activo',
  fecha_creacion  TIMESTAMP    DEFAULT NOW()
);

-- Servicio de Prácticas ------------------------------------------------
CREATE TABLE instituciones (
  id                SERIAL PRIMARY KEY,
  nit               VARCHAR(30)  NOT NULL UNIQUE,
  nombre            VARCHAR(150) NOT NULL,
  direccion         VARCHAR(200),
  persona_contacto  VARCHAR(150),
  telefono_contacto VARCHAR(30),
  email_contacto    VARCHAR(150),
  cupo_total        INTEGER NOT NULL CHECK (cupo_total >= 0),
  cupo_disponible   INTEGER NOT NULL CHECK (cupo_disponible >= 0),
  activa            BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (cupo_disponible <= cupo_total)
);

CREATE TABLE convenios (
  id             SERIAL PRIMARY KEY,
  institucion_id INTEGER NOT NULL REFERENCES instituciones(id),
  fecha_inicio   DATE NOT NULL,
  fecha_fin      DATE NOT NULL,
  estado         VARCHAR(20) NOT NULL CHECK (estado IN ('vigente','proximo_a_vencer','vencido','no_iniciado')),
  documento_url  VARCHAR(255),
  CHECK (fecha_fin >= fecha_inicio)
);

-- Catálogo académico: los requisitos de práctica dependen del PROGRAMA del estudiante
CREATE TABLE programas (
  id                SERIAL PRIMARY KEY,
  nombre            VARCHAR(100) NOT NULL UNIQUE,
  facultad          VARCHAR(100) NOT NULL,
  creditos_totales  INTEGER NOT NULL CHECK (creditos_totales > 0),
  semestre_minimo   INTEGER NOT NULL CHECK (semestre_minimo BETWEEN 1 AND 14),
  porcentaje_minimo INTEGER NOT NULL CHECK (porcentaje_minimo BETWEEN 0 AND 100),
  horas_practica    INTEGER NOT NULL CHECK (horas_practica > 0),
  nombre_practica   VARCHAR(100) NOT NULL DEFAULT 'Práctica Profesional'   -- p. ej. «Práctica Pedagógica» en las licenciaturas
);

CREATE TABLE estudiantes (
  id                  SERIAL PRIMARY KEY,
  usuario_id          INTEGER NOT NULL UNIQUE REFERENCES usuarios(id),
  codigo_estudiantil  VARCHAR(20) NOT NULL UNIQUE,
  programa_id         INTEGER NOT NULL REFERENCES programas(id),
  semestre            INTEGER NOT NULL CHECK (semestre BETWEEN 1 AND 14),
  creditos_aprobados  INTEGER NOT NULL CHECK (creditos_aprobados >= 0),
  estado_solicitud    VARCHAR(20) DEFAULT 'no_solicitado'
                      CHECK (estado_solicitud IN ('no_solicitado','pendiente','rechazado','devuelto','asignado')),
  motivo_rechazo      TEXT,
  -- Astah «Solicitar práctica»: la solicitud queda asociada a la práctica, el semestre y el período lectivo
  solicitud_practica  VARCHAR(100),
  solicitud_semestre  INTEGER,
  solicitud_periodo   VARCHAR(10),
  fecha_solicitud     TIMESTAMP
);

CREATE TABLE tutores (
  id             SERIAL PRIMARY KEY,
  usuario_id     INTEGER NOT NULL UNIQUE REFERENCES usuarios(id),
  institucion_id INTEGER NOT NULL REFERENCES instituciones(id),
  cargo          VARCHAR(100),
  telefono       VARCHAR(30)
);

CREATE TABLE docentes (
  id         SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id),
  area       VARCHAR(100)
);

CREATE TABLE directores (
  id                 SERIAL PRIMARY KEY,
  usuario_id         INTEGER NOT NULL UNIQUE REFERENCES usuarios(id),
  programa_academico VARCHAR(100)
);

CREATE TABLE asignaciones (
  id                    SERIAL PRIMARY KEY,
  estudiante_id         INTEGER NOT NULL REFERENCES estudiantes(id),
  institucion_id        INTEGER NOT NULL REFERENCES instituciones(id),
  tutor_id              INTEGER NOT NULL REFERENCES tutores(id),
  docente_id            INTEGER NOT NULL REFERENCES docentes(id),
  convenio_id           INTEGER NOT NULL REFERENCES convenios(id),
  fecha_asignacion      TIMESTAMP DEFAULT NOW(),
  fecha_inicio_practica DATE NOT NULL,
  estado                VARCHAR(20) DEFAULT 'asignado'
                        CHECK (estado IN ('asignado','en_curso','evaluado','calificado','finalizado'))
);
-- Un estudiante solo puede tener UNA asignación (índice único por estudiante)
CREATE UNIQUE INDEX ux_asignacion_estudiante ON asignaciones(estudiante_id);

-- Servicio de Evaluación y Calificación --------------------------------
CREATE TABLE evaluaciones_tutor (
  id               SERIAL PRIMARY KEY,
  asignacion_id    INTEGER NOT NULL REFERENCES asignaciones(id),
  tutor_id         INTEGER NOT NULL REFERENCES tutores(id),
  disposicion      INTEGER CHECK (disposicion BETWEEN 1 AND 5),
  cumplimiento     INTEGER CHECK (cumplimiento BETWEEN 1 AND 5),
  observaciones    TEXT,
  fecha_evaluacion TIMESTAMP DEFAULT NOW()
);

CREATE TABLE calificaciones (
  id                       SERIAL PRIMARY KEY,
  asignacion_id            INTEGER NOT NULL REFERENCES asignaciones(id),
  docente_id               INTEGER NOT NULL REFERENCES docentes(id),
  nota                     NUMERIC(3,1) NOT NULL CHECK (nota BETWEEN 0.0 AND 5.0),
  retroalimentacion        TEXT NOT NULL,
  fecha_registro           TIMESTAMP DEFAULT NOW(),
  es_correccion            BOOLEAN DEFAULT FALSE,
  calificacion_original_id INTEGER REFERENCES calificaciones(id),
  justificacion            TEXT,
  CHECK (es_correccion = FALSE OR (calificacion_original_id IS NOT NULL AND justificacion IS NOT NULL))
);
-- Solo puede existir una calificación "original" por asignación; lo demás son correcciones.
CREATE UNIQUE INDEX ux_calificacion_original ON calificaciones(asignacion_id) WHERE es_correccion = FALSE;

-- RF06: una calificación publicada es INMUTABLE (ni UPDATE ni DELETE). Se corrige insertando otra.
CREATE FUNCTION bloquear_modificacion_calificacion() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Las calificaciones publicadas no pueden modificarse ni eliminarse; registre una corrección'
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calificaciones_inmutables
  BEFORE UPDATE OR DELETE ON calificaciones
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_calificacion();

-- RF06: calificación de CADA sesión validada (el promedio de estas notas es la nota final). Solo inserción: la vigente es la más reciente.
CREATE TABLE calificaciones_sesion (
  id                SERIAL PRIMARY KEY,
  asignacion_id     INTEGER NOT NULL REFERENCES asignaciones(id),
  sesion_id         VARCHAR(24) NOT NULL,           -- _id de la sesión en MongoDB (referencia lógica entre motores)
  docente_id        INTEGER NOT NULL REFERENCES docentes(id),
  nota              NUMERIC(3,1) NOT NULL CHECK (nota BETWEEN 0.0 AND 5.0),
  retroalimentacion TEXT NOT NULL,
  fecha_registro    TIMESTAMP DEFAULT NOW(),
  es_correccion     BOOLEAN DEFAULT FALSE,
  justificacion     TEXT,
  CHECK (es_correccion = FALSE OR justificacion IS NOT NULL)
);
CREATE INDEX ix_calsesion ON calificaciones_sesion(asignacion_id, sesion_id, id DESC);
CREATE TRIGGER trg_calsesion_inmutables
  BEFORE UPDATE OR DELETE ON calificaciones_sesion
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_calificacion();
