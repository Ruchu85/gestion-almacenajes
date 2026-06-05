import { z } from "zod";

// ============================================================
// EXTRACCIÓN DEL PDF DE "APLICACIÓN" (puesta a disposición)
// Salida cruda de Gemini → validada con Zod.
//
// El documento tiene UNA aplicación por PDF con estos campos:
//   Nº Aplicación · Cliente · Puerto · Producto · Cantidad ·
//   Fecha aplic. · Plancha (FECHA fin de plancha, no nº de días)
// ============================================================

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

export const puestaPdfExtractionSchema = z.object({
  /** Nº de aplicación / contrato (campo "Nº Aplicación"). */
  numero_aplicacion: z.string().nullable().optional(),
  /** Cliente que retira (campo "Cliente"). */
  cliente: z.string().nullable().optional(),
  /** Transitario (campo "Transitario"). Parte del almacén junto al puerto. */
  transitario: z.string().nullable().optional(),
  /** Puerto (campo "Puerto"). Parte del almacén junto al transitario. */
  puerto: z.string().nullable().optional(),
  /** Mercancía (campo "Producto"). */
  producto: z.string().nullable().optional(),
  /** Cantidad inicial (campo "Cantidad", sin la unidad). */
  cantidad: z.number().nullable().optional(),
  /** Fecha de la aplicación = fecha_puesta (campo "Fecha aplic."). */
  fecha_aplicacion: isoDate.nullable().optional(),
  /** Fecha de FIN de plancha (campo "Plancha"). Los días se calculan. */
  fecha_plancha: isoDate.nullable().optional(),
});

export type PuestaPdfExtraction = z.infer<typeof puestaPdfExtractionSchema>;

// ============================================================
// PROPUESTA (resultado del cruce con los maestros)
// ============================================================

/** Estado global de la propuesta. */
export type PuestaProposalState = "listo" | "dudoso" | "error";

/** Referencia ligera a un maestro (almacén/producto/cliente) resuelto. */
export interface MasterRef {
  id: string;
  /** Texto a mostrar, p.ej. "[CLI001] NUTRIMENTOS DEZA". */
  label: string;
}

/** Resultado de resolver un texto del PDF contra un maestro. */
export interface MasterResolution {
  /** Texto original tal cual venía en el PDF. */
  raw: string | null;
  /** Mejor coincidencia (null si no se encontró). */
  match: MasterRef | null;
  /** Otras candidatas cuando hay ambigüedad. */
  candidates: MasterRef[];
}

/** Propuesta lista para revisar y confirmar (una por PDF). */
export interface PuestaProposal {
  /** Datos crudos extraídos, para mostrarlos junto a lo resuelto. */
  extraction: PuestaPdfExtraction;
  /** Valores ya preparados para crear la puesta. */
  numero_contrato: string | null;
  cantidad_inicial: number | null;
  fecha_puesta: string | null;
  /** Calculado: fecha_plancha − fecha_aplicacion (en días). */
  dias_plancha: number | null;
  comentarios: string | null;
  /** Resolución de cada maestro contra la BD. */
  warehouse: MasterResolution;
  product: MasterResolution;
  customer: MasterResolution;
  state: PuestaProposalState;
  /** Avisos no bloqueantes. */
  warnings: string[];
  /** Errores que impiden crear la puesta. */
  errors: string[];
}

// ============================================================
// CONFIRMACIÓN (lo que el usuario envía para crear la puesta)
// ============================================================

export const puestaPdfConfirmSchema = z.object({
  numero_contrato: z.string().max(100).nullable().optional(),
  customer_id: z.string().uuid("Cliente inválido").nullable().optional(),
  product_id: z.string().uuid("Selecciona un producto válido"),
  warehouse_id: z.string().uuid("Selecciona un almacén válido"),
  cantidad_inicial: z
    .number({ invalid_type_error: "La cantidad debe ser un número" })
    .positive("La cantidad debe ser mayor que 0")
    .max(999999, "Máximo 999.999"),
  fecha_puesta: isoDate,
  dias_plancha: z
    .number({ invalid_type_error: "Los días de plancha deben ser un número" })
    .int("Debe ser un número entero")
    .min(0, "Mínimo 0 días")
    .max(365, "Máximo 365 días"),
  comentarios: z.string().max(2000).nullable().optional(),
});

export type PuestaPdfConfirm = z.infer<typeof puestaPdfConfirmSchema>;
