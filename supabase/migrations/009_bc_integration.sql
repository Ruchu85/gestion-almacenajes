-- ============================================================
-- MIGRACIÓN 009: Integración Business Central
--
-- Añade el campo numero_albaran a inbound_movements y
-- outbound_movements para permitir idempotencia: si BC reintenta
-- enviar el mismo albarán, la API devuelve "already_exists"
-- en lugar de crear un duplicado.
--
-- Se usa un índice UNIQUE parcial (WHERE NOT NULL) para que los
-- registros existentes sin numero_albaran no colisionen entre sí.
-- ============================================================

-- Entradas: campo número de albarán de BC
ALTER TABLE inbound_movements
  ADD COLUMN IF NOT EXISTS numero_albaran VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_numero_albaran
  ON inbound_movements(numero_albaran)
  WHERE numero_albaran IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_numero_albaran_lookup
  ON inbound_movements(numero_albaran);

-- Salidas: campo número de albarán de BC
ALTER TABLE outbound_movements
  ADD COLUMN IF NOT EXISTS numero_albaran VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_numero_albaran
  ON outbound_movements(numero_albaran)
  WHERE numero_albaran IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_numero_albaran_lookup
  ON outbound_movements(numero_albaran);

-- ============================================================
-- RLS: los usuarios autenticados pueden ver el nuevo campo
-- (las políticas existentes de ALL ya cubren esto, pero
-- documentamos explícitamente que no se requieren cambios).
-- ============================================================
