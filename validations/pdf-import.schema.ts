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
  /**
   * Matrícula del camión (cabeza tractora).
   *
   * NO se exige aquí a propósito. Antes era `min(1)` y bastaba con que la IA
   * devolviera una fila sin matrícula para que `safeParse` tumbara el
   * documento ENTERO — y con él las decenas de filas buenas — con un
   * "formato inesperado" que no decía nada. Una fila sin matrícula no es un
   * problema de formato sino de contenido (casi siempre una fila de ENTRADA
   * colada como salida), así que se filtra en `parsePdfExtraction`, que la
   * descarta una a una y deja constancia para el usuario.
   */
  matricula: z.string().default(""),
  /** Matrícula del remolque, si el documento la trae (formato "listado de pesadas"). */
  remolque: z.string().nullable().optional(),
  /** Nº de ticket/pesada, si el documento lo trae (formato "listado de pesadas"). */
  ticket: z.string().nullable().optional(),
  /**
   * Cantidad de la salida, ya normalizada a la unidad del sistema.
   * Puede ser NEGATIVA: los informes traen líneas de devolución/abono (albarán
   * "V…") que restan del total del bloque. Lo único que no tiene sentido es 0,
   * pero eso tampoco se rechaza aquí (mismo motivo que en `matricula`): lo
   * filtra `parsePdfExtraction` fila a fila.
   */
  cantidad: z.number(),
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
// LECTURA TOLERANTE DE LO QUE DEVUELVE LA IA
// ============================================================

/**
 * Una fila que la IA devolvió pero que NO es una salida grabable, con el
 * motivo. Se cuenta y se enseña al usuario: descartar filas en silencio en una
 * app que mueve cantidades es justo lo que no se puede hacer.
 */
export interface PdfLineaDescartada {
  motivo: "sin_matricula" | "cantidad_cero" | "campos_invalidos";
  /** Lo poco que se sabe de la fila, para poder localizarla en el papel. */
  descripcion: string;
  /** Cantidad que traía, si se pudo leer. Para poder cuadrar contra el PDF. */
  cantidad: number | null;
}

/** Resultado de leer la respuesta cruda de la IA. */
export type PdfExtractionParse =
  | {
      ok: true;
      lineas: PdfExtractedLine[];
      resumen_clientes: PdfResumenCliente[];
      descartadas: PdfLineaDescartada[];
    }
  | { ok: false; error: string };

/** Envoltorio mínimo: lo único que de verdad tiene que traer la respuesta. */
const pdfExtractionEnvelopeSchema = z.object({
  lineas: z.array(z.unknown()),
  resumen_clientes: z.array(z.unknown()).optional().default([]),
});

/** Texto corto que identifica una fila descartada en el informe. */
function describirFila(raw: unknown): string {
  const o = (raw ?? {}) as Record<string, unknown>;
  const partes = [o.fecha, o.cliente, o.numero_puesta, o.matricula, o.ticket]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  return partes.length > 0 ? partes.join(" · ").slice(0, 120) : "fila sin datos identificables";
}

/**
 * Convierte la respuesta cruda de la IA en líneas utilizables, DESCARTANDO fila
 * a fila lo que no sirve en vez de rechazar el documento entero.
 *
 * El porqué, con un caso real: el informe del 03/09/2026 traía un bloque de 69
 * filas que eran todas ENTRADAS de mercancía (columna "Salidas" a 0,00). La IA
 * las devolvió como salidas, tomando el valor de la columna "Entradas" y sin
 * matrícula. Con la validación anterior —un `safeParse` de todo el objeto— esas
 * 69 filas malas tiraban también las 18 buenas, que estaban perfectas y
 * cuadraban al céntimo con los totales impresos, y el usuario solo veía "La IA
 * devolvió los datos en un formato inesperado".
 *
 * Reglas de descarte (deliberadamente pocas y explicables):
 *  · la fila no encaja en el esquema             → `campos_invalidos`
 *  · cantidad 0                                  → `cantidad_cero`
 *  · sin matrícula NI ticket                     → `sin_matricula`
 * Esa última es la red de seguridad contra las filas de entrada: en los cuatro
 * informes reales revisados, TODA salida trae matrícula (Formato A) o nº de
 * ticket (Formato B), y ninguna fila de entrada trae ninguna de las dos cosas.
 */
export function parsePdfExtraction(raw: unknown): PdfExtractionParse {
  const envelope = pdfExtractionEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return {
      ok: false,
      error:
        "La IA no devolvió la lista de salidas esperada (falta el campo 'lineas' o no es una lista).",
    };
  }

  const lineas: PdfExtractedLine[] = [];
  const descartadas: PdfLineaDescartada[] = [];

  for (const item of envelope.data.lineas) {
    const fila = pdfExtractedLineSchema.safeParse(item);
    if (!fila.success) {
      const cantidad = (item as { cantidad?: unknown })?.cantidad;
      descartadas.push({
        motivo: "campos_invalidos",
        descripcion: `${describirFila(item)} (${fila.error.issues[0]?.message ?? "datos ilegibles"})`,
        cantidad: typeof cantidad === "number" ? cantidad : null,
      });
      continue;
    }
    const linea = fila.data;
    if (linea.cantidad === 0) {
      descartadas.push({
        motivo: "cantidad_cero",
        descripcion: describirFila(item),
        cantidad: 0,
      });
      continue;
    }
    if (!linea.matricula.trim() && !(linea.ticket ?? "").trim()) {
      descartadas.push({
        motivo: "sin_matricula",
        descripcion: describirFila(item),
        cantidad: linea.cantidad,
      });
      continue;
    }
    lineas.push(linea);
  }

  // El resumen de saldos es un control cruzado, no un dato que se grabe: si una
  // de sus filas viene mal, se ignora esa fila y ya. Nunca debe tumbar nada.
  const resumen_clientes: PdfResumenCliente[] = [];
  for (const item of envelope.data.resumen_clientes) {
    const fila = pdfResumenClienteSchema.safeParse(item);
    if (fila.success) resumen_clientes.push(fila.data);
  }

  if (lineas.length === 0) {
    return {
      ok: false,
      error:
        descartadas.length > 0
          ? `No se ha encontrado ninguna salida grabable en el documento. La IA devolvió ${descartadas.length} ${descartadas.length === 1 ? "fila" : "filas"}, pero ninguna es una salida válida (${resumirMotivos(descartadas)}). Si el informe SÍ tiene salidas, reinténtalo o prueba con el motor alternativo.`
          : "No se detectaron salidas/retiradas en el documento.",
    };
  }

  return { ok: true, lineas, resumen_clientes, descartadas };
}

/** "69 sin matrícula, 2 con datos ilegibles" — para el mensaje de error. */
export function resumirMotivos(descartadas: PdfLineaDescartada[]): string {
  const etiquetas: Record<PdfLineaDescartada["motivo"], string> = {
    sin_matricula: "sin matrícula ni ticket",
    cantidad_cero: "con cantidad 0",
    campos_invalidos: "con datos ilegibles",
  };
  const cuenta = new Map<PdfLineaDescartada["motivo"], number>();
  for (const d of descartadas) cuenta.set(d.motivo, (cuenta.get(d.motivo) ?? 0) + 1);
  return [...cuenta.entries()].map(([motivo, n]) => `${n} ${etiquetas[motivo]}`).join(", ");
}

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
 * La fila deja la puesta con pendiente NEGATIVO, contando las retiradas que
 * el propio PDF imputa a esa misma puesta antes que ella.
 */
export interface RebaseInfo {
  numero_contrato: string;
  unit: string;
  /** Pendiente de la puesta justo antes de aplicar esta fila. */
  pendienteAntes: number;
  /** Pendiente que quedaría al aplicarla (siempre negativo). */
  pendienteDespues: number;
  /** Cuánto se pasa, en positivo. */
  exceso: number;
  /**
   * `true` si es esta fila la que cruza a negativo; `false` si la puesta ya
   * venía rebasada por otra fila anterior del mismo documento.
   */
  cruzaLaRaya: boolean;
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
  /**
   * Solo para tipo='normal': stock físico actual (entradas − salidas, todo el
   * histórico) del producto resuelto en el almacén resuelto. Null si no se
   * pudo calcular (falta resolver almacén o producto).
   */
  stockDisponible?: number | null;
  /**
   * Solo para tipo='normal': la cantidad de la línea supera el stock físico
   * disponible (incluye el caso de stock 0). No se puede grabar como salida
   * directa sin stock que descontar; el usuario tiene que resolverlo primero
   * en el sistema.
   */
  stockInsuficiente?: boolean;
  /**
   * Solo para tipo='puesta': al imputar esta fila, la puesta se queda con
   * pendiente negativo. Null / ausente si cabe sin problema. Nunca se marca
   * por defecto, pero el usuario puede marcarla si la retirada es correcta.
   */
  rebase?: RebaseInfo | null;
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
  /**
   * Filas que la IA devolvió y que se han descartado por no ser salidas
   * grabables. Se enseñan en el diálogo: el usuario tiene que poder comprobar
   * contra el papel que no se ha caído nada que sí importaba.
   */
  descartadas: PdfLineaDescartada[];
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
