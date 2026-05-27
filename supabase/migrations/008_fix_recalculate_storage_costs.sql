-- ============================================================
-- MIGRACIÓN 008: Corregir recalculate_storage_costs
--
-- PROBLEMA: La función anterior usaba ON CONFLICT DO UPDATE (UPSERT).
-- Cuando se eliminan movimientos (entradas o salidas), los registros
-- de storage_costs para ese rango de fechas NO se borraban, quedando
-- datos obsoletos que ya no corresponden a movimientos reales.
--
-- SOLUCIÓN: Eliminar primero todos los registros del rango y luego
-- insertar desde cero según los movimientos actuales.
-- ============================================================

CREATE OR REPLACE FUNCTION recalculate_storage_costs(
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS INTEGER AS $$
DECLARE
  v_current_date DATE    := p_start_date;
  v_total_rows   INTEGER := 0;
  v_rows         INTEGER;
BEGIN
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start_date must be <= end_date';
  END IF;

  -- Eliminar todos los registros del rango para que el recálculo refleje
  -- exactamente los movimientos actuales (incluyendo bajas/eliminaciones).
  DELETE FROM storage_costs
  WHERE cost_date >= p_start_date
    AND cost_date <= p_end_date;

  WHILE v_current_date <= p_end_date LOOP
    INSERT INTO storage_costs (
      warehouse_id,
      product_id,
      cost_date,
      pending_quantity,
      daily_price,
      total_cost
    )
    SELECT
      p_warehouse_id,
      p_product_id,
      p_cost_date,
      p_pending_qty,
      p_daily_price,
      p_total_cost
    FROM calculate_storage_costs_for_date(v_current_date);

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total_rows   := v_total_rows + v_rows;
    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;

  RETURN v_total_rows;
END;
$$ LANGUAGE plpgsql;
