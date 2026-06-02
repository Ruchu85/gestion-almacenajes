-- ============================================================
-- Migración 013: Historial de precios por almacén
-- Aplica a AMBOS schemas: public y dev
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- SCHEMA PUBLIC
-- ══════════════════════════════════════════════════════════════

-- 1. Tabla de historial (public)
CREATE TABLE IF NOT EXISTS public.warehouse_price_history (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id   UUID          NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  price          DECIMAL(12,4) NOT NULL CHECK (price >= 0),
  effective_from DATE          NOT NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wph_warehouse_date UNIQUE (warehouse_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_wph_warehouse_date
  ON public.warehouse_price_history(warehouse_id, effective_from DESC);
ALTER TABLE public.warehouse_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wph_auth_select" ON public.warehouse_price_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "wph_auth_all"    ON public.warehouse_price_history FOR ALL   TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "wph_service_all" ON public.warehouse_price_history FOR ALL   TO service_role  USING (true) WITH CHECK (true);

-- 2. Semilla desde precios actuales (public)
INSERT INTO public.warehouse_price_history (warehouse_id, price, effective_from)
SELECT id, storage_daily_price, '2000-01-01'::DATE
FROM public.warehouses
WHERE storage_daily_price > 0
ON CONFLICT (warehouse_id, effective_from) DO NOTHING;

-- 3. Trigger para nuevos almacenes (public)
CREATE OR REPLACE FUNCTION public.warehouse_insert_price_history_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.storage_daily_price > 0 THEN
    INSERT INTO public.warehouse_price_history (warehouse_id, price, effective_from)
    VALUES (NEW.id, NEW.storage_daily_price, NEW.created_at::DATE)
    ON CONFLICT (warehouse_id, effective_from) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS warehouse_insert_price_history ON public.warehouses;
CREATE TRIGGER warehouse_insert_price_history
  AFTER INSERT ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.warehouse_insert_price_history_fn();

-- 4. Helper: precio vigente en fecha (public)
CREATE OR REPLACE FUNCTION public.get_warehouse_price_for_date(
  p_warehouse_id UUID,
  p_date         DATE
) RETURNS DECIMAL AS $$
DECLARE v_price DECIMAL(12,4);
BEGIN
  SELECT price INTO v_price
  FROM public.warehouse_price_history
  WHERE warehouse_id = p_warehouse_id AND effective_from <= p_date
  ORDER BY effective_from DESC LIMIT 1;
  IF v_price IS NULL THEN
    SELECT storage_daily_price INTO v_price FROM public.warehouses WHERE id = p_warehouse_id;
  END IF;
  RETURN COALESCE(v_price, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- 5. calculate_storage_costs_for_date usa precio histórico (public)
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
      WHERE im.movement_date + im.free_days < target_date AND im.movement_date <= target_date
      GROUP BY im.warehouse_id, im.product_id
    ),
    total_outbound AS (
      SELECT om.warehouse_id, om.product_id, SUM(om.quantity) AS total_out
      FROM public.outbound_movements om
      WHERE om.movement_date + om.free_days < target_date
      GROUP BY om.warehouse_id, om.product_id
    )
  SELECT
    ai.warehouse_id,
    ai.product_id,
    target_date,
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

-- 6. get_tarifa_for_puesta_day usa precio histórico (public)
DROP FUNCTION IF EXISTS public.get_tarifa_for_puesta_day(UUID, UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.get_tarifa_for_puesta_day(
  p_product_id   UUID,
  p_warehouse_id UUID,
  p_dias_activos INTEGER,
  p_fecha        DATE DEFAULT CURRENT_DATE
) RETURNS DECIMAL AS $$
DECLARE v_precio DECIMAL(12,4);
BEGIN
  SELECT tt.precio_diario INTO v_precio
  FROM public.tarifa_tramos tt
  WHERE tt.product_id = p_product_id AND tt.active = true
    AND tt.dias_desde <= p_dias_activos
    AND (tt.dias_hasta IS NULL OR tt.dias_hasta >= p_dias_activos)
  ORDER BY tt.dias_desde DESC LIMIT 1;
  IF v_precio IS NULL THEN
    v_precio := public.get_warehouse_price_for_date(p_warehouse_id, p_fecha);
  END IF;
  RETURN COALESCE(v_precio, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- 7. get_puesta_daily_breakdown pasa fecha al cálculo de tarifa (public)
CREATE OR REPLACE FUNCTION public.get_puesta_daily_breakdown(
  p_puesta_id    UUID,
  p_fecha_inicio DATE DEFAULT NULL,
  p_fecha_fin    DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(dia DATE, dias_activos INTEGER, cantidad_pendiente DECIMAL, tarifa_diaria DECIMAL, coste_dia DECIMAL)
AS $$
DECLARE v_fecha_inicio DATE;
BEGIN
  SELECT COALESCE(p_fecha_inicio, pd.fecha_fin_plancha + 1)
    INTO v_fecha_inicio FROM public.puestas_a_disposicion pd WHERE pd.id = p_puesta_id;
  IF v_fecha_inicio IS NULL OR v_fecha_inicio > p_fecha_fin THEN RETURN; END IF;
  RETURN QUERY
  SELECT
    d.dia::DATE,
    (d.dia - pd.fecha_fin_plancha)::INTEGER,
    GREATEST(0::DECIMAL, pd.cantidad_inicial - COALESCE(
      (SELECT SUM(sp.cantidad) FROM public.salidas_parciales sp
       WHERE sp.puesta_id = p_puesta_id AND sp.tipo IN ('real','desaplicacion') AND sp.fecha_salida < d.dia), 0)),
    public.get_tarifa_for_puesta_day(pd.product_id, pd.warehouse_id, (d.dia - pd.fecha_fin_plancha)::INTEGER, d.dia::DATE),
    GREATEST(0::DECIMAL, pd.cantidad_inicial - COALESCE(
      (SELECT SUM(sp.cantidad) FROM public.salidas_parciales sp
       WHERE sp.puesta_id = p_puesta_id AND sp.tipo IN ('real','desaplicacion') AND sp.fecha_salida < d.dia), 0))
    * public.get_tarifa_for_puesta_day(pd.product_id, pd.warehouse_id, (d.dia - pd.fecha_fin_plancha)::INTEGER, d.dia::DATE)
  FROM public.puestas_a_disposicion pd
  CROSS JOIN LATERAL (
    SELECT generate_series(v_fecha_inicio, p_fecha_fin, '1 day'::interval)::date AS dia
  ) d
  WHERE pd.id = p_puesta_id
  ORDER BY d.dia;
END;
$$ LANGUAGE plpgsql STABLE;


-- ══════════════════════════════════════════════════════════════
-- SCHEMA DEV  (espejo exacto de public)
-- ══════════════════════════════════════════════════════════════

-- 1. Tabla de historial (dev)
CREATE TABLE IF NOT EXISTS dev.warehouse_price_history (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id   UUID          NOT NULL REFERENCES dev.warehouses(id) ON DELETE CASCADE,
  price          DECIMAL(12,4) NOT NULL CHECK (price >= 0),
  effective_from DATE          NOT NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dev_wph_warehouse_date UNIQUE (warehouse_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_dev_wph_warehouse_date
  ON dev.warehouse_price_history(warehouse_id, effective_from DESC);
ALTER TABLE dev.warehouse_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_wph_auth_all"    ON dev.warehouse_price_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dev_wph_service_all" ON dev.warehouse_price_history FOR ALL TO service_role  USING (true) WITH CHECK (true);

-- 2. Semilla desde precios actuales (dev)
INSERT INTO dev.warehouse_price_history (warehouse_id, price, effective_from)
SELECT id, storage_daily_price, '2000-01-01'::DATE
FROM dev.warehouses
WHERE storage_daily_price > 0
ON CONFLICT (warehouse_id, effective_from) DO NOTHING;

-- 3. Trigger para nuevos almacenes (dev)
CREATE OR REPLACE FUNCTION dev.warehouse_insert_price_history_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.storage_daily_price > 0 THEN
    INSERT INTO dev.warehouse_price_history (warehouse_id, price, effective_from)
    VALUES (NEW.id, NEW.storage_daily_price, NEW.created_at::DATE)
    ON CONFLICT (warehouse_id, effective_from) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS dev_warehouse_insert_price_history ON dev.warehouses;
CREATE TRIGGER dev_warehouse_insert_price_history
  AFTER INSERT ON dev.warehouses
  FOR EACH ROW EXECUTE FUNCTION dev.warehouse_insert_price_history_fn();

-- 4. Helper: precio vigente en fecha (dev)
CREATE OR REPLACE FUNCTION dev.get_warehouse_price_for_date(
  p_warehouse_id UUID,
  p_date         DATE
) RETURNS DECIMAL
LANGUAGE plpgsql STABLE
SET search_path = dev
AS $$
DECLARE v_price DECIMAL(12,4);
BEGIN
  SELECT price INTO v_price
  FROM warehouse_price_history
  WHERE warehouse_id = p_warehouse_id AND effective_from <= p_date
  ORDER BY effective_from DESC LIMIT 1;
  IF v_price IS NULL THEN
    SELECT storage_daily_price INTO v_price FROM warehouses WHERE id = p_warehouse_id;
  END IF;
  RETURN COALESCE(v_price, 0);
END;
$$;

-- 5. calculate_storage_costs_for_date usa precio histórico (dev)
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
      WHERE im.movement_date + im.free_days < target_date AND im.movement_date <= target_date
      GROUP BY im.warehouse_id, im.product_id
    ),
    total_outbound AS (
      SELECT om.warehouse_id, om.product_id, SUM(om.quantity) AS total_out
      FROM outbound_movements om
      WHERE om.movement_date + om.free_days < target_date
      GROUP BY om.warehouse_id, om.product_id
    )
  SELECT
    ai.warehouse_id,
    ai.product_id,
    target_date,
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

-- 6. get_tarifa_for_puesta_day usa precio histórico (dev)
DROP FUNCTION IF EXISTS dev.get_tarifa_for_puesta_day(UUID, UUID, INTEGER);
CREATE OR REPLACE FUNCTION dev.get_tarifa_for_puesta_day(
  p_product_id   UUID,
  p_warehouse_id UUID,
  p_dias_activos INTEGER,
  p_fecha        DATE DEFAULT CURRENT_DATE
) RETURNS DECIMAL
LANGUAGE plpgsql STABLE
SET search_path = dev
AS $$
DECLARE v_precio DECIMAL(12,4);
BEGIN
  SELECT tt.precio_diario INTO v_precio
  FROM tarifa_tramos tt
  WHERE tt.product_id = p_product_id AND tt.active = true
    AND tt.dias_desde <= p_dias_activos
    AND (tt.dias_hasta IS NULL OR tt.dias_hasta >= p_dias_activos)
  ORDER BY tt.dias_desde DESC LIMIT 1;
  IF v_precio IS NULL THEN
    v_precio := dev.get_warehouse_price_for_date(p_warehouse_id, p_fecha);
  END IF;
  RETURN COALESCE(v_precio, 0);
END;
$$;

-- 7. get_puesta_daily_breakdown pasa fecha al cálculo de tarifa (dev)
CREATE OR REPLACE FUNCTION dev.get_puesta_daily_breakdown(
  p_puesta_id    UUID,
  p_fecha_inicio DATE DEFAULT NULL,
  p_fecha_fin    DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(dia DATE, dias_activos INTEGER, cantidad_pendiente DECIMAL, tarifa_diaria DECIMAL, coste_dia DECIMAL)
LANGUAGE plpgsql STABLE
SET search_path = dev
AS $$
DECLARE v_fecha_inicio DATE;
BEGIN
  SELECT COALESCE(p_fecha_inicio, pd.fecha_fin_plancha + 1)
    INTO v_fecha_inicio FROM puestas_a_disposicion pd WHERE pd.id = p_puesta_id;
  IF v_fecha_inicio IS NULL OR v_fecha_inicio > p_fecha_fin THEN RETURN; END IF;
  RETURN QUERY
  SELECT
    d.dia::DATE,
    (d.dia - pd.fecha_fin_plancha)::INTEGER,
    GREATEST(0::DECIMAL, pd.cantidad_inicial - COALESCE(
      (SELECT SUM(sp.cantidad) FROM salidas_parciales sp
       WHERE sp.puesta_id = p_puesta_id AND sp.tipo IN ('real','desaplicacion') AND sp.fecha_salida < d.dia), 0)),
    dev.get_tarifa_for_puesta_day(pd.product_id, pd.warehouse_id, (d.dia - pd.fecha_fin_plancha)::INTEGER, d.dia::DATE),
    GREATEST(0::DECIMAL, pd.cantidad_inicial - COALESCE(
      (SELECT SUM(sp.cantidad) FROM salidas_parciales sp
       WHERE sp.puesta_id = p_puesta_id AND sp.tipo IN ('real','desaplicacion') AND sp.fecha_salida < d.dia), 0))
    * dev.get_tarifa_for_puesta_day(pd.product_id, pd.warehouse_id, (d.dia - pd.fecha_fin_plancha)::INTEGER, d.dia::DATE)
  FROM puestas_a_disposicion pd
  CROSS JOIN LATERAL (
    SELECT generate_series(v_fecha_inicio, p_fecha_fin, '1 day'::interval)::date AS dia
  ) d
  WHERE pd.id = p_puesta_id
  ORDER BY d.dia;
END;
$$;
