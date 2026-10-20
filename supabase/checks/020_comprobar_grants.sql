-- ============================================================
-- COMPROBACIÓN DE SOLO LECTURA (no modifica nada)
-- Ejecutar ANTES y DESPUÉS de la migración 020.
--
-- Lista cada tabla/vista de public y dev con los permisos que le
-- FALTAN a cada rol. Lo esperado:
--   · ANTES: ninguna fila (verificado en producción el 20/10/2026).
--     Cualquier fila = un permiso que hoy NO existe y que la 020
--     añadiría: avisar antes de aplicarla.
--   · DESPUÉS: exactamente las mismas filas que antes.
-- ============================================================
WITH objs AS (
  SELECT n.nspname AS schema, c.relname AS tabla
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'dev')
    AND c.relkind IN ('r', 'v', 'm', 'p')
),
roles AS (SELECT unnest(ARRAY['anon', 'authenticated', 'service_role']) AS rol),
privs AS (SELECT unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS priv)
SELECT schema, rol, count(DISTINCT tabla) AS tablas_afectadas,
       string_agg(DISTINCT priv, ', ') AS permisos_que_faltan,
       string_agg(DISTINCT tabla, ', ') AS tablas
FROM objs, roles, privs
WHERE NOT has_table_privilege(rol, format('%I.%I', schema, tabla), priv)
GROUP BY schema, rol
ORDER BY schema, rol;
