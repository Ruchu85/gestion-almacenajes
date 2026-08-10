-- ============================================================
-- Migración 017: los días de plancha cuentan desde el día de
-- la entrada/puesta, incluido (antes se contaba desde el día
-- siguiente, dando un día de plancha de más).
--
-- Ejemplo: entrada/puesta el 10/08 con 10 días de plancha
--   REGLA ANTIGUA → fecha_fin_plancha = 20/08, coste desde 21/08
--   REGLA NUEVA   → fecha_fin_plancha = 19/08, coste desde 20/08
--
-- IMPORTANTE — cambio NO retroactivo: la regla nueva solo se
-- aplica a entradas y puestas creadas (created_at) a partir del
-- corte PLANCHA_CUTOFF definido abajo. Todo lo creado antes sigue
-- calculándose exactamente igual que hasta ahora, se edite o no
-- después del corte (created_at no cambia al editar una fila).
--
-- Aplica a AMBOS schemas: public y dev
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- SCHEMA PUBLIC
-- ══════════════════════════════════════════════════════════════

-- 1. puestas_a_disposicion.fecha_fin_plancha: restar 1 día, pero solo
--    para puestas creadas desde el corte. Es columna GENERATED ALWAYS
--    STORED: no se puede ALTER su expresión, hay que borrarla y
--    recrearla — al recrearla se recalcula para TODAS las filas, pero
--    el CASE hace que las filas anteriores al corte den el mismo
--    resultado que tenían (no cambian).
ALTER TABLE public.puestas_a_disposicion DROP COLUMN fecha_fin_plancha;
ALTER TABLE public.puestas_a_disposicion
  ADD COLUMN fecha_fin_plancha DATE GENERATED ALWAYS AS (
    CASE
      WHEN created_at >= '2026-08-10T00:00:00+02:00'::timestamptz
        THEN fecha_puesta + dias_plancha - 1
      ELSE fecha_puesta + dias_plancha
    END
  ) STORED;

-- 2. calculate_storage_costs_for_date: el umbral de "plancha vencida" en
--    entradas pasa de estricto (<) a inclusivo (<=) SOLO para entradas
--    creadas desde el corte; las anteriores mantienen el umbral de
--    siempre, así que su coste no cambia al recalcular.
CREATE OR REPLACE FUNCTION public.calculate_storage_costs_for_date(target_date DATE)
RETURNS TABLE(
  p_warehouse_id UUID, p_product_id UUID, p_cost_date DATE,
  p_pending_qty DECIMAL, p_daily_price DECIMAL, p_total_cost DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH
    active_inbound AS (
      SELECT im.warehouse_id, im.product_id, SUM(im.quantity) AS total_inbound
      FROM public.inbound_movements im
      WHERE im.movement_date <= target_date
        AND (
          (im.created_at >= '2026-08-10T00:00:00+02:00'::timestamptz
            AND im.movement_date + im.free_days <= target_date)
          OR
          (im.created_at < '2026-08-10T00:00:00+02:00'::timestamptz
            AND im.movement_date + im.free_days < target_date)
        )
      GROUP BY im.warehouse_id, im.product_id
    ),
    total_outbound AS (
      SELECT om.warehouse_id, om.product_id, SUM(om.quantity) AS total_out
      FROM public.outbound_movements om
      WHERE om.movement_date + om.free_days < target_date
      GROUP BY om.warehouse_id, om.product_id
    )
  SELECT
    ai.warehouse_id, ai.product_id, target_date,
    GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0)),
    public.get_warehouse_price_for_date(ai.warehouse_id, target_date),
    GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0))
      * public.get_warehouse_price_for_date(ai.warehouse_id, target_date)
  FROM active_inbound ai
  LEFT JOIN total_outbound to2
    ON to2.warehouse_id = ai.warehouse_id AND to2.product_id = ai.product_id
  WHERE GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0)) > 0
    AND public.get_warehouse_price_for_date(ai.warehouse_id, target_date) > 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- ══════════════════════════════════════════════════════════════
-- SCHEMA DEV  (espejo exacto de public)
-- ══════════════════════════════════════════════════════════════

-- 1. puestas_a_disposicion.fecha_fin_plancha (dev)
ALTER TABLE dev.puestas_a_disposicion DROP COLUMN fecha_fin_plancha;
ALTER TABLE dev.puestas_a_disposicion
  ADD COLUMN fecha_fin_plancha DATE GENERATED ALWAYS AS (
    CASE
      WHEN created_at >= '2026-08-10T00:00:00+02:00'::timestamptz
        THEN fecha_puesta + dias_plancha - 1
      ELSE fecha_puesta + dias_plancha
    END
  ) STORED;

-- 2. calculate_storage_costs_for_date (dev)
CREATE OR REPLACE FUNCTION dev.calculate_storage_costs_for_date(target_date DATE)
RETURNS TABLE(
  p_warehouse_id UUID, p_product_id UUID, p_cost_date DATE,
  p_pending_qty DECIMAL, p_daily_price DECIMAL, p_total_cost DECIMAL
)
LANGUAGE plpgsql STABLE
SET search_path = dev
AS $$
BEGIN
  RETURN QUERY
  WITH
    active_inbound AS (
      SELECT im.warehouse_id, im.product_id, SUM(im.quantity) AS total_inbound
      FROM inbound_movements im
      WHERE im.movement_date <= target_date
        AND (
          (im.created_at >= '2026-08-10T00:00:00+02:00'::timestamptz
            AND im.movement_date + im.free_days <= target_date)
          OR
          (im.created_at < '2026-08-10T00:00:00+02:00'::timestamptz
            AND im.movement_date + im.free_days < target_date)
        )
      GROUP BY im.warehouse_id, im.product_id
    ),
    total_outbound AS (
      SELECT om.warehouse_id, om.product_id, SUM(om.quantity) AS total_out
      FROM outbound_movements om
      WHERE om.movement_date + om.free_days < target_date
      GROUP BY om.warehouse_id, om.product_id
    )
  SELECT
    ai.warehouse_id, ai.product_id, target_date,
    GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0)),
    dev.get_warehouse_price_for_date(ai.warehouse_id, target_date),
    GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0))
      * dev.get_warehouse_price_for_date(ai.warehouse_id, target_date)
  FROM active_inbound ai
  LEFT JOIN total_outbound to2
    ON to2.warehouse_id = ai.warehouse_id AND to2.product_id = ai.product_id
  WHERE GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0)) > 0
    AND dev.get_warehouse_price_for_date(ai.warehouse_id, target_date) > 0;
END;
$$;
