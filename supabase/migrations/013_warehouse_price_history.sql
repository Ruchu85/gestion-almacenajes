-- ============================================================
-- Migración 013: Historial de precios por almacén
-- Permite registrar cambios de tarifa con fecha de aplicación
-- y que los cálculos de almacenaje usen el precio vigente
-- en cada fecha concreta.
-- ============================================================

-- 1. Tabla de historial de precios por almacén
CREATE TABLE IF NOT EXISTS warehouse_price_history (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id   UUID          NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  price          DECIMAL(12,4) NOT NULL CHECK (price >= 0),
  effective_from DATE          NOT NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wph_warehouse_date UNIQUE (warehouse_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_wph_warehouse_date
  ON warehouse_price_history(warehouse_id, effective_from DESC);

ALTER TABLE warehouse_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view warehouse_price_history"
  ON warehouse_price_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage warehouse_price_history"
  ON warehouse_price_history FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 2. Semilla: registrar el precio actual de cada almacén con fecha
--    de inicio universal para cubrir todo el histórico previo
INSERT INTO warehouse_price_history (warehouse_id, price, effective_from)
SELECT id, storage_daily_price, '2000-01-01'::DATE
FROM warehouses
WHERE storage_daily_price > 0
ON CONFLICT (warehouse_id, effective_from) DO NOTHING;

-- 3. Trigger para que nuevos almacenes creen automáticamente su
--    primer registro de historial de precios
CREATE OR REPLACE FUNCTION warehouse_insert_price_history_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.storage_daily_price > 0 THEN
    INSERT INTO warehouse_price_history (warehouse_id, price, effective_from)
    VALUES (NEW.id, NEW.storage_daily_price, NEW.created_at::DATE)
    ON CONFLICT (warehouse_id, effective_from) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS warehouse_insert_price_history ON warehouses;
CREATE TRIGGER warehouse_insert_price_history
  AFTER INSERT ON warehouses
  FOR EACH ROW EXECUTE FUNCTION warehouse_insert_price_history_fn();

-- ============================================================
-- 4. Función helper: precio vigente en una fecha concreta
-- ============================================================
CREATE OR REPLACE FUNCTION get_warehouse_price_for_date(
  p_warehouse_id UUID,
  p_date         DATE
) RETURNS DECIMAL AS $$
DECLARE
  v_price DECIMAL(12,4);
BEGIN
  SELECT price INTO v_price
  FROM warehouse_price_history
  WHERE warehouse_id = p_warehouse_id
    AND effective_from <= p_date
  ORDER BY effective_from DESC
  LIMIT 1;

  -- Fallback: precio actual del almacén si no hay historial
  IF v_price IS NULL THEN
    SELECT storage_daily_price INTO v_price
    FROM warehouses
    WHERE id = p_warehouse_id;
  END IF;

  RETURN COALESCE(v_price, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 5. Actualizar calculate_storage_costs_for_date
--    Usa el precio histórico en lugar del precio actual
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_storage_costs_for_date(target_date DATE)
RETURNS TABLE(
  p_warehouse_id   UUID,
  p_product_id     UUID,
  p_cost_date      DATE,
  p_pending_qty    DECIMAL,
  p_daily_price    DECIMAL,
  p_total_cost     DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH
    active_inbound AS (
      SELECT
        im.warehouse_id,
        im.product_id,
        SUM(im.quantity) AS total_inbound
      FROM inbound_movements im
      WHERE im.movement_date + im.free_days < target_date
        AND im.movement_date <= target_date
      GROUP BY im.warehouse_id, im.product_id
    ),
    total_outbound AS (
      SELECT
        om.warehouse_id,
        om.product_id,
        SUM(om.quantity) AS total_out
      FROM outbound_movements om
      WHERE om.movement_date + om.free_days < target_date
      GROUP BY om.warehouse_id, om.product_id
    )
  SELECT
    ai.warehouse_id                                                           AS p_warehouse_id,
    ai.product_id                                                             AS p_product_id,
    target_date                                                               AS p_cost_date,
    GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0))               AS p_pending_qty,
    get_warehouse_price_for_date(ai.warehouse_id, target_date)                AS p_daily_price,
    GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0))
      * get_warehouse_price_for_date(ai.warehouse_id, target_date)            AS p_total_cost
  FROM active_inbound ai
  LEFT JOIN total_outbound to2
    ON to2.warehouse_id = ai.warehouse_id
    AND to2.product_id  = ai.product_id
  WHERE GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0)) > 0
    AND get_warehouse_price_for_date(ai.warehouse_id, target_date) > 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 6. Actualizar get_tarifa_for_puesta_day
--    Añade parámetro p_fecha (con DEFAULT CURRENT_DATE)
--    y usa el precio histórico como fallback
-- ============================================================
DROP FUNCTION IF EXISTS get_tarifa_for_puesta_day(UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION get_tarifa_for_puesta_day(
  p_product_id   UUID,
  p_warehouse_id UUID,
  p_dias_activos INTEGER,
  p_fecha        DATE DEFAULT CURRENT_DATE
) RETURNS DECIMAL AS $$
DECLARE
  v_precio DECIMAL(12,4);
BEGIN
  -- Primero: buscar tarifa_tramo específica para el producto
  SELECT tt.precio_diario
    INTO v_precio
    FROM tarifa_tramos tt
   WHERE tt.product_id = p_product_id
     AND tt.active = true
     AND tt.dias_desde <= p_dias_activos
     AND (tt.dias_hasta IS NULL OR tt.dias_hasta >= p_dias_activos)
   ORDER BY tt.dias_desde DESC
   LIMIT 1;

  -- Fallback: precio histórico del almacén en p_fecha
  IF v_precio IS NULL THEN
    v_precio := get_warehouse_price_for_date(p_warehouse_id, p_fecha);
  END IF;

  RETURN COALESCE(v_precio, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 7. Actualizar get_puesta_daily_breakdown
--    Pasa d.dia (fecha real) a get_tarifa_for_puesta_day
--    para que use el precio vigente de cada día
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
    (d.dia - pd.fecha_fin_plancha)::INTEGER                                     AS dias_activos,
    GREATEST(0::DECIMAL, pd.cantidad_inicial - COALESCE(
      (SELECT SUM(sp.cantidad)
         FROM salidas_parciales sp
        WHERE sp.puesta_id = p_puesta_id
          AND sp.tipo IN ('real', 'desaplicacion')
          AND sp.fecha_salida < d.dia),
      0
    ))                                                                          AS cantidad_pendiente,
    get_tarifa_for_puesta_day(
      pd.product_id, pd.warehouse_id,
      (d.dia - pd.fecha_fin_plancha)::INTEGER,
      d.dia::DATE
    )                                                                           AS tarifa_diaria,
    GREATEST(0::DECIMAL, pd.cantidad_inicial - COALESCE(
      (SELECT SUM(sp.cantidad)
         FROM salidas_parciales sp
        WHERE sp.puesta_id = p_puesta_id
          AND sp.tipo IN ('real', 'desaplicacion')
          AND sp.fecha_salida < d.dia),
      0
    )) * get_tarifa_for_puesta_day(
      pd.product_id, pd.warehouse_id,
      (d.dia - pd.fecha_fin_plancha)::INTEGER,
      d.dia::DATE
    )                                                                           AS coste_dia
  FROM puestas_a_disposicion pd
  CROSS JOIN LATERAL (
    SELECT generate_series(v_fecha_inicio, p_fecha_fin, '1 day'::interval)::date AS dia
  ) d
  WHERE pd.id = p_puesta_id
  ORDER BY d.dia;
END;
$$ LANGUAGE plpgsql STABLE;
