-- ============================================================
-- Migración 005: permitir cantidad_pendiente negativa en el RPC
-- Elimina el GREATEST(0, ...) para que el exceso de retiro
-- se refleje como valor negativo en la UI.
-- ============================================================

DROP FUNCTION IF EXISTS get_puesta_summary(UUID, DATE);
DROP FUNCTION IF EXISTS get_all_puestas_summary(DATE);

CREATE OR REPLACE FUNCTION get_puesta_summary(
  p_puesta_id UUID,
  p_fecha     DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  puesta_id          UUID,
  numero_contrato    TEXT,
  customer_name      TEXT,
  product_name       TEXT,
  product_code       TEXT,
  unit               TEXT,
  warehouse_name     TEXT,
  cantidad_inicial   DECIMAL,
  cantidad_salida    DECIMAL,
  cantidad_pendiente DECIMAL,
  cantidad_fisica_pendiente DECIMAL,
  fecha_puesta       DATE,
  dias_plancha       INTEGER,
  fecha_fin_plancha  DATE,
  dias_activos       INTEGER,
  coste_acumulado    DECIMAL,
  estado             TEXT,
  created_at         TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH
    base AS (
      SELECT
        pd.*,
        COALESCE(c.name, '')  AS c_name,
        pr.name               AS pr_name,
        pr.code               AS pr_code,
        pr.unit               AS pr_unit,
        w.name                AS w_name
      FROM puestas_a_disposicion pd
      LEFT JOIN customers c  ON c.id  = pd.customer_id
      JOIN products pr       ON pr.id = pd.product_id
      JOIN warehouses w      ON w.id  = pd.warehouse_id
      WHERE pd.id = p_puesta_id
    ),
    -- Todas las salidas (real + plancha) para el coste
    salidas_billing AS (
      SELECT COALESCE(SUM(sp.cantidad), 0) AS total
        FROM salidas_parciales sp
       WHERE sp.puesta_id = p_puesta_id
         AND sp.fecha_salida <= p_fecha
    ),
    -- Solo salidas reales para el stock físico
    salidas_reales AS (
      SELECT COALESCE(SUM(sp.cantidad), 0) AS total
        FROM salidas_parciales sp
       WHERE sp.puesta_id = p_puesta_id
         AND sp.tipo = 'real'
         AND sp.fecha_salida <= p_fecha
    ),
    coste AS (
      SELECT COALESCE(SUM(db.coste_dia), 0) AS total_coste
        FROM get_puesta_daily_breakdown(p_puesta_id, NULL, p_fecha) db
    )
  SELECT
    b.id,
    COALESCE(b.numero_contrato, '')::TEXT,
    b.c_name::TEXT,
    b.pr_name::TEXT,
    b.pr_code::TEXT,
    b.pr_unit::TEXT,
    b.w_name::TEXT,
    b.cantidad_inicial,
    sb.total                                           AS cantidad_salida,
    (b.cantidad_inicial - sb.total)                    AS cantidad_pendiente,
    (b.cantidad_inicial - sr.total)                    AS cantidad_fisica_pendiente,
    b.fecha_puesta,
    b.dias_plancha,
    b.fecha_fin_plancha,
    GREATEST(0, p_fecha - b.fecha_fin_plancha)::INTEGER AS dias_activos,
    c.total_coste,
    b.estado::TEXT,
    b.created_at
  FROM base b, salidas_billing sb, salidas_reales sr, coste c;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_all_puestas_summary(
  p_fecha DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  puesta_id          UUID,
  numero_contrato    TEXT,
  customer_name      TEXT,
  product_name       TEXT,
  product_code       TEXT,
  unit               TEXT,
  warehouse_name     TEXT,
  cantidad_inicial   DECIMAL,
  cantidad_salida    DECIMAL,
  cantidad_pendiente DECIMAL,
  cantidad_fisica_pendiente DECIMAL,
  fecha_puesta       DATE,
  dias_plancha       INTEGER,
  fecha_fin_plancha  DATE,
  dias_activos       INTEGER,
  coste_acumulado    DECIMAL,
  estado             TEXT,
  created_at         TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT ps.*
    FROM puestas_a_disposicion pd
    CROSS JOIN LATERAL get_puesta_summary(pd.id, p_fecha) ps
   ORDER BY pd.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;
