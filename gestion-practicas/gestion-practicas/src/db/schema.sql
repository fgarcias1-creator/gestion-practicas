-- Esquema relacional (PostgreSQL) - Plataforma de Gestión de Prácticas Académicas
-- Corresponde a la sección 8.2 del documento. Ejecutar con: npm run db:init
DROP TABLE IF EXISTS calificaciones, evaluaciones_tutor, asignaciones, directores, docentes,
  tutores, estudiantes, convenios, instituciones, usuarios CASCADE;
DROP FUNCTION IF EXISTS bloquear_modificacion() CASCADE;

CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nombre_completo VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('estudiante','tutor','docente','director')),
  estado VARCHAR(20) DEFAULT 'activo',
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE TABLE instituciones (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  direccion VARCHAR(200),
  telefono_contacto VARCHAR(30),
  email_contacto VARCHAR(150),
  cupo_total INTEGER NOT NULL CHECK (cupo_total >= 0),
  cupo_disponible INTEGER NOT NULL,
  CHECK (cupo_disponible >= 0 AND cupo_disponible <= cupo_total)
);

CREATE TABLE convenios (
  id SERIAL PRIMARY KEY,
  institucion_id INTEGER NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','proximo_a_vencer','vencido')),
  documento_url VARCHAR(255),
  CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE estudiantes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_estudiantil VARCHAR(20) UNIQUE NOT NULL,
  programa VARCHAR(100) NOT NULL,
  semestre INTEGER NOT NULL,
  porcentaje_creditos NUMERIC(5,2) NOT NULL,
  estado_solicitud VARCHAR(20) NOT NULL DEFAULT 'no_solicitado'
    CHECK (estado_solicitud IN ('no_solicitado','pendiente','rechazado','asignado')),
  motivo_rechazo TEXT
);

CREATE TABLE tutores (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  institucion_id INTEGER NOT NULL REFERENCES instituciones(id),
  cargo VARCHAR(100),
  telefono VARCHAR(30)
);

CREATE TABLE docentes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  area VARCHAR(100)
);

CREATE TABLE directores (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  programa_academico VARCHAR(100)
);

CREATE TABLE asignaciones (
  id SERIAL PRIMARY KEY,
  estudiante_id INTEGER NOT NULL REFERENCES estudiantes(id),
  institucion_id INTEGER NOT NULL REFERENCES instituciones(id),
  tutor_id INTEGER NOT NULL REFERENCES tutores(id),
  docente_id INTEGER NOT NULL REFERENCES docentes(id),
  convenio_id INTEGER NOT NULL REFERENCES convenios(id),
  fecha_asignacion TIMESTAMP DEFAULT NOW(),
  fecha_inicio_practica DATE NOT NULL,
  horas_requeridas INTEGER NOT NULL DEFAULT 160,
  estado VARCHAR(20) NOT NULL DEFAULT 'asignado'
    CHECK (estado IN ('asignado','en_curso','evaluado','calificado','finalizado'))
);
CREATE UNIQUE INDEX ux_asignacion_estudiante ON asignaciones(estudiante_id);

CREATE TABLE evaluaciones_tutor (
  id SERIAL PRIMARY KEY,
  asignacion_id INTEGER NOT NULL REFERENCES asignaciones(id),
  tutor_id INTEGER NOT NULL REFERENCES tutores(id),
  disposicion INTEGER NOT NULL CHECK (disposicion BETWEEN 1 AND 5),
  cumplimiento INTEGER NOT NULL CHECK (cumplimiento BETWEEN 1 AND 5),
  observaciones TEXT,
  fecha_evaluacion TIMESTAMP DEFAULT NOW()
);

CREATE TABLE calificaciones (
  id SERIAL PRIMARY KEY,
  asignacion_id INTEGER NOT NULL REFERENCES asignaciones(id),
  docente_id INTEGER NOT NULL REFERENCES docentes(id),
  nota NUMERIC(3,1) NOT NULL CHECK (nota BETWEEN 0 AND 5),
  retroalimentacion TEXT NOT NULL,
  fecha_registro TIMESTAMP DEFAULT NOW(),
  es_correccion BOOLEAN NOT NULL DEFAULT FALSE,
  calificacion_original_id INTEGER REFERENCES calificaciones(id),
  justificacion_correccion TEXT
);

-- RF06: una calificación publicada no puede modificarse ni borrarse; solo se corrige con un registro nuevo.
CREATE FUNCTION bloquear_modificacion() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Las calificaciones son inmutables: registre una corrección';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_calificaciones_inmutables BEFORE UPDATE OR DELETE ON calificaciones
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion();
