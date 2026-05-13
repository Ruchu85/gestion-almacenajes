-- ============================================================
-- MIGRACIÓN 002: Puestas a Disposición
-- Modelo de contratos de disposición con salidas parciales
-- y tarifas escalonadas por tramo
-- ============================================================

-- ============================================================
-- TABLA: tarifa_tramos (Tarifas escalonadas por producto)
-- Permite definir precios distintos según los días que lleve
-- almacenada la mercancía (desde el fin del período de plancha).
-- ============================================================
CREATE TABLE IF NOT EXISTS tarifa_tramos (
  id             UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id     UUID           NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  dias_desde     INTEGER        NOT NULL CHECK (dias_desde >= 1),
  dias_hasta     INTEGER        CHECK (dias_hasta IS NULL OR dias_hasta >= dias_desde),
  precio_diario  DECIMAL(12,4)  NOT NULL CHECK (precio_diario >= 0),
  active         BOOLEAN        NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, dias_desde)
);

CREATE INDEX IF NOT EXISTS idx_tarifa_tramos_product_id ON tarifa_tramos(product_id);
CREATE INDEX IF NOT EXISTS idx_tarifa_tramos_product_active ON tarifa_tramos(product_id, active);

CREATE TRIGGER trg_tarifa_tramos_updated_at
  BEFORE UPDATE ON tarifa_tramos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLA: puestas_a_disposicion (Contratos de disposición)
-- Representa cada lote de mercancía puesto a disposición de un
-- cliente, con sus días de plancha y fecha de inicio de coste.
-- ============================================================
CREATE TABLE IF NOT EXISTS puestas_a_disposicion (
  id                UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_contrato   VARCHAR(100),
  customer_id       UUID           REFERENCES customers(id) ON DELETE SET NULL,
  product_id        UUID           NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id      UUID           NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
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

CREATE INDEX IF NOT EXISTS idx_puestas_customer_id   ON puestas_a_disposicion(customer_id);
CREATE INDEX IF NOT EXISTS idx_puestas_product_id    ON puestas_a_disposicion(product_id);
CREATE INDEX IF NOT EXISTS idx_puestas_warehouse_id  ON puestas_a_disposicion(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_puestas_estado        ON puestas_a_disposicion(estado);
CREATE INDEX IF NOT EXISTS idx_puestas_fecha_puesta  ON puestas_a_disposicion(fecha_puesta);

CREATE TRIGGER trg_puestas_updated_at
  BEFORE UPDATE ON puestas_a_disposicion
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLA: salidas_parciales (Salidas de mercancía por camión)
-- Cada registro representa un camión que retira parte de la
-- mercancía de una puesta a disposición.
-- ============================================================
CREATE TABLE IF NOT EXISTS salidas_parciales (
  id           UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  puesta_id    UUID           NOT NULL REFERENCES puestas_a_disposicion(id) ON DELETE CASCADE,
  fecha_salida DATE           NOT NULL,
  n_camion     VARCHAR(100),
  matricula    VARCHAR(50),
  cantidad     DECIMAL(12,3)  NOT NULL CHECK (cantidad > 0),
  comentarios  TEXT,
  created_by   UUID           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salidas_puesta_id ON salidas_parciales(puesta_id);
CREATE INDEX IF NOT EXISTS idx_salidas_fecha     ON salidas_parciales(fecha_salida);

CREATE TRIGGER trg_salidas_updated_at
  BEFORE UPDATE ON salidas_parciales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- FUNCIÓN: get_tarifa_for_puesta_day
-- Devuelve el precio diario aplicable para un producto en un
-- día concreto (p_dias_activos = días desde fin de plancha).
-- Busca en tarifa_tramos; si no hay tramos, usa storage_daily_price.
-- ============================================================
CREATE OR REPLACE FUNCTION get_tarifa_for_puesta_day(
  p_product_id   UUID,
  p_dias_activos INTEGER
)
RETURNS DECIMAL AS $$
DECLARE
  v_precio DECIMAL(12,4);
BEGIN
  SELECT tt.precio_diario
    INTO v_precio
    FROM tarifa_tramos tt
   WHERE tt.product_id = p_product_id
     AND tt.active = true
     AND tt.dias_desde <= p_dias_activos
     AND (tt.dias_hasta IS NULL OR tt.dias_hasta >= p_dias_activos)
   ORDER BY tt.dias_desde DESC
   LIMIT 1;

  IF v_precio IS NULL THEN
    SELECT p.storage_daily_price
      INTO v_precio
      FROM products p
     WHERE p.id = p_product_id;
  END IF;

  RETURN COALESCE(v_precio, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- FUNCIÓN: get_puesta_daily_breakdown
-- Desglose día a día del coste de una puesta a disposición.
-- p_fecha_inicio: por defecto el primer día de coste (fin_plancha+1).
-- p_fecha_fin: por defecto la fecha actual.
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
    (d.dia - pd.fecha_fin_plancha)::INTEGER                                    AS dias_activos,
    GREATEST(0::DECIMAL, pd.cantidad_inicial - COALESCE(
      (SELECT SUM(sp.cantidad)
         FROM salidas_parciales sp
        WHERE sp.puesta_id = p_puesta_id
          AND sp.fecha_salida < d.dia),
      0
    ))                                                                         AS cantidad_pendiente,
    get_tarifa_for_puesta_day(pd.product_id, (d.dia - pd.fecha_fin_plancha))   AS tarifa_diaria,
    GREATEST(0::DECIMAL, pd.cantidad_inicial - COALESCE(
      (SELECT SUM(sp.cantidad)
         FROM salidas_parciales sp
        WHERE sp.puesta_id = p_puesta_id
          AND sp.fecha_salida < d.dia),
      0
    )) * get_tarifa_for_puesta_day(pd.product_id, (d.dia - pd.fecha_fin_plancha)) AS coste_dia
  FROM puestas_a_disposicion pd
  CROSS JOIN LATERAL (
    SELECT generate_series(v_fecha_inicio, p_fecha_fin, '1 day'::interval)::date AS dia
  ) d
  WHERE pd.id = p_puesta_id
  ORDER BY d.dia;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- FUNCIÓN: get_puesta_summary
-- Resumen completo de una puesta a disposición en una fecha.
-- ============================================================
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
    salidas AS (
      SELECT COALESCE(SUM(sp.cantidad), 0) AS total_salidas
        FROM salidas_parciales sp
       WHERE sp.puesta_id = p_puesta_id
         AND sp.fecha_salida <= p_fecha
    ),
    coste AS (
      SELECT COALESCE(SUM(db.coste_dia), 0) AS total_coste
        FROM get_puesta_daily_breakdown(p_puesta_id, NULL, p_fecha) db
    )
  SELECT
    b.id,
    b.c_name::TEXT                                               AS numero_contrato,
    b.c_name::TEXT                                               AS customer_name,
    b.pr_name::TEXT,
    b.pr_code::TEXT,
    b.pr_unit::TEXT,
    b.w_name::TEXT,
    b.cantidad_inicial,
    s.total_salidas,
    GREATEST(0, b.cantidad_inicial - s.total_salidas)            AS cantidad_pendiente,
    b.fecha_puesta,
    b.dias_plancha,
    b.fecha_fin_plancha,
    GREATEST(0, p_fecha - b.fecha_fin_plancha)::INTEGER          AS dias_activos,
    c.total_coste,
    b.estado::TEXT,
    b.created_at
  FROM base b, salidas s, coste c;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- FUNCIÓN: get_all_puestas_summary
-- Lista de todas las puestas con resumen de costes.
-- ============================================================
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

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE tarifa_tramos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE puestas_a_disposicion  ENABLE ROW LEVEL SECURITY;
ALTER TABLE salidas_parciales      ENABLE ROW LEVEL SECURITY;

-- tarifa_tramos
CREATE POLICY "Authenticated users can view tarifa_tramos"
  ON tarifa_tramos FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage tarifa_tramos"
  ON tarifa_tramos FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

-- puestas_a_disposicion
CREATE POLICY "Authenticated users can view puestas"
  ON puestas_a_disposicion FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert puestas"
  ON puestas_a_disposicion FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage puestas"
  ON puestas_a_disposicion FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

-- salidas_parciales
CREATE POLICY "Authenticated users can view salidas_parciales"
  ON salidas_parciales FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert salidas_parciales"
  ON salidas_parciales FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage salidas_parciales"
  ON salidas_parciales FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));
