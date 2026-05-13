-- ============================================================
-- MIGRACIÓN 003: tipo en salidas_parciales + auto-plancha-exit logic
-- ============================================================

-- Añadir columna tipo a salidas_parciales
ALTER TABLE salidas_parciales
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'real'
    CHECK (tipo IN ('real', 'plancha'));

CREATE INDEX IF NOT EXISTS idx_salidas_tipo ON salidas_parciales(puesta_id, tipo);

-- ============================================================
-- FUNCIÓN actualizada: get_puesta_daily_breakdown
-- Ahora diferencia entre salidas reales y salidas de plancha.
-- Las salidas 'plancha' actúan como exit automático al fin de plancha:
-- a partir de fecha_fin_plancha + 1, la cantidad para facturación es 0.
-- El cliente puede seguir retirando (salidas 'real' post-plancha)
-- que se registran pero no generan coste al usuario.
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
    (d.dia - pd.fecha_fin_plancha)::INTEGER                                AS dias_activos,
    -- Cantidad facturable: considera TODAS las salidas (real + plancha) hasta ese día
    GREATEST(0::DECIMAL, pd.cantidad_inicial - COALESCE(
      (SELECT SUM(sp.cantidad)
         FROM salidas_parciales sp
        WHERE sp.puesta_id = p_puesta_id
          AND sp.fecha_salida < d.dia),
      0
    ))                                                                     AS cantidad_pendiente,
    get_tarifa_for_puesta_day(pd.product_id, (d.dia - pd.fecha_fin_plancha)) AS tarifa_diaria,
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
-- FUNCIÓN: create_plancha_auto_exit
-- Crea automáticamente una salida de tipo 'plancha' para la
-- cantidad pendiente en fecha_fin_plancha, si no existe ya.
-- Llamar desde la aplicación cuando se detecte que
-- fecha_fin_plancha < CURRENT_DATE y no hay salida 'plancha'.
-- ============================================================
CREATE OR REPLACE FUNCTION create_plancha_auto_exit(p_puesta_id UUID)
RETURNS VOID AS $$
DECLARE
  v_pendiente DECIMAL;
  v_fecha_fin DATE;
  v_ya_existe BOOLEAN;
BEGIN
  -- Verificar si ya existe una salida de plancha
  SELECT EXISTS(
    SELECT 1 FROM salidas_parciales
     WHERE puesta_id = p_puesta_id AND tipo = 'plancha'
  ) INTO v_ya_existe;

  IF v_ya_existe THEN
    RETURN;
  END IF;

  -- Calcular cantidad pendiente en la fecha de fin de plancha
  SELECT
    pd.fecha_fin_plancha,
    GREATEST(0, pd.cantidad_inicial - COALESCE(
      (SELECT SUM(sp2.cantidad)
         FROM salidas_parciales sp2
        WHERE sp2.puesta_id = pd.id
          AND sp2.tipo = 'real'
          AND sp2.fecha_salida <= pd.fecha_fin_plancha),
      0
    ))
  INTO v_fecha_fin, v_pendiente
  FROM puestas_a_disposicion pd
  WHERE pd.id = p_puesta_id;

  IF v_pendiente > 0 THEN
    INSERT INTO salidas_parciales (puesta_id, fecha_salida, cantidad, tipo, comentarios)
    VALUES (p_puesta_id, v_fecha_fin, v_pendiente, 'plancha', 'Traspaso automático al cliente por fin de plancha');
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCIÓN get_puesta_summary — actualizada para cantidad física
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
    sb.total                                                        AS cantidad_salida,
    GREATEST(0, b.cantidad_inicial - sb.total)                     AS cantidad_pendiente,
    GREATEST(0, b.cantidad_inicial - sr.total)                     AS cantidad_fisica_pendiente,
    b.fecha_puesta,
    b.dias_plancha,
    b.fecha_fin_plancha,
    GREATEST(0, p_fecha - b.fecha_fin_plancha)::INTEGER            AS dias_activos,
    c.total_coste,
    b.estado::TEXT,
    b.created_at
  FROM base b, salidas_billing sb, salidas_reales sr, coste c;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- FUNCIÓN get_all_puestas_summary — actualizada
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
