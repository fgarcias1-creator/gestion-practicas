/**
 * SERVICIO DE PRÁCTICAS (puerto 3002) - PostgreSQL
 * RF01 Solicitud · RF02 Asignación (director) · RF03 Instituciones y convenios (los gestiona el administrador).
 * Dueño de las tablas: instituciones, convenios, estudiantes, tutores, docentes,
 * directores y asignaciones.
 */
const cron = require('node-cron');
const { crearApp, arrancar } = require('./lib/servidor');
const { query } = require('./lib/pg');
const { puertos } = require('./lib/config');
const rutas = require('./routes');

const app = crearApp('practicas');
app.use('/api/v1', rutas);

/**
 * RF02: "en la fecha de inicio la práctica pasa a «en curso»".
 * Se ejecuta al arrancar y todos los días a la 1:00 a. m.
 */
async function activarPracticas() {
  const { rowCount } = await query(
    "UPDATE asignaciones SET estado='en_curso' WHERE estado='asignado' AND fecha_inicio_practica <= CURRENT_DATE");
  if (rowCount) console.log(`[practicas] ${rowCount} práctica(s) pasaron a «en curso»`);
}
/**
 * Migración idempotente al arrancar: deja al día el esquema de bases ya creadas con versiones anteriores.
 *  - columnas que asocian la solicitud con práctica, semestre y período (Astah «Solicitar práctica»)
 *  - catálogo de programas académicos y créditos APROBADOS del estudiante (el % se calcula, ya no se teclea)
 */
async function asegurarEsquema() {
  await query(`ALTER TABLE estudiantes
    ADD COLUMN IF NOT EXISTS solicitud_practica VARCHAR(100),
    ADD COLUMN IF NOT EXISTS solicitud_semestre INTEGER,
    ADD COLUMN IF NOT EXISTS solicitud_periodo VARCHAR(10),
    ADD COLUMN IF NOT EXISTS fecha_solicitud TIMESTAMP`);
  await query(`CREATE TABLE IF NOT EXISTS programas (
    id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE, facultad VARCHAR(100) NOT NULL,
    creditos_totales INTEGER NOT NULL CHECK (creditos_totales > 0), semestre_minimo INTEGER NOT NULL CHECK (semestre_minimo BETWEEN 1 AND 14),
    porcentaje_minimo INTEGER NOT NULL CHECK (porcentaje_minimo BETWEEN 0 AND 100), horas_practica INTEGER NOT NULL CHECK (horas_practica > 0))`);
  await query("ALTER TABLE programas ADD COLUMN IF NOT EXISTS nombre_practica VARCHAR(100) NOT NULL DEFAULT 'Práctica Profesional'");
  await query(`INSERT INTO programas(nombre,facultad,creditos_totales,semestre_minimo,porcentaje_minimo,horas_practica) VALUES
    ('Ingeniería de Sistemas','Facultad de Ingenierías',160,7,70,160),
    ('Administración de Empresas','Facultad de Ciencias Económicas',150,7,70,240),
    ('Contaduría Pública','Facultad de Ciencias Económicas',150,7,75,240)
    ON CONFLICT (nombre) DO NOTHING`);
  // Licenciaturas (carreras afines a fines pedagógicos): valores de EJEMPLO; el administrador los ajusta desde la pestaña Programas
  await query(`INSERT INTO programas(nombre,facultad,creditos_totales,semestre_minimo,porcentaje_minimo,horas_practica,nombre_practica) VALUES
    ('Licenciatura en Educación Infantil','Facultad de Educación',160,7,70,240,'Práctica Pedagógica'),
    ('Licenciatura en Ciencias Naturales','Facultad de Educación',160,7,70,240,'Práctica Pedagógica'),
    ('Licenciatura en Matemáticas','Facultad de Educación',160,7,70,240,'Práctica Pedagógica'),
    ('Licenciatura en Lenguas Extranjeras','Facultad de Educación',160,7,70,240,'Práctica Pedagógica')
    ON CONFLICT (nombre) DO NOTHING`);
  await query(`ALTER TABLE estudiantes
    ADD COLUMN IF NOT EXISTS programa_id INTEGER REFERENCES programas(id),
    ADD COLUMN IF NOT EXISTS creditos_aprobados INTEGER`);
  // Datos de la versión anterior (programa en texto y % tecleado) -> programa_id y créditos aprobados
  await query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='estudiantes' AND column_name='porcentaje_creditos') THEN
      INSERT INTO programas(nombre,facultad,creditos_totales,semestre_minimo,porcentaje_minimo,horas_practica)
        SELECT DISTINCT programa,'Por definir',160,7,70,160 FROM estudiantes WHERE programa IS NOT NULL ON CONFLICT (nombre) DO NOTHING;
      UPDATE estudiantes e SET programa_id = p.id FROM programas p WHERE e.programa_id IS NULL AND p.nombre = e.programa;
      UPDATE estudiantes e SET creditos_aprobados = LEAST(p.creditos_totales, ROUND(COALESCE(e.porcentaje_creditos,0) * p.creditos_totales / 100.0)::int)
        FROM programas p WHERE e.creditos_aprobados IS NULL AND p.id = e.programa_id;
      ALTER TABLE estudiantes ALTER COLUMN porcentaje_creditos DROP NOT NULL;
      ALTER TABLE estudiantes ALTER COLUMN programa DROP NOT NULL;
    END IF; END $$`);
}
asegurarEsquema().catch((e) => console.warn('[practicas] no se pudo actualizar el esquema:', e.message));

cron.schedule('0 1 * * *', () => activarPracticas().catch(console.error));
activarPracticas().catch((e) => console.warn('[practicas] no se pudo activar prácticas:', e.message));

arrancar(app, 'practicas', puertos.practicas);
