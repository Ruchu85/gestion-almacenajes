import { z } from "zod";

// ============================================================
// PASADA DE VERIFICACIÓN (segunda lectura, enfocada)
// ============================================================

/**
 * Una pesada leída en la pasada de verificación. Deliberadamente mínima: solo
 * los campos que identifican la fila y la cantidad, que es lo que se audita.
 */
export const pesadaVerificacionSchema = z.object({
  ticket: z.string().nullable().optional(),
  matricula: z.string().nullable().optional(),
  /** Valor de la columna NETO, en la unidad impresa en el documento. */
  neto: z.number(),
  unidad: z.string().nullable().optional(),
});

/**
 * Un total declarado por el propio documento ("RET. DIA:", "SALIDAS DIA:").
 * Es la referencia contra la que se cuadra la suma de las pesadas.
 */
export const totalDeclaradoSchema = z.object({
  concepto: z.string(),
  producto: z.string().nullable().optional(),
  valor: z.number(),
  unidad: z.string().nullable().optional(),
});

export const pdfVerificacionSchema = z.object({
  pesadas: z.array(pesadaVerificacionSchema),
  totales: z.array(totalDeclaradoSchema).optional().default([]),
});

export type PesadaVerificacion = z.infer<typeof pesadaVerificacionSchema>;
export type TotalDeclarado = z.infer<typeof totalDeclaradoSchema>;
export type PdfVerificacion = z.infer<typeof pdfVerificacionSchema>;

// ============================================================
// MOVIMIENTOS YA REGISTRADOS (normalizados para comparar)
// ============================================================

/**
 * Un movimiento de salida ya grabado, venga de una puesta a disposición o de
 * una salida directa. Se normalizan ambos orígenes a esta forma para poder
 * reconciliarlos contra las líneas del PDF con un único algoritmo.
 */
export interface RegisteredMovement {
  id: string;
  source: "salida_parcial" | "outbound";
  /** YYYY-MM-DD */
  fecha: string;
  matricula: string | null;
  /** Cantidad en la unidad del sistema. */
  cantidad: number;
  /** Nº de ticket extraído del comentario, si lo lleva. */
  ticket: string | null;
  /** Contrato de la puesta, o descripción del movimiento directo. */
  referencia: string | null;
  comentario: string | null;
}

// ============================================================
// RESULTADO DE LA AUDITORÍA
// ============================================================

/** Cómo ha quedado una línea del PDF frente a lo registrado en el sistema. */
export type AuditLineStatus =
  | "ok"
  | "cantidad_distinta"
  | "fecha_distinta"
  | "no_registrada"
  | "duplicada";

/** Criterio por el que se ha reconciliado la línea, de más a menos fiable. */
export type AuditMatchKey = "ticket" | "matricula_fecha" | "matricula_fecha_cantidad";

/** Aviso concreto colgado de una línea o del documento entero. */
export interface AuditFinding {
  level: "error" | "warning" | "info";
  /** Código estable para poder filtrar/agrupar. */
  code:
    | "lectura_inestable"
    | "descuadre_total"
    | "sospecha_digito"
    | "cantidad_atipica"
    | "sin_ticket"
    | "almacen_no_resuelto"
    | "sobrante";
  message: string;
}

export interface AuditLineResult {
  id: string;
  ticket: string | null;
  matricula: string;
  fecha: string;
  cliente: string | null;
  /** Cantidad ya normalizada a la unidad del sistema. */
  cantidad: number;
  /** Cantidad tal cual impresa en el PDF (kg), cuando hubo conversión. */
  cantidadOrigen: number | null;
  unidadOrigen: string | null;
  status: AuditLineStatus;
  registered: RegisteredMovement | null;
  matchedBy: AuditMatchKey | null;
  /** cantidad del PDF menos cantidad registrada, en unidad del sistema. */
  diferencia: number | null;
  /** Lo que leyó la segunda pasada para esta misma pesada. */
  verificacion: { neto: number; coincide: boolean } | null;
  findings: AuditFinding[];
}

/** Cuadre de la suma de pesadas contra el total que declara el documento. */
export interface AuditTotals {
  declarado: number | null;
  extraido: number;
  unidad: string;
  diferencia: number | null;
  cuadra: boolean;
}

export interface AuditFileReport {
  fileName: string;
  /** false si el PDF no se pudo analizar; entonces `error` explica por qué. */
  ok: boolean;
  error?: string;
  warehouseId: string | null;
  warehouseName: string | null;
  /** Fechas de salida detectadas en el documento. */
  fechas: string[];
  lines: AuditLineResult[];
  /** Registros del sistema en ese almacén y fechas sin línea en el PDF. */
  sobrantes: RegisteredMovement[];
  /** Avisos del documento completo (descuadres, sospechas de dígito). */
  findings: AuditFinding[];
  totals: AuditTotals | null;
}

export interface AuditResult {
  reports: AuditFileReport[];
  /** Resumen agregado para las tarjetas de cabecera del informe. */
  summary: {
    archivos: number;
    lineas: number;
    ok: number;
    diferencias: number;
    noRegistradas: number;
    sobrantes: number;
    errores: number;
  };
}
