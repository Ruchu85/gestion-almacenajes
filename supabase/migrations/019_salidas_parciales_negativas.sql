-- ============================================================
-- Migración 019: permitir salidas parciales NEGATIVAS
--
-- Los informes de salidas de puerto traen líneas en negativo
-- (albarán "V…", ej. "VCLA/228"): una retirada que se anula
-- total o parcialmente y cuya mercancía vuelve al almacén.
--
-- Se registran como una salida parcial más, con la cantidad en
-- negativo, para que el historial de la puesta case línea a línea
-- con el PDF. Como todas las agregaciones usan SUM(cantidad), el
-- pendiente del cliente sube solo.
--
-- El CHECK original (cantidad > 0) lo impedía. Se relaja a <> 0:
-- una salida de 0 sigue sin tener sentido.
--
-- Aplica a AMBOS schemas: public y dev.
-- ============================================================

-- ── SCHEMA PUBLIC ──────────────────────────────────────────
ALTER TABLE public.salidas_parciales
  DROP CONSTRAINT IF EXISTS salidas_parciales_cantidad_check;

ALTER TABLE public.salidas_parciales
  ADD CONSTRAINT salidas_parciales_cantidad_check
  CHECK (cantidad <> 0);

-- ── SCHEMA DEV ─────────────────────────────────────────────
ALTER TABLE dev.salidas_parciales
  DROP CONSTRAINT IF EXISTS salidas_parciales_cantidad_check;

ALTER TABLE dev.salidas_parciales
  ADD CONSTRAINT salidas_parciales_cantidad_check
  CHECK (cantidad <> 0);
