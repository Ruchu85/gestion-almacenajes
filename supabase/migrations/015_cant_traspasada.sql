-- ============================================================
-- Migración 015: campo cant_traspasada en puestas_a_disposicion
-- Se rellena cuando se traspasa una puesta y se usa para
-- incrementar la Cant. Invendida del almacén origen.
-- ============================================================

-- PUBLIC
ALTER TABLE public.puestas_a_disposicion
  ADD COLUMN IF NOT EXISTS cant_traspasada DECIMAL(12,3) NOT NULL DEFAULT 0
  CHECK (cant_traspasada >= 0);

-- DEV
ALTER TABLE dev.puestas_a_disposicion
  ADD COLUMN IF NOT EXISTS cant_traspasada DECIMAL(12,3) NOT NULL DEFAULT 0
  CHECK (cant_traspasada >= 0);
