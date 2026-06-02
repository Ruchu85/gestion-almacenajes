-- ============================================================
-- Migración 014: Traspaso de Puesta a Disposición
-- Añade el estado 'traspasada' en ambos schemas (public y dev)
-- ============================================================

-- ── PUBLIC ────────────────────────────────────────────────────
ALTER TABLE public.puestas_a_disposicion
  DROP CONSTRAINT IF EXISTS puestas_a_disposicion_estado_check;

ALTER TABLE public.puestas_a_disposicion
  ADD CONSTRAINT puestas_a_disposicion_estado_check
  CHECK (estado IN ('abierta', 'finalizada', 'cerrada_manual', 'traspasada'));

-- ── DEV ───────────────────────────────────────────────────────
ALTER TABLE dev.puestas_a_disposicion
  DROP CONSTRAINT IF EXISTS puestas_a_disposicion_estado_check;

ALTER TABLE dev.puestas_a_disposicion
  ADD CONSTRAINT puestas_a_disposicion_estado_check
  CHECK (estado IN ('abierta', 'finalizada', 'cerrada_manual', 'traspasada'));
