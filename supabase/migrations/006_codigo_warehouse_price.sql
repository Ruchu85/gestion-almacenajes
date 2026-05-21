-- ============================================================
-- Migración 006: campo codigo en suppliers/customers
--               + storage_daily_price en warehouses
--               + actualización de funciones SQL
-- ============================================================

-- 1. Añadir campo codigo a suppliers
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS codigo VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_suppliers_codigo ON suppliers(codigo);

-- 2. Añadir campo codigo a customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS codigo VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_customers_codigo ON customers(codigo);

-- 3. Añadir storage_daily_price a warehouses
ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS storage_daily_price DECIMAL(12,4) NOT NULL DEFAULT 0
  CHECK (storage_daily_price >= 0);

CREATE INDEX IF NOT EXISTS idx_warehouses_storage_price ON warehouses(storage_daily_price);

-- ============================================================
-- Actualizar FUNCIÓN: calculate_storage_costs_for_date
-- Ahora usa warehouses.storage_daily_price en lugar de products
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
    ai.warehouse_id                                                     AS p_warehouse_id,
    ai.product_id                                                       AS p_product_id,
    target_date                                                         AS p_cost_date,
    GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0))         AS p_pending_qty,
    w.storage_daily_price                                               AS p_daily_price,
    GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0))
      * w.storage_daily_price                                           AS p_total_cost
  FROM active_inbound ai
  LEFT JOIN total_outbound to2
    ON to2.warehouse_id = ai.warehouse_id
    AND to2.product_id  = ai.product_id
  JOIN warehouses w ON w.id = ai.warehouse_id
  WHERE GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0)) > 0
    AND w.storage_daily_price > 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- Actualizar FUNCIÓN: get_stock_summary
-- Usa warehouses.storage_daily_price
-- ============================================================
CREATE OR REPLACE FUNCTION get_stock_summary()
RETURNS TABLE(
  warehouse_id    UUID,
  warehouse_name  TEXT,
  product_id      UUID,
  product_name    TEXT,
  product_code    TEXT,
  unit            TEXT,
  total_inbound   DECIMAL,
  total_outbound  DECIMAL,
  pending_stock   DECIMAL,
  daily_price     DECIMAL,
  daily_cost      DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH
    inbound_totals AS (
      SELECT im.warehouse_id, im.product_id, SUM(im.quantity) AS total_in
      FROM inbound_movements im
      GROUP BY im.warehouse_id, im.product_id
    ),
    outbound_totals AS (
      SELECT om.warehouse_id, om.product_id, SUM(om.quantity) AS total_out
      FROM outbound_movements om
      GROUP BY om.warehouse_id, om.product_id
    )
  SELECT
    w.id                                                          AS warehouse_id,
    w.name                                                        AS warehouse_name,
    p.id                                                          AS product_id,
    p.name                                                        AS product_name,
    p.code                                                        AS product_code,
    p.unit                                                        AS unit,
    COALESCE(it.total_in, 0)                                      AS total_inbound,
    COALESCE(ot.total_out, 0)                                     AS total_outbound,
    GREATEST(0, COALESCE(it.total_in, 0) - COALESCE(ot.total_out, 0))  AS pending_stock,
    w.storage_daily_price                                         AS daily_price,
    GREATEST(0, COALESCE(it.total_in, 0) - COALESCE(ot.total_out, 0))
      * w.storage_daily_price                                     AS daily_cost
  FROM warehouses w
  JOIN inbound_totals it ON it.warehouse_id = w.id
  JOIN products p ON p.id = it.product_id
  LEFT JOIN outbound_totals ot
    ON ot.warehouse_id = it.warehouse_id
    AND ot.product_id  = it.product_id
  WHERE GREATEST(0, COALESCE(it.total_in, 0) - COALESCE(ot.total_out, 0)) > 0
    AND w.active = true
  ORDER BY w.name, p.name;
END;
$$ LANGUAGE plpgsql STABLE;
