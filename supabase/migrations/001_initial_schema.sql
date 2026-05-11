-- ============================================================
-- GESTIÓN DE ALMACENAJES - ESQUEMA COMPLETO
-- Migración 001: Schema inicial
-- ============================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ============================================================
-- FUNCIÓN AUXILIAR: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLA: warehouses (Almacenes)
-- ============================================================
CREATE TABLE IF NOT EXISTS warehouses (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(200) NOT NULL,
  address     TEXT,
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_active ON warehouses(active);
CREATE INDEX IF NOT EXISTS idx_warehouses_code ON warehouses(code);

CREATE TRIGGER trg_warehouses_updated_at
  BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLA: products (Productos)
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id                   UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                 VARCHAR(50)    NOT NULL UNIQUE,
  name                 VARCHAR(200)   NOT NULL,
  storage_daily_price  DECIMAL(12,4)  NOT NULL DEFAULT 0 CHECK (storage_daily_price >= 0),
  unit                 VARCHAR(50)    NOT NULL DEFAULT 'ud',
  active               BOOLEAN        NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLA: suppliers (Proveedores)
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(200) NOT NULL,
  tax_id      VARCHAR(50),
  comments    TEXT,
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(active);
CREATE INDEX IF NOT EXISTS idx_suppliers_tax_id ON suppliers(tax_id);

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLA: customers (Clientes)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(200) NOT NULL,
  tax_id      VARCHAR(50),
  comments    TEXT,
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(active);
CREATE INDEX IF NOT EXISTS idx_customers_tax_id ON customers(tax_id);

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLA: user_profiles (Perfiles de usuario con roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id          UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  full_name   VARCHAR(200),
  role        VARCHAR(20)  NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLA: inbound_movements (Entradas de mercancía)
-- ============================================================
CREATE TABLE IF NOT EXISTS inbound_movements (
  id            UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id  UUID           NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  product_id    UUID           NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  supplier_id   UUID           REFERENCES suppliers(id) ON DELETE SET NULL,
  quantity      DECIMAL(12,3)  NOT NULL CHECK (quantity > 0),
  movement_date DATE           NOT NULL,
  free_days     INTEGER        NOT NULL DEFAULT 0 CHECK (free_days >= 0),
  comments      TEXT,
  created_by    UUID           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbound_warehouse_id ON inbound_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inbound_product_id ON inbound_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inbound_supplier_id ON inbound_movements(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inbound_movement_date ON inbound_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_inbound_warehouse_product ON inbound_movements(warehouse_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inbound_warehouse_product_date ON inbound_movements(warehouse_id, product_id, movement_date);

CREATE TRIGGER trg_inbound_movements_updated_at
  BEFORE UPDATE ON inbound_movements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLA: outbound_movements (Salidas de mercancía)
-- ============================================================
CREATE TABLE IF NOT EXISTS outbound_movements (
  id            UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id  UUID           NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  product_id    UUID           NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  customer_id   UUID           REFERENCES customers(id) ON DELETE SET NULL,
  quantity      DECIMAL(12,3)  NOT NULL CHECK (quantity > 0),
  movement_date DATE           NOT NULL,
  free_days     INTEGER        NOT NULL DEFAULT 0 CHECK (free_days >= 0),
  comments      TEXT,
  created_by    UUID           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_warehouse_id ON outbound_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_outbound_product_id ON outbound_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_outbound_customer_id ON outbound_movements(customer_id);
CREATE INDEX IF NOT EXISTS idx_outbound_movement_date ON outbound_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_outbound_warehouse_product ON outbound_movements(warehouse_id, product_id);
CREATE INDEX IF NOT EXISTS idx_outbound_warehouse_product_date ON outbound_movements(warehouse_id, product_id, movement_date);

CREATE TRIGGER trg_outbound_movements_updated_at
  BEFORE UPDATE ON outbound_movements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLA: storage_costs (Costes de almacenaje diarios)
-- Generada automáticamente - persistencia de costes calculados
-- ============================================================
CREATE TABLE IF NOT EXISTS storage_costs (
  id                UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id      UUID           NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  product_id        UUID           NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  cost_date         DATE           NOT NULL,
  pending_quantity  DECIMAL(12,3)  NOT NULL DEFAULT 0 CHECK (pending_quantity >= 0),
  daily_price       DECIMAL(12,4)  NOT NULL DEFAULT 0 CHECK (daily_price >= 0),
  total_cost        DECIMAL(14,4)  NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE(warehouse_id, product_id, cost_date)
);

CREATE INDEX IF NOT EXISTS idx_storage_costs_warehouse_id ON storage_costs(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_storage_costs_product_id ON storage_costs(product_id);
CREATE INDEX IF NOT EXISTS idx_storage_costs_cost_date ON storage_costs(cost_date);
CREATE INDEX IF NOT EXISTS idx_storage_costs_wh_prod_date ON storage_costs(warehouse_id, product_id, cost_date);
CREATE INDEX IF NOT EXISTS idx_storage_costs_total_cost ON storage_costs(total_cost);

CREATE TRIGGER trg_storage_costs_updated_at
  BEFORE UPDATE ON storage_costs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- FUNCIÓN: handle_new_user
-- Crea perfil automáticamente al registrar usuario
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- FUNCIÓN: calculate_storage_costs_for_date
-- Calcula los costes de almacenaje para una fecha específica.
--
-- LÓGICA DE NEGOCIO:
-- - "Días de plancha" = free_days: días desde la entrada SIN generar coste.
-- - El coste empieza el día SIGUIENTE al vencimiento del periodo gratuito.
-- - pending_quantity = SUM(inbound activos) - SUM(outbound hasta la fecha)
-- - total_cost = pending_quantity * product.storage_daily_price
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
    -- Inbound con periodo de plancha vencido en target_date
    -- movement_date + free_days < target_date => el dia siguiente al vencimiento ya genera coste
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
    -- Outbound total acumulado hasta target_date
    total_outbound AS (
      SELECT
        om.warehouse_id,
        om.product_id,
        SUM(om.quantity) AS total_out
      FROM outbound_movements om
      WHERE om.movement_date <= target_date
      GROUP BY om.warehouse_id, om.product_id
    )
  SELECT
    ai.warehouse_id                                                     AS p_warehouse_id,
    ai.product_id                                                       AS p_product_id,
    target_date                                                         AS p_cost_date,
    GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0))         AS p_pending_qty,
    p.storage_daily_price                                               AS p_daily_price,
    GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0))
      * p.storage_daily_price                                           AS p_total_cost
  FROM active_inbound ai
  LEFT JOIN total_outbound to2
    ON to2.warehouse_id = ai.warehouse_id
    AND to2.product_id  = ai.product_id
  JOIN products p ON p.id = ai.product_id
  WHERE GREATEST(0, ai.total_inbound - COALESCE(to2.total_out, 0)) > 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- FUNCIÓN: recalculate_storage_costs
-- Recalcula y persiste costes para un rango de fechas.
-- Usa UPSERT para evitar duplicados y permitir recálculos.
-- ============================================================
CREATE OR REPLACE FUNCTION recalculate_storage_costs(
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS INTEGER AS $$
DECLARE
  v_current_date DATE := p_start_date;
  v_total_rows   INTEGER := 0;
  v_rows         INTEGER;
BEGIN
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start_date must be <= end_date';
  END IF;

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
    FROM calculate_storage_costs_for_date(v_current_date)
    ON CONFLICT (warehouse_id, product_id, cost_date)
    DO UPDATE SET
      pending_quantity = EXCLUDED.pending_quantity,
      daily_price      = EXCLUDED.daily_price,
      total_cost       = EXCLUDED.total_cost,
      updated_at       = NOW();

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total_rows   := v_total_rows + v_rows;
    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;

  RETURN v_total_rows;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCIÓN: get_stock_summary
-- Vista materializada de stock actual por almacén/producto
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
    p.storage_daily_price                                         AS daily_price,
    GREATEST(0, COALESCE(it.total_in, 0) - COALESCE(ot.total_out, 0))
      * p.storage_daily_price                                     AS daily_cost
  FROM warehouses w
  JOIN inbound_totals it ON it.warehouse_id = w.id
  JOIN products p ON p.id = it.product_id
  LEFT JOIN outbound_totals ot
    ON ot.warehouse_id = it.warehouse_id
    AND ot.product_id  = it.product_id
  WHERE GREATEST(0, COALESCE(it.total_in, 0) - COALESCE(ot.total_out, 0)) > 0
  ORDER BY w.name, p.name;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- FUNCIÓN: get_dashboard_kpis
-- KPIs para el dashboard principal
-- ============================================================
CREATE OR REPLACE FUNCTION get_dashboard_kpis(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(
  total_cost_today        DECIMAL,
  total_cost_month        DECIMAL,
  total_cost_year         DECIMAL,
  active_warehouses       BIGINT,
  active_products         BIGINT,
  pending_stock_units     DECIMAL,
  inbound_month           BIGINT,
  outbound_month          BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Coste total del día
    COALESCE((
      SELECT SUM(sc.total_cost)
      FROM storage_costs sc
      WHERE sc.cost_date = p_date
    ), 0)::DECIMAL AS total_cost_today,

    -- Coste total del mes
    COALESCE((
      SELECT SUM(sc.total_cost)
      FROM storage_costs sc
      WHERE sc.cost_date >= DATE_TRUNC('month', p_date)::DATE
        AND sc.cost_date <= p_date
    ), 0)::DECIMAL AS total_cost_month,

    -- Coste total del año
    COALESCE((
      SELECT SUM(sc.total_cost)
      FROM storage_costs sc
      WHERE sc.cost_date >= DATE_TRUNC('year', p_date)::DATE
        AND sc.cost_date <= p_date
    ), 0)::DECIMAL AS total_cost_year,

    -- Almacenes activos
    (SELECT COUNT(*) FROM warehouses WHERE active = true) AS active_warehouses,

    -- Productos activos
    (SELECT COUNT(*) FROM products WHERE active = true) AS active_products,

    -- Stock total pendiente (unidades)
    COALESCE((
      SELECT SUM(GREATEST(0, i.total_in - COALESCE(o.total_out, 0)))
      FROM (
        SELECT warehouse_id, product_id, SUM(quantity) AS total_in
        FROM inbound_movements GROUP BY warehouse_id, product_id
      ) i
      LEFT JOIN (
        SELECT warehouse_id, product_id, SUM(quantity) AS total_out
        FROM outbound_movements GROUP BY warehouse_id, product_id
      ) o ON o.warehouse_id = i.warehouse_id AND o.product_id = i.product_id
    ), 0)::DECIMAL AS pending_stock_units,

    -- Entradas del mes
    (SELECT COUNT(*)
     FROM inbound_movements
     WHERE movement_date >= DATE_TRUNC('month', p_date)::DATE
       AND movement_date <= p_date
    ) AS inbound_month,

    -- Salidas del mes
    (SELECT COUNT(*)
     FROM outbound_movements
     WHERE movement_date >= DATE_TRUNC('month', p_date)::DATE
       AND movement_date <= p_date
    ) AS outbound_month;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- FUNCIÓN: get_monthly_cost_evolution
-- Evolución de costes por mes para gráficas
-- ============================================================
CREATE OR REPLACE FUNCTION get_monthly_cost_evolution(
  p_months INTEGER DEFAULT 12
)
RETURNS TABLE(
  month       TEXT,
  total_cost  DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(DATE_TRUNC('month', sc.cost_date), 'YYYY-MM') AS month,
    SUM(sc.total_cost)                                     AS total_cost
  FROM storage_costs sc
  WHERE sc.cost_date >= (DATE_TRUNC('month', CURRENT_DATE) - (p_months - 1) * INTERVAL '1 month')::DATE
  GROUP BY DATE_TRUNC('month', sc.cost_date)
  ORDER BY DATE_TRUNC('month', sc.cost_date);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE warehouses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_costs    ENABLE ROW LEVEL SECURITY;

-- ---- user_profiles ----
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

CREATE POLICY "Admins can manage all profiles"
  ON user_profiles FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

-- ---- warehouses ----
CREATE POLICY "Authenticated users can view warehouses"
  ON warehouses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage warehouses"
  ON warehouses FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

-- ---- products ----
CREATE POLICY "Authenticated users can view products"
  ON products FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage products"
  ON products FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

-- ---- suppliers ----
CREATE POLICY "Authenticated users can view suppliers"
  ON suppliers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage suppliers"
  ON suppliers FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

-- ---- customers ----
CREATE POLICY "Authenticated users can view customers"
  ON customers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage customers"
  ON customers FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

-- ---- inbound_movements ----
CREATE POLICY "Authenticated users can view inbound movements"
  ON inbound_movements FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert inbound movements"
  ON inbound_movements FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage inbound movements"
  ON inbound_movements FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

-- ---- outbound_movements ----
CREATE POLICY "Authenticated users can view outbound movements"
  ON outbound_movements FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert outbound movements"
  ON outbound_movements FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage outbound movements"
  ON outbound_movements FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

-- ---- storage_costs ----
CREATE POLICY "Authenticated users can view storage costs"
  ON storage_costs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role can manage storage costs"
  ON storage_costs FOR ALL TO service_role
  USING (true);

-- ============================================================
-- DATOS SEMILLA (seed data para desarrollo)
-- ============================================================
INSERT INTO warehouses (code, name, address) VALUES
  ('ALM-01', 'Almacén Central Madrid', 'Calle Industrial 15, 28001 Madrid'),
  ('ALM-02', 'Almacén Norte Barcelona', 'Polígono Can Pericas 34, 08001 Barcelona'),
  ('ALM-03', 'Almacén Sur Sevilla', 'Zona Franca 7, 41001 Sevilla')
ON CONFLICT (code) DO NOTHING;

INSERT INTO products (code, name, storage_daily_price, unit) VALUES
  ('PROD-001', 'Palés de madera', 0.5000, 'ud'),
  ('PROD-002', 'Contenedor 20"', 12.0000, 'ud'),
  ('PROD-003', 'Bobinas de papel', 2.5000, 'tn'),
  ('PROD-004', 'Maquinaria pesada', 25.0000, 'ud'),
  ('PROD-005', 'Material eléctrico', 1.2000, 'caja')
ON CONFLICT (code) DO NOTHING;

INSERT INTO suppliers (name, tax_id, comments) VALUES
  ('Importaciones García S.L.', 'B12345678', 'Proveedor principal de palés'),
  ('Logística Marítima S.A.', 'A87654321', 'Especialistas en contenedores'),
  ('Papel del Norte S.L.', 'B55667788', 'Proveedor de bobinas')
ON CONFLICT DO NOTHING;

INSERT INTO customers (name, tax_id, comments) VALUES
  ('Distribuciones López S.L.', 'B11223344', 'Cliente habitual zona norte'),
  ('Comercial Martínez S.A.', 'A99887766', 'Gran cliente corporativo'),
  ('Almacenes Rápidos S.L.', 'B44556677', 'Urgencias frecuentes')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CRON JOB: Calcular costes diariamente a las 02:00
-- (Requiere extensión pg_cron habilitada en Supabase)
-- ============================================================
-- SELECT cron.schedule(
--   'calculate-daily-storage-costs',
--   '0 2 * * *',
--   $$SELECT recalculate_storage_costs(CURRENT_DATE, CURRENT_DATE)$$
-- );
