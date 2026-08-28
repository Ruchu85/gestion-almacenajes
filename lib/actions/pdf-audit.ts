"use server";

/**
 * Auditoría de salidas de puerto: vuelve a leer un PDF ya importado y lo
 * contrasta con lo que hay grabado en el sistema.
 *
 * ES UNA ACCIÓN DE SOLO LECTURA. No inserta, no actualiza y no borra nada:
 * su único cometido es señalar diferencias para que el usuario las revise.
 *
 * Procesa UN PDF por llamada: el límite de tamaño de los server actions son
 * 2 MB (ver next.config.ts), así que el diálogo llama a esta acción una vez por
 * archivo. De paso, un PDF que falle no arrastra al resto del lote.
 */

import { createClient } from "@/lib/supabase/server";
import { extractSalidasFromPdf, extractPesadasVerification } from "@/lib/gemini";
import { filterByText, normalizeLineUnits } from "@/services/pdf-import.service";
import {
  checkPlausibility,
  compareExtractionPasses,
  extractMatriculaFromComment,
  extractTicketFromComment,
  findDigitSuspicions,
  reconcileLines,
  reconcileTotals,
} from "@/services/pdf-audit.service";
import { pdfExtractionSchema } from "@/validations/pdf-import.schema";
import {
  pdfVerificacionSchema,
  type AuditFileReport,
  type AuditFinding,
  type RegisteredMovement,
} from "@/validations/pdf-audit.schema";
import { formatNumber } from "@/utils/format";

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB
const GEMINI_MODEL_SALIDAS = "gemini-3.5-flash";
// Igual que en lib/actions/pdf-import.ts: gemini-3.5-flash tiene un cupo
// gratuito de solo 20 peticiones/DÍA para todo el proyecto (confirmado en el
// error de cuota real de Google), y esta auditoría comparte ese cupo con la
// importación. Mover la verificación a 2.5-flash (cupo mucho más holgado)
// libera esa presión, y thinkingBudget: 0 la hace ~58% más rápida sin perder
// exactitud en pruebas reales, al ser una relectura mecánica de cifras.
const GEMINI_MODEL_VERIFICACION = "gemini-2.5-flash";
const GEMINI_THINKING_VERIFICACION = 0;

/**
 * Días que se amplía a cada lado la ventana de fechas del PDF al buscar los
 * movimientos registrados. Permite encontrar una salida grabada con la fecha
 * equivocada, que es justo uno de los errores que se quieren detectar.
 */
const MARGEN_DIAS = 3;

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/** Fila cruda de salidas_parciales con la puesta embebida. */
interface SalidaParcialRow {
  id: string;
  fecha_salida: string;
  matricula: string | null;
  cantidad: number;
  comentarios: string | null;
  puestas_a_disposicion: { warehouse_id: string; numero_contrato: string } | null;
}

interface OutboundRow {
  id: string;
  movement_date: string;
  matricula: string | null;
  quantity: number;
  comments: string | null;
}

function fail(fileName: string, error: string): AuditFileReport {
  return {
    fileName,
    ok: false,
    error,
    warehouseId: null,
    warehouseName: null,
    fechas: [],
    lines: [],
    sobrantes: [],
    findings: [],
    totals: null,
  };
}

export async function auditPdfAction(formData: FormData): Promise<AuditFileReport> {
  // ── 1. Autenticación ────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const file = formData.get("file");
  const fileName = file instanceof File ? file.name : "documento.pdf";

  if (!user) return fail(fileName, "Sesión no válida. Vuelve a iniciar sesión.");

  // ── 2. Validación del archivo ───────────────────────────────
  if (!(file instanceof File)) return fail(fileName, "No se ha recibido ningún archivo.");
  if (file.type !== "application/pdf") return fail(fileName, "El archivo debe ser un PDF.");
  if (file.size === 0) return fail(fileName, "El PDF está vacío.");
  if (file.size > MAX_PDF_BYTES) return fail(fileName, "El PDF supera el tamaño máximo (15 MB).");

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  // ── 3. Las dos lecturas del documento, en paralelo ──────────
  // La primera es exactamente la de producción (para auditar lo que el flujo
  // real produciría); la segunda es una relectura enfocada solo en cifras.
  const [principal, verificacion] = await Promise.allSettled([
    extractSalidasFromPdf(base64, GEMINI_MODEL_SALIDAS),
    extractPesadasVerification(base64, GEMINI_MODEL_VERIFICACION, GEMINI_THINKING_VERIFICACION),
  ]);

  if (principal.status === "rejected") {
    return fail(fileName, (principal.reason as Error)?.message ?? "No se pudo analizar el PDF.");
  }

  const parsed = pdfExtractionSchema.safeParse(principal.value);
  if (!parsed.success) {
    return fail(fileName, "La IA devolvió los datos en un formato inesperado. Reinténtalo.");
  }
  if (parsed.data.lineas.length === 0) {
    return fail(fileName, "No se detectaron salidas/retiradas en el documento.");
  }

  const findings: AuditFinding[] = [];

  // La segunda pasada es un control extra: si falla, se audita igualmente.
  let pesadasVerificacion: ReturnType<typeof pdfVerificacionSchema.safeParse> | null = null;
  if (verificacion.status === "fulfilled") {
    pesadasVerificacion = pdfVerificacionSchema.safeParse(verificacion.value);
  }
  const verificacionData =
    pesadasVerificacion?.success === true ? pesadasVerificacion.data : { pesadas: [], totales: [] };

  if (verificacion.status === "rejected" || pesadasVerificacion?.success === false) {
    findings.push({
      level: "warning",
      code: "lectura_inestable",
      message:
        "La segunda lectura de verificación no se pudo completar, así que no ha podido " +
        "contrastarse cantidad por cantidad. El resto de comprobaciones sí se han hecho.",
    });
  }

  // ── 4. Maestros y normalización de unidades ─────────────────
  const [warehousesRes, productsRes] = await Promise.all([
    supabase.from("warehouses").select("id, name").eq("active", true),
    supabase.from("products").select("id, name, unit").eq("active", true),
  ]);
  const warehouses = warehousesRes.data ?? [];
  const products = productsRes.data ?? [];

  const lineas = normalizeLineUnits(parsed.data.lineas, products);
  const ids = lineas.map((l, i) => `${i}-${l.ticket ?? l.matricula}-${l.cantidad}`);

  // ── 5. Almacén y ventana de fechas del documento ────────────
  const almacenRaw = lineas.find((l) => l.almacen)?.almacen ?? "";
  const whMatches = filterByText(warehouses, almacenRaw, (w) => w.name);
  const warehouse = whMatches.length === 1 ? whMatches[0] : (whMatches[0] ?? null);

  if (!warehouse) {
    findings.push({
      level: "warning",
      code: "almacen_no_resuelto",
      message:
        `No se ha podido identificar el almacén "${almacenRaw || "(sin nombre en el PDF)"}" ` +
        `en el sistema. La comparación se hace contra los movimientos de TODOS los almacenes ` +
        `en esas fechas, así que puede aparecer ruido.`,
    });
  } else if (whMatches.length > 1) {
    findings.push({
      level: "info",
      code: "almacen_no_resuelto",
      message: `El almacén del PDF encaja con varios del sistema; se ha usado "${warehouse.name}".`,
    });
  }

  const fechas = [...new Set(lineas.map((l) => l.fecha))].sort();
  const desde = shiftDate(fechas[0], -MARGEN_DIAS);
  const hasta = shiftDate(fechas[fechas.length - 1], MARGEN_DIAS);

  // ── 6. Movimientos ya registrados ───────────────────────────
  // Solo las salidas reales de camión: las salidas parciales de tipo 'real'
  // (las de tipo desaplicación/plancha no son retiradas físicas) y las salidas
  // directas. Se excluyen los outbound con from_puesta=true porque son el
  // espejo automático de las salidas parciales y contarían el mismo camión dos
  // veces.
  let salidasQuery = supabase
    .from("salidas_parciales")
    .select(
      "id, fecha_salida, matricula, cantidad, comentarios, puestas_a_disposicion!inner(warehouse_id, numero_contrato)"
    )
    .eq("tipo", "real")
    .gte("fecha_salida", desde)
    .lte("fecha_salida", hasta);

  let outboundQuery = supabase
    .from("outbound_movements")
    .select("id, movement_date, matricula, quantity, comments")
    .eq("from_puesta", false)
    .gte("movement_date", desde)
    .lte("movement_date", hasta);

  if (warehouse) {
    salidasQuery = salidasQuery.eq("puestas_a_disposicion.warehouse_id", warehouse.id);
    outboundQuery = outboundQuery.eq("warehouse_id", warehouse.id);
  }

  const [salidasRes, outboundRes] = await Promise.all([salidasQuery, outboundQuery]);

  if (salidasRes.error) return fail(fileName, `No se pudieron leer las salidas: ${salidasRes.error.message}`);
  if (outboundRes.error) return fail(fileName, `No se pudieron leer los movimientos: ${outboundRes.error.message}`);

  const registered: RegisteredMovement[] = [
    ...((salidasRes.data ?? []) as unknown as SalidaParcialRow[]).map((r) => ({
      id: r.id,
      source: "salida_parcial" as const,
      fecha: r.fecha_salida,
      matricula: r.matricula ?? extractMatriculaFromComment(r.comentarios),
      cantidad: Number(r.cantidad),
      ticket: extractTicketFromComment(r.comentarios),
      referencia: r.puestas_a_disposicion?.numero_contrato ?? null,
      comentario: r.comentarios,
    })),
    ...((outboundRes.data ?? []) as unknown as OutboundRow[]).map((r) => ({
      id: r.id,
      source: "outbound" as const,
      fecha: r.movement_date,
      matricula: r.matricula ?? extractMatriculaFromComment(r.comments),
      cantidad: Number(r.quantity),
      ticket: extractTicketFromComment(r.comments),
      referencia: "Salida directa",
      comentario: r.comments,
    })),
  ];

  // ── 7. Controles de cantidad ────────────────────────────────
  const { totals, deltaPrinted } = reconcileTotals(lineas, verificacionData.totales);

  if (!totals.cuadra && totals.declarado !== null) {
    findings.push({
      level: "error",
      code: "descuadre_total",
      message:
        `El documento declara un total de ${formatNumber(totals.declarado)} ${totals.unidad}, ` +
        `pero las pesadas leídas suman ${formatNumber(totals.extraido)} ${totals.unidad} ` +
        `(diferencia: ${formatNumber(totals.diferencia ?? 0)}). Falta, sobra o está mal leída alguna línea.`,
    });
  }

  const sospechas = findDigitSuspicions(lineas, ids, deltaPrinted);
  if (sospechas.length > 1) {
    findings.push({
      level: "info",
      code: "sospecha_digito",
      message:
        `Hay ${sospechas.length} pesadas que, corregidas de una en una, cuadrarían el total. ` +
        `Se señalan todas, pero solo una será la buena: revísalas en el documento.`,
    });
  }

  const comparacion = compareExtractionPasses(lineas, ids, verificacionData.pesadas);
  if (comparacion.soloEnVerificacion.length > 0) {
    findings.push({
      level: "error",
      code: "lectura_inestable",
      message:
        `La segunda lectura encontró ${comparacion.soloEnVerificacion.length} pesada(s) que la ` +
        `primera no vio (netos: ${comparacion.soloEnVerificacion
          .map((p) => formatNumber(p.neto))
          .join(", ")}). Es posible que en la importación original también se perdieran.`,
    });
  }

  const plausibilidad = checkPlausibility(lineas, ids);

  // ── 8. Reconciliación ───────────────────────────────────────
  const { results, sobrantes } = reconcileLines(lineas, ids, registered, {
    verificacion: comparacion,
    plausibilidad,
    sospechas,
  });

  // Lo que importa es que no falte nada del PDF por grabar. El sentido
  // contrario (grabado que no está en el PDF) es secundario: casi siempre son
  // salidas de otro documento o metidas a mano, así que se deja como nota.
  const noRegistradas = results.filter((l) => l.status === "no_registrada").length;
  if (noRegistradas > 0) {
    findings.push({
      level: "error",
      code: "sobrante",
      message:
        `${noRegistradas} pesada(s) de este PDF no están grabadas en el sistema. ` +
        `Son las que hay que revisar: puede que se perdieran al importar.`,
    });
  }

  if (sobrantes.length > 0) {
    findings.push({
      level: "info",
      code: "sobrante",
      message:
        `Nota: hay ${sobrantes.length} salida(s) grabada(s) en estas fechas que no aparecen en ` +
        `este PDF. Puede ser normal si vienen de otro documento.`,
    });
  }

  return {
    fileName,
    ok: true,
    warehouseId: warehouse?.id ?? null,
    warehouseName: warehouse?.name ?? null,
    fechas,
    lines: results,
    sobrantes,
    findings,
    totals,
  };
}
