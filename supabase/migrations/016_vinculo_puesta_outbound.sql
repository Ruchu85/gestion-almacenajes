-- ============================================================
-- MIGRACIÓN 016: Vincular las salidas de stock con la puesta
--                y la salida parcial que las generó
--
-- PROBLEMA: los outbound_movements generados por una puesta a
-- disposición (auto-salida de fin de plancha, retiradas dentro
-- de plancha y rebases) no guardaban ninguna referencia a su
-- origen. Para localizarlos había que adivinar por
-- (warehouse_id, product_id, movement_date, from_puesta), lo que
-- falla cuando dos puestas del mismo almacén y producto
-- coinciden en fecha, y hace imposible reubicarlos cuando cambia
-- la fecha de fin de plancha.
--
-- SOLUCIÓN: dos referencias explícitas.
--   · puesta_id         → la puesta que originó la salida.
--   · salida_parcial_id → la salida parcial concreta. Con
--     ON DELETE CASCADE, borrar la salida parcial retira también
--     su movimiento de stock (antes quedaba huérfano y el stock
--     del calendario se descuadraba).
--
-- Se aplica a los DOS schemas: public (Producción) y dev
-- (Desarrollo).
-- ============================================================

-- ============================================================
-- SCHEMA public
-- ============================================================
ALTER TABLE public.outbound_movements
  ADD COLUMN IF NOT EXISTS puesta_id UUID
    REFERENCES public.puestas_a_disposicion(id) ON DELETE SET NULL;

ALTER TABLE public.outbound_movements
  ADD COLUMN IF NOT EXISTS salida_parcial_id UUID
    REFERENCES public.salidas_parciales(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_outbound_puesta_id
  ON public.outbound_movements(puesta_id);
CREATE INDEX IF NOT EXISTS idx_outbound_salida_parcial_id
  ON public.outbound_movements(salida_parcial_id);

-- ── Backfill conservador ───────────────────────────────────
-- Solo se vincula cuando la correspondencia es INEQUÍVOCA: una
-- única salida parcial candidata para ese movimiento y un único
-- movimiento candidato para esa salida parcial. Lo ambiguo se
-- deja a NULL a propósito; el código sigue tolerando el vínculo
-- ausente y cae al emparejamiento por fecha.
WITH candidatos AS (
  SELECT
    om.id                                     AS outbound_id,
    sp.id                                     AS salida_id,
    sp.puesta_id                              AS puesta_id,
    COUNT(*) OVER (PARTITION BY om.id)        AS salidas_por_movimiento,
    COUNT(*) OVER (PARTITION BY sp.id)        AS movimientos_por_salida
  FROM public.outbound_movements om
  JOIN public.salidas_parciales sp
    ON sp.fecha_salida = om.movement_date
   AND sp.cantidad     = om.quantity
  JOIN public.puestas_a_disposicion pd
    ON pd.id           = sp.puesta_id
   AND pd.warehouse_id = om.warehouse_id
   AND pd.product_id   = om.product_id
  WHERE om.from_puesta = true
    AND om.salida_parcial_id IS NULL
)
UPDATE public.outbound_movements om
   SET salida_parcial_id = c.salida_id,
       puesta_id         = c.puesta_id
  FROM candidatos c
 WHERE om.id = c.outbound_id
   AND c.salidas_por_movimiento = 1
   AND c.movimientos_por_salida = 1;

-- Los que siguen sin salida parcial identificada (rebases, y
-- cualquier ambigüedad) pueden al menos apuntar a su puesta
-- cuando solo hay una puesta posible para ese almacén/producto.
WITH unicos AS (
  SELECT
    om.id                              AS outbound_id,
    MIN(pd.id::TEXT)::UUID             AS puesta_id,
    COUNT(DISTINCT pd.id)              AS n_puestas
  FROM public.outbound_movements om
  JOIN public.puestas_a_disposicion pd
    ON pd.warehouse_id = om.warehouse_id
   AND pd.product_id   = om.product_id
   AND om.movement_date >= pd.fecha_puesta
  WHERE om.from_puesta = true
    AND om.puesta_id IS NULL
  GROUP BY om.id
)
UPDATE public.outbound_movements om
   SET puesta_id = u.puesta_id
  FROM unicos u
 WHERE om.id = u.outbound_id
   AND u.n_puestas = 1;

-- ============================================================
-- SCHEMA dev
-- ============================================================
ALTER TABLE dev.outbound_movements
  ADD COLUMN IF NOT EXISTS puesta_id UUID
    REFERENCES dev.puestas_a_disposicion(id) ON DELETE SET NULL;

ALTER TABLE dev.outbound_movements
  ADD COLUMN IF NOT EXISTS salida_parcial_id UUID
    REFERENCES dev.salidas_parciales(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_dev_outbound_puesta_id
  ON dev.outbound_movements(puesta_id);
CREATE INDEX IF NOT EXISTS idx_dev_outbound_salida_parcial_id
  ON dev.outbound_movements(salida_parcial_id);

WITH candidatos AS (
  SELECT
    om.id                                     AS outbound_id,
    sp.id                                     AS salida_id,
    sp.puesta_id                              AS puesta_id,
    COUNT(*) OVER (PARTITION BY om.id)        AS salidas_por_movimiento,
    COUNT(*) OVER (PARTITION BY sp.id)        AS movimientos_por_salida
  FROM dev.outbound_movements om
  JOIN dev.salidas_parciales sp
    ON sp.fecha_salida = om.movement_date
   AND sp.cantidad     = om.quantity
  JOIN dev.puestas_a_disposicion pd
    ON pd.id           = sp.puesta_id
   AND pd.warehouse_id = om.warehouse_id
   AND pd.product_id   = om.product_id
  WHERE om.from_puesta = true
    AND om.salida_parcial_id IS NULL
)
UPDATE dev.outbound_movements om
   SET salida_parcial_id = c.salida_id,
       puesta_id         = c.puesta_id
  FROM candidatos c
 WHERE om.id = c.outbound_id
   AND c.salidas_por_movimiento = 1
   AND c.movimientos_por_salida = 1;

WITH unicos AS (
  SELECT
    om.id                              AS outbound_id,
    MIN(pd.id::TEXT)::UUID             AS puesta_id,
    COUNT(DISTINCT pd.id)              AS n_puestas
  FROM dev.outbound_movements om
  JOIN dev.puestas_a_disposicion pd
    ON pd.warehouse_id = om.warehouse_id
   AND pd.product_id   = om.product_id
   AND om.movement_date >= pd.fecha_puesta
  WHERE om.from_puesta = true
    AND om.puesta_id IS NULL
  GROUP BY om.id
)
UPDATE dev.outbound_movements om
   SET puesta_id = u.puesta_id
  FROM unicos u
 WHERE om.id = u.outbound_id
   AND u.n_puestas = 1;

-- Refrescar la caché de esquema de PostgREST para que la API
-- reconozca las columnas nuevas de inmediato.
NOTIFY pgrst, 'reload schema';
