import { z } from "zod";
import type { PdfAnalysisResult } from "@/validations/pdf-import.schema";

/** Info del origen detectado en el Excel (almacén, producto, barco). */
export interface ExcelSourceInfo {
  almacenDetectado: string | null;
  productoDetectado: string | null;
  barco: string | null;
  resolvedWarehouseId: string | null;
  resolvedProductId: string | null;
}

/** Resultado completo del análisis de un Excel de salidas. */
export interface ExcelAnalysisResult extends PdfAnalysisResult {
  sourceInfo: ExcelSourceInfo;
  fechaMin: string | null;
  fechaMax: string | null;
  /** Fecha desde la que se proponen filas por defecto (día siguiente al último import). */
  suggestedFechaDesde: string | null;
  /** Avisos de filas omitidas durante el parseo (datos incompletos, etc.). */
  parseWarnings: string[];
}

export const updateWatermarkSchema = z.object({
  warehouse_id: z.string().uuid("Almacén inválido"),
  product_id: z.string().uuid("Producto inválido"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
});

export type UpdateWatermarkInput = z.infer<typeof updateWatermarkSchema>;
