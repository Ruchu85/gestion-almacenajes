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
  /** Nombre del cliente/destinatario que retira. Vacío si es salida propia. */
  cliente: z.string().nullable().optional(),
  /** Nº de puesta a disposición / contrato de la fila. Vacío si no hay contrato. */
  numero_puesta: z.string().nullable().optional(),
  /** Puerto/almacén (cabecera del informe). */
  almacen: z.string().nullable().optional(),
  /** Mercancía/producto (cabecera del informe). Desempate. */
  producto: z.string().nullable().optional(),
  /** Fecha de la salida en formato YYYY-MM-DD. */
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  /** Matrícula del camión (cabeza tractora). */
  matricula: z.string().min(1, "Matrícula vacía"),
  /** Matrícula del remolque, si el documento la trae (formato "listado de pesadas"). */
  remolque: z.string().nullable().optional(),
  /** Nº de ticket/pesada, si el documento lo trae (formato "listado de pesadas"). */
  ticket: z.string().nullable().optional(),
  /**
   * Cantidad de la salida, ya normalizada a la unidad del sistema.
   * Puede ser NEGATIVA: los informes traen líneas de devolución/abono (albarán
   * "V…") que restan del total del bloque. Lo único que no tiene sentido es 0.
   */
  cantidad: z.number().refine((v) => v !== 0, "La cantidad no puede ser 0"),
  /** Unidad en la que el documento expresa la cantidad ("kg", "tns", …). */
  unidad: z.string().nullable().optional(),
  /**
   * Cantidad tal cual venía en el PDF, antes de convertir de unidad.
   * Solo se rellena (por la app, no por la IA) cuando ha habido conversión.
   */
  cantidad_origen: z.number().nullable().optional(),
  /** Unidad original del PDF cuando ha habido conversión. */
  unidad_origen: z.string().nullable().optional(),
  /** Unidad del sistema a la que se ha convertido la cantidad. */
  unidad_destino: z.string().nullable().optional(),
});

/**
 * Fila del resumen de saldos por cliente (bloques "CODIGO CUPO" de la primera
 * página del informe de pesadas). Es la cifra que el almacén declara como
 * retirada del día para cada cliente: sirve de control cruzado contra las
 * pesadas y para detectar clientes sin puesta a disposición abierta.
 */
export const pdfResumenClienteSchema = z.object({
  /** Nombre del cliente tal cual figura en la subtabla de saldos. */
  cliente: z.string(),
  /** Código de cupo del bloque al que pertenece la fila. */
  codigo_cupo: z.string().nullable().optional(),
  /** Mercancía del bloque. */
  producto: z.string().nullable().optional(),
  /** Kilos retirados declarados para ese cliente en ese cupo. */
  kg_retirados: z.number(),
});

export const pdfExtractionSchema = z.object({
  lineas: z.array(pdfExtractedLineSchema),
  resumen_clientes: z.array(pdfResumenClienteSchema).optional().default([]),
});

export type PdfExtractedLine = z.infer<typeof pdfExtractedLineSchema>;
export type PdfResumenCliente = z.infer<typeof pdfResumenClienteSchema>;
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
  /**
   * Contraste con la segunda lectura del PDF. `coincide: false` significa que
   * las dos lecturas del documento no leyeron la misma cantidad para esta
   * pesada, así que la cifra no es de fiar y hay que mirarla en el papel.
   * null si esa pesada no se pudo cruzar entre ambas lecturas.
   */
  verificacion?: { neto: number; coincide: boolean } | null;
  /**
   * Presente solo en las líneas NEGATIVAS (devoluciones). `tieneSalidaPositiva`
   * indica si el documento trae también la retirada que esta línea anula: solo
   * en ese caso se puede grabar, porque se sabe contra qué va.
   */
  devolucion?: { tieneSalidaPositiva: boolean } | null;
  /** Almacén resuelto desde BD para tipo='normal'. */
  resolvedWarehouseId?: string | null;
  resolvedWarehouseName?: string | null;
  /** Producto resuelto desde BD para tipo='normal'. */
  resolvedProductId?: string | null;
  resolvedProductName?: string | null;
}

/**
 * Aviso derivado del contraste entre el resumen de saldos del PDF y lo que hay
 * en el sistema. No bloquea nada: se muestra sobre la tabla de propuestas.
 *  - 'error'   → el cliente retiró mercancía pero no hay puesta abierta suya.
 *  - 'warning' → hay descuadre entre los kilos declarados y las pesadas.
 *  - 'info'    → el nombre del PDF y el del sistema no son idénticos pero se
 *                han identificado como el mismo cliente.
 */
export interface PdfResumenAlert {
  level: "error" | "warning" | "info";
  /** Nombre del cliente tal cual viene en el PDF. */
  cliente: string;
  message: string;
}

/** Resultado completo del análisis de un PDF de salidas. */
export interface PdfAnalysisResult {
  proposals: PdfProposalItem[];
  alerts: PdfResumenAlert[];
}

// ============================================================
// CONFIRMACIÓN (lo que el usuario envía para grabar de verdad)
// ============================================================

/** Item de confirmación para salidas vinculadas a una puesta a disposición. */
export const pdfConfirmItemSchema = z.object({
  puesta_id: z.string().uuid("Puesta inválida"),
  fecha_salida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  matricula: z.string().min(1, "La matrícula es obligatoria").max(50),
  // Negativa cuando es una devolución que anula parte de una retirada.
  cantidad: z
    .number()
    .refine((v) => v !== 0, "La cantidad no puede ser 0")
    .refine((v) => Math.abs(v) <= 999999, "Máximo 999.999"),
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
  /** Origen del import, para la traza del comentario ("PDF", "Excel", ...). Por defecto "PDF". */
  origen: z.string().max(30).optional(),
});

export const pdfConfirmNormalesSchema = z.object({
  items: z.array(pdfConfirmNormalItemSchema).min(1, "No hay salidas normales seleccionadas"),
});

export type PdfConfirmNormalItem = z.infer<typeof pdfConfirmNormalItemSchema>;
