-- ============================================================
-- MIGRACIÓN 012: Schema de desarrollo (dev)
--
-- Crea un schema "dev" idéntico al "public" para pruebas
-- sin afectar datos de producción.
--
-- PASOS TRAS EJECUTAR ESTE SQL:
--   1. Supabase Dashboard → Settings → API
--   2. "Extra schemas" → añadir "dev"
--   3. Guardar cambios
-- ============================================================

CREATE SCHEMA IF NOT EXISTS dev;

-- ============================================================
-- TABLAS
-- ============================================================

CREATE TABLE IF NOT EXISTS dev.warehouses (
  id                   UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                 VARCHAR(50)    NOT NULL UNIQUE,
  name                 VARCHAR(200)   NOT NULL,
  address              TEXT,
  posicion_cerrada     VARCHAR(200),
  storage_daily_price  DECIMAL(12,4)  NOT NULL DEFAULT 0 CHECK (storage_daily_price >= 0),
  active               BOOLEAN        NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_warehouses_active ON dev.warehouses(active);
CREATE INDEX IF NOT EXISTS idx_dev_warehouses_code   ON dev.warehouses(code);
CREATE TRIGGER trg_dev_warehouses_updated_at
  BEFORE UPDATE ON dev.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS dev.products (
  id                   UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                 VARCHAR(50)    NOT NULL UNIQUE,
  name                 VARCHAR(200)   NOT NULL,
  storage_daily_price  DECIMAL(12,4)  NOT NULL DEFAULT 0 CHECK (storage_daily_price >= 0),
  unit                 VARCHAR(50)    NOT NULL DEFAULT 'ud',
  active               BOOLEAN        NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_products_active ON dev.products(active);
CREATE INDEX IF NOT EXISTS idx_dev_products_code   ON dev.products(code);
CREATE TRIGGER trg_dev_products_updated_at
  BEFORE UPDATE ON dev.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS dev.suppliers (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(200) NOT NULL,
  codigo      VARCHAR(50),
  tax_id      VARCHAR(50),
  comments    TEXT,
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_suppliers_active ON dev.suppliers(active);
CREATE INDEX IF NOT EXISTS idx_dev_suppliers_codigo ON dev.suppliers(codigo);
CREATE TRIGGER trg_dev_suppliers_updated_at
  BEFORE UPDATE ON dev.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS dev.customers (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(200) NOT NULL,
  codigo      VARCHAR(50),
  tax_id      VARCHAR(50),
  comments    TEXT,
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_customers_active ON dev.customers(active);
CREATE INDEX IF NOT EXISTS idx_dev_customers_codigo ON dev.customers(codigo);
CREATE TRIGGER trg_dev_customers_updated_at
  BEFORE UPDATE ON dev.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- user_profiles comparte con public (misma auth)
-- Las sesiones/perfiles son los mismos en dev y prod

CREATE TABLE IF NOT EXISTS dev.inbound_movements (
  id             UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id   UUID           NOT NULL REFERENCES dev.warehouses(id)  ON DELETE RESTRICT,
  product_id     UUID           NOT NULL REFERENCES dev.products(id)    ON DELETE RESTRICT,
  supplier_id    UUID           REFERENCES dev.suppliers(id)            ON DELETE SET NULL,
  quantity       DECIMAL(12,3)  NOT NULL CHECK (quantity > 0),
  movement_date  DATE           NOT NULL,
  free_days      INTEGER        NOT NULL DEFAULT 0 CHECK (free_days >= 0),
  comments       TEXT,
  numero_albaran VARCHAR(100),
  created_by     UUID           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_inbound_numero_albaran
  ON dev.inbound_movements(numero_albaran) WHERE numero_albaran IS NOT NULL;
CREATE TRIGGER trg_dev_inbound_updated_at
  BEFORE UPDATE ON dev.inbound_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS dev.outbound_movements (
  id             UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id   UUID           NOT NULL REFERENCES dev.warehouses(id)  ON DELETE RESTRICT,
  product_id     UUID           NOT NULL REFERENCES dev.products(id)    ON DELETE RESTRICT,
  customer_id    UUID           REFERENCES dev.customers(id)            ON DELETE SET NULL,
  quantity       DECIMAL(12,3)  NOT NULL CHECK (quantity > 0),
  movement_date  DATE           NOT NULL,
  free_days      INTEGER        NOT NULL DEFAULT 0 CHECK (free_days >= 0),
  comments       TEXT,
  numero_albaran VARCHAR(100),
  matricula      VARCHAR(50),
  from_puesta    BOOLEAN        NOT NULL DEFAULT FALSE,
  created_by     UUID           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_outbound_numero_albaran
  ON dev.outbound_movements(numero_albaran) WHERE numero_albaran IS NOT NULL;
CREATE TRIGGER trg_dev_outbound_updated_at
  BEFORE UPDATE ON dev.outbound_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS dev.storage_costs (
  id               UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id     UUID           NOT NULL REFERENCES dev.warehouses(id)  ON DELETE RESTRICT,
  product_id       UUID           NOT NULL REFERENCES dev.products(id)    ON DELETE RESTRICT,
  cost_date        DATE           NOT NULL,
  pending_quantity DECIMAL(12,3)  NOT NULL DEFAULT 0 CHECK (pending_quantity >= 0),
  daily_price      DECIMAL(12,4)  NOT NULL DEFAULT 0 CHECK (daily_price >= 0),
  total_cost       DECIMAL(14,4)  NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE(warehouse_id, product_id, cost_date)
);
CREATE TRIGGER trg_dev_storage_costs_updated_at
  BEFORE UPDATE ON dev.storage_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS dev.tarifa_tramos (
  id             UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id     UUID           NOT NULL REFERENCES dev.products(id) ON DELETE CASCADE,
  dias_desde     INTEGER        NOT NULL CHECK (dias_desde >= 1),
  dias_hasta     INTEGER        CHECK (dias_hasta IS NULL OR dias_hasta >= dias_desde),
  precio_diario  DECIMAL(12,4)  NOT NULL CHECK (precio_diario >= 0),
  active         BOOLEAN        NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, dias_desde)
);
CREATE TRIGGER trg_dev_tarifa_updated_at
  BEFORE UPDATE ON dev.tarifa_tramos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS dev.puestas_a_disposicion (
  id                UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_contrato   VARCHAR(100),
  customer_id       UUID           REFERENCES dev.customers(id)  ON DELETE SET NULL,
  product_id        UUID           NOT NULL REFERENCES dev.products(id)   ON DELETE RESTRICT,
  warehouse_id      UUID           NOT NULL REFERENCES dev.warehouses(id) ON DELETE RESTRICT,
  cantidad_inicial  DECIMAL(12,3)  NOT NULL CHECK (cantidad_inicial > 0),
  fecha_puesta      DATE           NOT NULL,
  dias_plancha      INTEGER        NOT NULL DEFAULT 0 CHECK (dias_plancha >= 0),
  fecha_fin_plancha DATE           GENERATED ALWAYS AS (fecha_puesta + dias_plancha) STORED,
  estado            VARCHAR(20)    NOT NULL DEFAULT 'abierta'
                                   CHECK (estado IN ('abierta', 'finalizada', 'cerrada_manual')),
  comentarios       TEXT,
  created_by        UUID           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_puestas_estado ON dev.puestas_a_disposicion(estado);
CREATE TRIGGER trg_dev_puestas_updated_at
  BEFORE UPDATE ON dev.puestas_a_disposicion
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS dev.salidas_parciales (
  id           UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  puesta_id    UUID           NOT NULL REFERENCES dev.puestas_a_disposicion(id) ON DELETE CASCADE,
  fecha_salida DATE           NOT NULL,
  n_camion     VARCHAR(100),
  matricula    VARCHAR(50),
  cantidad     DECIMAL(12,3)  NOT NULL CHECK (cantidad > 0),
  tipo         VARCHAR(20)    NOT NULL DEFAULT 'real'
                              CHECK (tipo IN ('real', 'plancha', 'desaplicacion')),
  comentarios  TEXT,
  created_by   UUID           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_salidas_puesta_id ON dev.salidas_parciales(puesta_id);
CREATE TRIGGER trg_dev_salidas_updated_at
  BEFORE UPDATE ON dev.salidas_parciales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS dev.puesta_facturacion_meses (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  puesta_id   UUID         NOT NULL REFERENCES dev.puestas_a_disposicion(id) ON DELETE CASCADE,
  year_month  VARCHAR(7)   NOT NULL,
  invoiced_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT uq_dev_pfm_puesta_month UNIQUE (puesta_id, year_month)
);

CREATE TABLE IF NOT EXISTS dev.matriculas (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  value      VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dev_matriculas_value_unique UNIQUE (value)
);

CREATE TABLE IF NOT EXISTS dev.monthly_invoices (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id   UUID        NOT NULL REFERENCES dev.warehouses(id)  ON DELETE CASCADE,
  product_id     UUID        NOT NULL REFERENCES dev.products(id)    ON DELETE CASCADE,
  year_month     VARCHAR(7)  NOT NULL,
  invoice_amount DECIMAL(12,2),
  invoice_ref    VARCHAR(200),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dev_monthly_invoice UNIQUE (warehouse_id, product_id, year_month)
);

-- ============================================================
-- RLS (simplificado: authenticated puede todo en dev)
-- ============================================================

ALTER TABLE dev.warehouses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.products                ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.suppliers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.customers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.inbound_movements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.outbound_movements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.storage_costs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.tarifa_tramos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.puestas_a_disposicion   ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.salidas_parciales       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.puesta_facturacion_meses ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.matriculas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.monthly_invoices        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'dev.warehouses','dev.products','dev.suppliers','dev.customers',
    'dev.inbound_movements','dev.outbound_movements','dev.storage_costs',
    'dev.tarifa_tramos','dev.puestas_a_disposicion','dev.salidas_parciales',
    'dev.puesta_facturacion_meses','dev.matriculas','dev.monthly_invoices'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "dev_authenticated_all" ON %s FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;

-- service_role también puede todo (para createServiceClient)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'dev.warehouses','dev.products','dev.suppliers','dev.customers',
    'dev.inbound_movements','dev.outbound_movements','dev.storage_costs',
    'dev.tarifa_tramos','dev.puestas_a_disposicion','dev.salidas_parciales',
    'dev.puesta_facturacion_meses','dev.matriculas','dev.monthly_invoices'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "dev_service_role_all" ON %s FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- FUNCIONES (SET search_path = dev → referencian tablas dev.*)
-- ============================================================

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
      WHERE im.movement_date + im.free_days < target_date
        AND im.movement_date <= target_date
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
    w.storage_daily_price,
    GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0)) * w.storage_daily_price
  FROM active_inbound ai
  LEFT JOIN total_outbound to2 ON to2.warehouse_id = ai.warehouse_id AND to2.product_id = ai.product_id
  JOIN warehouses w ON w.id = ai.warehouse_id
  WHERE GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0)) > 0
    AND w.storage_daily_price > 0;
END;
$$;

CREATE OR REPLACE FUNCTION dev.recalculate_storage_costs(p_start_date DATE, p_end_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = dev
AS $$
DECLARE
  v_current_date DATE    := p_start_date;
  v_total_rows   INTEGER := 0;
  v_rows         INTEGER;
BEGIN
  IF p_start_date > p_end_date THEN RAISE EXCEPTION 'start_date must be <= end_date'; END IF;
  DELETE FROM storage_costs WHERE cost_date >= p_start_date AND cost_date <= p_end_date;
  WHILE v_current_date <= p_end_date LOOP
    INSERT INTO storage_costs (warehouse_id, product_id, cost_date, pending_quantity, daily_price, total_cost)
    SELECT p_warehouse_id, p_product_id, p_cost_date, p_pending_qty, p_daily_price, p_total_cost
    FROM dev.calculate_storage_costs_for_date(v_current_date);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total_rows   := v_total_rows + v_rows;
    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;
  RETURN v_total_rows;
END;
$$;

CREATE OR REPLACE FUNCTION dev.get_tarifa_for_puesta_day(
  p_product_id UUID, p_warehouse_id UUID, p_dias_activos INTEGER
)
RETURNS DECIMAL
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
    SELECT w.storage_daily_price INTO v_precio FROM warehouses w WHERE w.id = p_warehouse_id;
  END IF;
  RETURN COALESCE(v_precio, 0);
END;
$$;

CREATE OR REPLACE FUNCTION dev.get_puesta_daily_breakdown(
  p_puesta_id UUID, p_fecha_inicio DATE DEFAULT NULL, p_fecha_fin DATE DEFAULT CURRENT_DATE
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
    dev.get_tarifa_for_puesta_day(pd.product_id, pd.warehouse_id, (d.dia - pd.fecha_fin_plancha)),
    GREATEST(0::DECIMAL, pd.cantidad_inicial - COALESCE(
      (SELECT SUM(sp.cantidad) FROM salidas_parciales sp
       WHERE sp.puesta_id = p_puesta_id AND sp.tipo IN ('real','desaplicacion') AND sp.fecha_salida < d.dia), 0))
    * dev.get_tarifa_for_puesta_day(pd.product_id, pd.warehouse_id, (d.dia - pd.fecha_fin_plancha))
  FROM puestas_a_disposicion pd
  CROSS JOIN LATERAL (
    SELECT generate_series(v_fecha_inicio, p_fecha_fin, '1 day'::interval)::date AS dia
  ) d
  WHERE pd.id = p_puesta_id
  ORDER BY d.dia;
END;
$$;

CREATE OR REPLACE FUNCTION dev.get_puesta_summary(p_puesta_id UUID, p_fecha DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(
  puesta_id UUID, numero_contrato TEXT, customer_name TEXT, product_name TEXT, product_code TEXT,
  unit TEXT, warehouse_name TEXT, cantidad_inicial DECIMAL, cantidad_salida DECIMAL,
  cantidad_pendiente DECIMAL, cantidad_fisica_pendiente DECIMAL, fecha_puesta DATE,
  dias_plancha INTEGER, fecha_fin_plancha DATE, dias_activos INTEGER,
  coste_acumulado DECIMAL, estado TEXT, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE
SET search_path = dev
AS $$
BEGIN
  RETURN QUERY
  WITH
    base AS (
      SELECT pd.*, COALESCE(c.name,'') AS c_name, pr.name AS pr_name, pr.code AS pr_code,
             pr.unit AS pr_unit, w.name AS w_name
      FROM puestas_a_disposicion pd
      LEFT JOIN customers c ON c.id = pd.customer_id
      JOIN products pr ON pr.id = pd.product_id
      JOIN warehouses w ON w.id = pd.warehouse_id
      WHERE pd.id = p_puesta_id
    ),
    salidas_billing AS (
      SELECT COALESCE(SUM(sp.cantidad), 0) AS total FROM salidas_parciales sp
      WHERE sp.puesta_id = p_puesta_id AND sp.tipo IN ('real','desaplicacion') AND sp.fecha_salida <= p_fecha
    ),
    salidas_reales AS (
      SELECT COALESCE(SUM(sp.cantidad), 0) AS total FROM salidas_parciales sp
      WHERE sp.puesta_id = p_puesta_id AND sp.tipo = 'real' AND sp.fecha_salida <= p_fecha
    ),
    coste AS (
      SELECT COALESCE(SUM(db.coste_dia), 0) AS total_coste
      FROM dev.get_puesta_daily_breakdown(p_puesta_id, NULL, p_fecha) db
    )
  SELECT b.id, COALESCE(b.numero_contrato,'')::TEXT, b.c_name::TEXT, b.pr_name::TEXT, b.pr_code::TEXT,
         b.pr_unit::TEXT, b.w_name::TEXT, b.cantidad_inicial,
         sb.total, (b.cantidad_inicial - sb.total), (b.cantidad_inicial - sr.total),
         b.fecha_puesta, b.dias_plancha, b.fecha_fin_plancha,
         GREATEST(0, p_fecha - b.fecha_fin_plancha)::INTEGER,
         c.total_coste, b.estado::TEXT, b.created_at
  FROM base b, salidas_billing sb, salidas_reales sr, coste c;
END;
$$;

CREATE OR REPLACE FUNCTION dev.get_all_puestas_summary(p_fecha DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(
  puesta_id UUID, numero_contrato TEXT, customer_name TEXT, product_name TEXT, product_code TEXT,
  unit TEXT, warehouse_name TEXT, cantidad_inicial DECIMAL, cantidad_salida DECIMAL,
  cantidad_pendiente DECIMAL, cantidad_fisica_pendiente DECIMAL, fecha_puesta DATE,
  dias_plancha INTEGER, fecha_fin_plancha DATE, dias_activos INTEGER,
  coste_acumulado DECIMAL, estado TEXT, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE
SET search_path = dev
AS $$
BEGIN
  RETURN QUERY
  SELECT ps.* FROM puestas_a_disposicion pd
  CROSS JOIN LATERAL dev.get_puesta_summary(pd.id, p_fecha) ps
  ORDER BY pd.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION dev.get_dashboard_kpis(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(
  total_cost_today DECIMAL, total_cost_month DECIMAL, total_cost_year DECIMAL,
  active_warehouses BIGINT, active_products BIGINT, pending_stock_units DECIMAL,
  inbound_month BIGINT, outbound_month BIGINT
)
LANGUAGE plpgsql STABLE
SET search_path = dev
AS $$
BEGIN
  RETURN QUERY SELECT
    COALESCE((SELECT SUM(sc.total_cost) FROM storage_costs sc WHERE sc.cost_date = p_date), 0)::DECIMAL,
    COALESCE((SELECT SUM(sc.total_cost) FROM storage_costs sc WHERE sc.cost_date >= DATE_TRUNC('month',p_date)::DATE AND sc.cost_date <= p_date), 0)::DECIMAL,
    COALESCE((SELECT SUM(sc.total_cost) FROM storage_costs sc WHERE sc.cost_date >= DATE_TRUNC('year',p_date)::DATE AND sc.cost_date <= p_date), 0)::DECIMAL,
    (SELECT COUNT(*) FROM warehouses WHERE active = true),
    (SELECT COUNT(*) FROM products WHERE active = true),
    COALESCE((SELECT SUM(GREATEST(0, i.total_in - COALESCE(o.total_out,0)))
      FROM (SELECT warehouse_id,product_id,SUM(quantity) AS total_in FROM inbound_movements GROUP BY 1,2) i
      LEFT JOIN (SELECT warehouse_id,product_id,SUM(quantity) AS total_out FROM outbound_movements GROUP BY 1,2) o
      ON o.warehouse_id=i.warehouse_id AND o.product_id=i.product_id), 0)::DECIMAL,
    (SELECT COUNT(*) FROM inbound_movements WHERE movement_date >= DATE_TRUNC('month',p_date)::DATE AND movement_date <= p_date),
    (SELECT COUNT(*) FROM outbound_movements WHERE movement_date >= DATE_TRUNC('month',p_date)::DATE AND movement_date <= p_date);
END;
$$;

CREATE OR REPLACE FUNCTION dev.get_monthly_cost_evolution(p_months INTEGER DEFAULT 12)
RETURNS TABLE(month TEXT, total_cost DECIMAL)
LANGUAGE plpgsql STABLE
SET search_path = dev
AS $$
BEGIN
  RETURN QUERY
  SELECT TO_CHAR(DATE_TRUNC('month', sc.cost_date), 'YYYY-MM'), SUM(sc.total_cost)
  FROM storage_costs sc
  WHERE sc.cost_date >= (DATE_TRUNC('month', CURRENT_DATE) - (p_months-1) * INTERVAL '1 month')::DATE
  GROUP BY DATE_TRUNC('month', sc.cost_date)
  ORDER BY DATE_TRUNC('month', sc.cost_date);
END;
$$;
