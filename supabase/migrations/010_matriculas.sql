-- Tabla de matrículas para autocompletado
CREATE TABLE IF NOT EXISTS matriculas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value      VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matriculas_value_unique UNIQUE (value)
);

ALTER TABLE matriculas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read matriculas"
  ON matriculas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can upsert matriculas"
  ON matriculas FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Service role can upsert matriculas"
  ON matriculas FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_matriculas_value ON matriculas(value);

-- Añadir columna matricula a outbound_movements
ALTER TABLE outbound_movements
  ADD COLUMN IF NOT EXISTS matricula VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_outbound_matricula ON outbound_movements(matricula)
  WHERE matricula IS NOT NULL;
