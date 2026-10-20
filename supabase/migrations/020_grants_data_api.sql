-- ============================================================
-- MIGRACIÓN 020: Permisos explícitos de la Data API
--
-- Desde el 30/10/2026 Supabase deja de dar automáticamente los
-- permisos de la Data API (supabase-js / PostgREST) a las tablas
-- NUEVAS del schema public. Las migraciones 001–019 no llevan
-- ningún GRANT porque contaban con ese reparto automático, y el
-- backup diario (pg_dump --no-acl) tampoco guarda permisos.
--
-- Esta migración deja por escrito los permisos que la app
-- necesita, en public y en dev:
--   · Sobre la BD actual NO cambia nada: concede lo que las tablas
--     ya tienen (los permisos estándar de Supabase). No toca datos.
--   · Tras restaurar un backup o recrear el proyecto, ejecutarla
--     devuelve a la app el acceso a todas las tablas.
--
-- Es idempotente: se puede ejecutar tantas veces como haga falta.
-- La seguridad real sigue estando en RLS: estos GRANT solo abren
-- la puerta de la API; las políticas deciden qué filas se ven.
-- Se conceden solo SELECT/INSERT/UPDATE/DELETE (no ALL): TRUNCATE
-- vaciaría una tabla entera saltándose RLS y la app no lo usa.
--
-- TABLAS NUEVAS (desde la 021): incluir en la misma migración que
-- crea la tabla, en public Y en dev:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON <tabla> TO anon, authenticated, service_role;
-- ============================================================

-- ------------------------------------------------------------
-- public (producción)
-- ------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- dev (modo Desarrollo)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dev') THEN
    GRANT USAGE ON SCHEMA dev TO anon, authenticated, service_role;

    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA dev TO anon, authenticated, service_role;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated, service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA dev TO anon, authenticated, service_role;
  END IF;
END $$;
