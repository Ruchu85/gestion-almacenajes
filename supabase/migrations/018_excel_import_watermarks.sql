-- ============================================================
-- Migración 018: Marca de agua de importación de Excel de salidas
-- Recuerda, por almacén+producto+fuente, hasta qué fecha ya se ha
-- importado un Excel de salidas de puerto, para no re-proponer filas
-- ya registradas en subidas anteriores del mismo fichero.
-- Aplica a AMBOS schemas: public y dev
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- SCHEMA PUBLIC
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.excel_import_watermarks (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id        UUID         NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id          UUID         NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  source              TEXT         NOT NULL DEFAULT 'excel_salidas_puerto',
  last_imported_date  DATE         NOT NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_excel_watermark UNIQUE (warehouse_id, product_id, source)
);
CREATE INDEX IF NOT EXISTS idx_excel_watermark_warehouse_product
  ON public.excel_import_watermarks(warehouse_id, product_id);
ALTER TABLE public.excel_import_watermarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eiw_auth_all"    ON public.excel_import_watermarks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "eiw_service_all" ON public.excel_import_watermarks FOR ALL TO service_role  USING (true) WITH CHECK (true);
CREATE TRIGGER trg_excel_watermark_updated_at
  BEFORE UPDATE ON public.excel_import_watermarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ══════════════════════════════════════════════════════════════
-- SCHEMA DEV  (espejo exacto de public)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dev.excel_import_watermarks (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id        UUID         NOT NULL REFERENCES dev.warehouses(id) ON DELETE CASCADE,
  product_id          UUID         NOT NULL REFERENCES dev.products(id) ON DELETE CASCADE,
  source              TEXT         NOT NULL DEFAULT 'excel_salidas_puerto',
  last_imported_date  DATE         NOT NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dev_excel_watermark UNIQUE (warehouse_id, product_id, source)
);
CREATE INDEX IF NOT EXISTS idx_dev_excel_watermark_warehouse_product
  ON dev.excel_import_watermarks(warehouse_id, product_id);
ALTER TABLE dev.excel_import_watermarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_eiw_auth_all"    ON dev.excel_import_watermarks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dev_eiw_service_all" ON dev.excel_import_watermarks FOR ALL TO service_role  USING (true) WITH CHECK (true);
CREATE TRIGGER trg_dev_excel_watermark_updated_at
  BEFORE UPDATE ON dev.excel_import_watermarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
