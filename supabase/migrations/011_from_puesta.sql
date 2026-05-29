-- Identifica las salidas generadas automáticamente por el sistema de puestas
-- (retiradas de camión, auto-salidas de plancha, rebases).
-- Las salidas manuales mantienen el valor por defecto FALSE.
ALTER TABLE outbound_movements
  ADD COLUMN IF NOT EXISTS from_puesta BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_outbound_from_puesta
  ON outbound_movements(from_puesta)
  WHERE from_puesta = TRUE;
