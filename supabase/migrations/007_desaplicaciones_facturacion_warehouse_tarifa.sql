-- ============================================================
-- MIGRACIÓN 007: Desaplicaciones + Facturación mensual puestas
--               + Fix tarifa usando warehouses.storage_daily_price
-- ============================================================

-- 1. Ampliar CHECK de tipo en salidas_parciales para incluir 'desaplicacion'
ALTER TABLE salidas_parciales
  DROP CONSTRAINT IF EXISTS salidas_parciales_tipo_check;

ALTER TABLE salidas_parciales
  ADD CONSTRAINT salidas_parciales_tipo_check
  CHECK (tipo IN ('real', 'plancha', 'desaplicacion'));

-- 2. Tabla para registrar los meses facturados por puesta a disposición
CREATE TABLE IF NOT EXISTS puesta_facturacion_meses (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  puesta_id   UUID         NOT NULL REFERENCES puestas_a_disposicion(id) ON DELETE CASCADE,
  year_month  VARCHAR(7)   NOT NULL,  -- formato "YYYY-MM"
  invoiced_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT uq_pfm_puesta_month UNIQUE (puesta_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_pfm_puesta_id ON puesta_facturacion_meses(puesta_id);

ALTER TABLE puesta_facturacion_meses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view puesta_facturacion_meses"
  ON puesta_facturacion_meses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage puesta_facturacion_meses"
  ON puesta_facturacion_meses FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ============================================================
-- 3. Fix get_tarifa_for_puesta_day:
--    - Añade parámetro p_warehouse_id
--    - Usa warehouses.storage_daily_price como fallback
--      en lugar de products.storage_daily_price
-- ============================================================
DROP FUNCTION IF EXISTS get_tarifa_for_puesta_day(UUID, INTEGER);

CREATE OR REPLACE FUNCTION get_tarifa_for_puesta_day(
  p_product_id   UUID,
  p_warehouse_id UUID,
  p_dias_activos INTEGER
)
RETURNS DECIMAL AS $$
DECLARE
  v_precio DECIMAL(12,4);
BEGIN
  -- Buscar tarifa_tramo específica para el producto
  SELECT tt.precio_diario
    INTO v_precio
    FROM tarifa_tramos tt
   WHERE tt.product_id = p_product_id
     AND tt.active = true
     AND tt.dias_desde <= p_dias_activos
     AND (tt.dias_hasta IS NULL OR tt.dias_hasta >= p_dias_activos)
   ORDER BY tt.dias_desde DESC
   LIMIT 1;

  -- Fallback: precio diario del almacén
  IF v_precio IS NULL THEN
    SELECT w.storage_daily_price
      INTO v_precio
      FROM warehouses w
     WHERE w.id = p_warehouse_id;
  END IF;

  RETURN COALESCE(v_precio, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 4. Fix get_puesta_daily_breakdown:
--    - Pasa warehouse_id a get_tarifa_for_puesta_day
--    - Solo cuenta salidas 'real' y 'desaplicacion' para la
--      cantidad facturable (excluye 'plancha', que es
--      un traspaso administrativo al cliente)
-- ============================================================
CREATE OR REPLACE FUNCTION get_puesta_daily_breakdown(
  p_puesta_id    UUID,
  p_fecha_inicio DATE DEFAULT NULL,
  p_fecha_fin    DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  dia                DATE,
  dias_activos       INTEGER,
  cantidad_pendiente DECIMAL,
  tarifa_diaria      DECIMAL,
  coste_dia          DECIMAL
) AS $$
DECLARE
  v_fecha_inicio DATE;
BEGIN
  SELECT COALESCE(p_fecha_inicio, pd.fecha_fin_plancha + 1)
    INTO v_fecha_inicio
    FROM puestas_a_disposicion pd
   WHERE pd.id = p_puesta_id;

  IF v_fecha_inicio IS NULL OR v_fecha_inicio > p_fecha_fin THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.dia::DATE,
    (d.dia - pd.fecha_fin_plancha)::INTEGER                                 AS dias_activos,
    GREATEST(0::DECIMAL, pd.cantidad_inicial - COALESCE(
      (SELECT SUM(sp.cantidad)
         FROM salidas_parciales sp
        WHERE sp.puesta_id = p_puesta_id
          AND sp.tipo IN ('real', 'desaplicacion')
          AND sp.fecha_salida < d.dia),
      0
    ))                                                                      AS cantidad_pendiente,
    get_tarifa_for_puesta_day(
      pd.product_id, pd.warehouse_id, (d.dia - pd.fecha_fin_plancha)
    )                                                                       AS tarifa_diaria,
    GREATEST(0::DECIMAL, pd.cantidad_inicial - COALESCE(
      (SELECT SUM(sp.cantidad)
         FROM salidas_parciales sp
        WHERE sp.puesta_id = p_puesta_id
          AND sp.tipo IN ('real', 'desaplicacion')
          AND sp.fecha_salida < d.dia),
      0
    )) * get_tarifa_for_puesta_day(
      pd.product_id, pd.warehouse_id, (d.dia - pd.fecha_fin_plancha)
    )                                                                       AS coste_dia
  FROM puestas_a_disposicion pd
  CROSS JOIN LATERAL (
    SELECT generate_series(v_fecha_inicio, p_fecha_fin, '1 day'::interval)::date AS dia
  ) d
  WHERE pd.id = p_puesta_id
  ORDER BY d.dia;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 5. Fix get_puesta_summary:
--    - salidas_billing excluye 'plancha' (solo real + desaplicacion)
--    - cantidad_fisica_pendiente incluye desaplicaciones
-- ============================================================
DROP FUNCTION IF EXISTS get_puesta_summary(UUID, DATE);

CREATE OR REPLACE FUNCTION get_puesta_summary(
  p_puesta_id UUID,
  p_fecha     DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  puesta_id                 UUID,
  numero_contrato           TEXT,
  customer_name             TEXT,
  product_name              TEXT,
  product_code              TEXT,
  unit                      TEXT,
  warehouse_name            TEXT,
  cantidad_inicial          DECIMAL,
  cantidad_salida           DECIMAL,
  cantidad_pendiente        DECIMAL,
  cantidad_fisica_pendiente DECIMAL,
  fecha_puesta              DATE,
  dias_plancha              INTEGER,
  fecha_fin_plancha         DATE,
  dias_activos              INTEGER,
  coste_acumulado           DECIMAL,
  estado                    TEXT,
  created_at                TIMESTAMPTZ
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
    -- Salidas que reducen la cantidad del contrato (excluye plancha administrativa)
    salidas_billing AS (
      SELECT COALESCE(SUM(sp.cantidad), 0) AS total
        FROM salidas_parciales sp
       WHERE sp.puesta_id = p_puesta_id
         AND sp.tipo IN ('real', 'desaplicacion')
         AND sp.fecha_salida <= p_fecha
    ),
    -- Solo retiradas físicas reales (camiones)
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
    sb.total                                            AS cantidad_salida,
    (b.cantidad_inicial - sb.total)                     AS cantidad_pendiente,
    (b.cantidad_inicial - sr.total)                     AS cantidad_fisica_pendiente,
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

-- ============================================================
-- 6. Recrear get_all_puestas_summary (depende de get_puesta_summary)
-- ============================================================
DROP FUNCTION IF EXISTS get_all_puestas_summary(DATE);

CREATE OR REPLACE FUNCTION get_all_puestas_summary(
  p_fecha DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  puesta_id                 UUID,
  numero_contrato           TEXT,
  customer_name             TEXT,
  product_name              TEXT,
  product_code              TEXT,
  unit                      TEXT,
  warehouse_name            TEXT,
  cantidad_inicial          DECIMAL,
  cantidad_salida           DECIMAL,
  cantidad_pendiente        DECIMAL,
  cantidad_fisica_pendiente DECIMAL,
  fecha_puesta              DATE,
  dias_plancha              INTEGER,
  fecha_fin_plancha         DATE,
  dias_activos              INTEGER,
  coste_acumulado           DECIMAL,
  estado                    TEXT,
  created_at                TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT ps.*
    FROM puestas_a_disposicion pd
    CROSS JOIN LATERAL get_puesta_summary(pd.id, p_fecha) ps
   ORDER BY pd.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;
