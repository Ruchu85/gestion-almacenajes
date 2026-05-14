-- ============================================================
-- MIGRACIÓN 004: Facturas mensuales de almacenaje
-- Permite registrar la factura recibida del proveedor de
-- almacenaje por cada mes, para conciliación de costes.
-- ============================================================

CREATE TABLE IF NOT EXISTS monthly_invoices (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id     UUID        NOT NULL REFERENCES warehouses(id)  ON DELETE CASCADE,
  product_id       UUID        NOT NULL REFERENCES products(id)    ON DELETE CASCADE,
  year_month       VARCHAR(7)  NOT NULL,          -- "YYYY-MM"
  invoice_amount   DECIMAL(12,2),
  invoice_ref      VARCHAR(200),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_monthly_invoice UNIQUE (warehouse_id, product_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_invoices_wh_prod
  ON monthly_invoices(warehouse_id, product_id);

CREATE TRIGGER trg_monthly_invoices_updated_at
  BEFORE UPDATE ON monthly_invoices
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE monthly_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view monthly invoices"
  ON monthly_invoices FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage monthly invoices"
  ON monthly_invoices FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
