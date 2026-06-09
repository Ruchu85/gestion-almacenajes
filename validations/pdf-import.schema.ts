import { z } from "zod";

// ============================================================
// EXTRACCIÓN DEL PDF (salida cruda de la IA → validada con Zod)
// ============================================================

/**
 * Una línea de salida/retirada detectada en el PDF.
 * La IA debe normalizar fecha a YYYY-MM-DD y cantidad a número decimal.
 * cliente y numero_puesta pueden estar vacíos para salidas propias (sin cliente externo ni contrato).
 */
export const pdfExtractedLineSchema = z.object({
  /** Nombre del cliente que retira (columna "Nombre"). Vacío si es salida propia. */
  cliente: z.string().nullable().optional(),
  /** Nº de puesta a disposición / contrato (columna "Contrato"). Vacío si no hay contrato. */
  numero_puesta: z.string().nullable().optional(),
  /** Puerto/almacén (cabecera del informe, campo "Puerto"). */
  almacen: z.string().nullable().optional(),
  /** Mercancía/producto (cabecera del informe). Desempate. */
  producto: z.string().nullable().optional(),
  /** Fecha de la salida en formato YYYY-MM-DD. */
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  /** Matrícula del camión. */
  matricula: z.string().min(1, "Matrícula vacía"),
  /** Cantidad de la salida (siempre > 0). */
  cantidad: z.number().positive("La cantidad debe ser mayor que 0"),
});

export const pdfExtractionSchema = z.object({
  lineas: z.array(pdfExtractedLineSchema),
});

export type PdfExtractedLine = z.infer<typeof pdfExtractedLineSchema>;
export type PdfExtraction = z.infer<typeof pdfExtractionSchema>;

// ============================================================
// PROPUESTA (resultado del cruce con puestas abiertas)
// ============================================================

export type MatchConfidence = "alta" | "media" | "nula";

/** Referencia ligera a una puesta candidata para el match. */
export interface PuestaMatchRef {
  puesta_id: string;
  numero_contrato: string;
  customer_name: string;
  product_name: string;
  unit: string;
  cantidad_pendiente: number;
  fecha_puesta: string;
}

/**
 * Una propuesta de salida lista para revisar y confirmar.
 * tipo='puesta' → se crea una salida parcial vinculada a una puesta a disposición.
 * tipo='normal' → se crea un outbound_movement directo (salida propia sin contrato).
 */
export interface PdfProposalItem {
  /** Id estable de la fila para el renderizado. */
  id: string;
  /** Tipo de salida que se generará al confirmar. */
  tipo: "puesta" | "normal";
  line: PdfExtractedLine;
  /** Puesta emparejada (la mejor candidata). Null si no hay match o tipo='normal'. */
  match: PuestaMatchRef | null;
  /** Otras puestas candidatas cuando hay ambigüedad. */
  candidates: PuestaMatchRef[];
  confidence: MatchConfidence;
  /** Avisos no bloqueantes (supera pendiente, duplicado, etc.). */
  warnings: string[];
  /** Almacén resuelto desde BD para tipo='normal'. */
  resolvedWarehouseId?: string | null;
  resolvedWarehouseName?: string | null;
  /** Producto resuelto desde BD para tipo='normal'. */
  resolvedProductId?: string | null;
  resolvedProductName?: string | null;
}

// ============================================================
// CONFIRMACIÓN (lo que el usuario envía para grabar de verdad)
// ============================================================

/** Item de confirmación para salidas vinculadas a una puesta a disposición. */
export const pdfConfirmItemSchema = z.object({
  puesta_id: z.string().uuid("Puesta inválida"),
  fecha_salida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  matricula: z.string().min(1, "La matrícula es obligatoria").max(50),
  cantidad: z.number().positive("La cantidad debe ser mayor que 0").max(999999),
  cantidad_pendiente: z.number(),
  n_camion: z.string().max(100).optional().nullable(),
  comentarios: z.string().max(2000).optional().nullable(),
});

export const pdfConfirmSchema = z.object({
  items: z.array(pdfConfirmItemSchema).min(1, "No hay salidas seleccionadas"),
});

export type PdfConfirmItem = z.infer<typeof pdfConfirmItemSchema>;

/** Item de confirmación para salidas normales (outbound_movement directo, sin puesta). */
export const pdfConfirmNormalItemSchema = z.object({
  warehouse_id: z.string().uuid("Almacén inválido"),
  product_id: z.string().uuid("Producto inválido"),
  fecha_salida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  matricula: z.string().min(1, "La matrícula es obligatoria").max(50),
  cantidad: z.number().positive("La cantidad debe ser mayor que 0").max(999999),
  comentarios: z.string().max(2000).optional().nullable(),
});

export const pdfConfirmNormalesSchema = z.object({
  items: z.array(pdfConfirmNormalItemSchema).min(1, "No hay salidas normales seleccionadas"),
});

export type PdfConfirmNormalItem = z.infer<typeof pdfConfirmNormalItemSchema>;
