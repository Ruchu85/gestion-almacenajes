"use server";

import { createClient } from "@/lib/supabase/server";
import { parseSalidasExcel } from "@/lib/excel-salidas";
import { buildProposals, filterByText, normalizeLineUnits } from "@/services/pdf-import.service";
import { PuestasService } from "@/services/puestas.service";
import { updateWatermarkSchema, type ExcelAnalysisResult } from "@/validations/excel-import.schema";
import type { PdfResumenAlert } from "@/validations/pdf-import.schema";
import { addDaysISO } from "@/utils/calculations";

const MAX_EXCEL_BYTES = 10 * 1024 * 1024; // 10 MB
const EXCEL_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
]);
const WATERMARK_SOURCE = "excel_salidas_puerto";

// ============================================================
// ANALIZAR — extrae del Excel y propone (NUNCA graba)
// ============================================================

export async function analyzeExcelAction(
  formData: FormData
): Promise<{ data?: ExcelAnalysisResult; error?: string }> {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no válida. Vuelve a iniciar sesión." };

  // 2. Validar archivo
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No se ha recibido ningún archivo." };
  const nameOk = /\.(xlsx|xls)$/i.test(file.name);
  if (!nameOk && !EXCEL_MIME_TYPES.has(file.type)) {
    return { error: "El archivo debe ser un Excel (.xlsx o .xls)." };
  }
  if (file.size === 0) return { error: "El Excel está vacío." };
  if (file.size > MAX_EXCEL_BYTES) return { error: "El Excel supera el tamaño máximo (10 MB)." };

  // 3. Parsear
  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed: ReturnType<typeof parseSalidasExcel>;
  try {
    parsed = parseSalidasExcel(buffer);
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (parsed.lineas.length === 0) {
    return { error: "No se detectaron salidas en el Excel." };
  }

  // 4. Cargar maestros y puestas abiertas
  const [summaryRes, warehousesRes, productsRes] = await Promise.all([
    new PuestasService(supabase).getAllSummary(),
    supabase.from("warehouses").select("id, name").eq("active", true),
    supabase.from("products").select("id, name, unit").eq("active", true),
  ]);

  if (summaryRes.error || !summaryRes.data) {
    return { error: summaryRes.error ?? "No se pudieron cargar las puestas a disposición." };
  }
  const abiertas = summaryRes.data.filter((p) => p.estado === "abierta");
  const warehouses = warehousesRes.data ?? [];
  const products = productsRes.data ?? [];

  // 5. Normalizar unidades y construir propuestas (misma lógica que el flujo PDF)
  const lineas = normalizeLineUnits(parsed.lineas, products);
  const proposals = buildProposals(lineas, abiertas);
  // El Excel no trae un resumen de saldos independiente (a diferencia del PDF
  // Formato B), así que no hay nada que contrastar aquí.
  const alerts: PdfResumenAlert[] = [];

  // 6. Resolver almacén y producto para filas de tipo 'normal' (salidas directas)
  for (const proposal of proposals.filter((p) => p.tipo === "normal")) {
    const almacenRaw = proposal.line.almacen ?? "";
    const productoRaw = proposal.line.producto ?? "";

    const whMatches = filterByText(warehouses, almacenRaw, (w) => w.name);
    if (whMatches.length > 0) {
      proposal.resolvedWarehouseId = whMatches[0].id;
      proposal.resolvedWarehouseName = whMatches[0].name;
      if (whMatches.length > 1) {
        proposal.warnings.push(
          `El almacén "${almacenRaw}" encaja con ${whMatches.length} almacenes (${whMatches
            .map((w) => w.name)
            .join(", ")}). Se propone el primero; revísalo.`
        );
      }
    }

    const prMatches = filterByText(products, productoRaw, (p) => p.name);
    if (prMatches.length > 0) {
      proposal.resolvedProductId = prMatches[0].id;
      proposal.resolvedProductName = prMatches[0].name;
      if (prMatches.length > 1) {
        proposal.warnings.push(
          `El producto "${productoRaw}" encaja con ${prMatches.length} productos (${prMatches
            .map((p) => p.name)
            .join(", ")}). Se propone el primero; revísalo.`
        );
      }
    }

    if (!proposal.resolvedWarehouseId || !proposal.resolvedProductId) {
      const missingParts: string[] = [];
      if (!proposal.resolvedWarehouseId) missingParts.push(`almacén "${almacenRaw || "desconocido"}"`);
      if (!proposal.resolvedProductId) missingParts.push(`producto "${productoRaw || "desconocido"}"`);
      proposal.warnings.push(
        `No se pudo identificar el ${missingParts.join(" ni el ")} en el sistema. Revisa el nombre.`
      );
    }
  }

  // 7. Detección de duplicados: misma puesta + fecha + matrícula + cantidad
  const puestaIds = [...new Set(proposals.filter((p) => p.match).map((p) => p.match!.puesta_id))];
  if (puestaIds.length > 0) {
    const { data: existentes } = await supabase
      .from("salidas_parciales")
      .select("puesta_id, fecha_salida, matricula, cantidad")
      .in("puesta_id", puestaIds);

    for (const proposal of proposals) {
      if (!proposal.match) continue;
      const dup = (existentes ?? []).some(
        (s) =>
          s.puesta_id === proposal.match!.puesta_id &&
          s.fecha_salida === proposal.line.fecha &&
          (s.matricula ?? "").toUpperCase() === proposal.line.matricula.toUpperCase() &&
          Math.abs(Number(s.cantidad) - proposal.line.cantidad) < 0.01
      );
      if (dup) {
        proposal.warnings.push("Ya existe una salida idéntica registrada para esta puesta.");
      }
    }
  }

  // 8. Almacén/producto globales del Excel (para el watermark): se resuelven igual
  //    que en las filas 'normal', contra los mismos maestros ya cargados.
  const almacenGlobal = filterByText(warehouses, parsed.almacenDetectado, (w) => w.name);
  const productoGlobal = filterByText(products, parsed.productoDetectado, (p) => p.name);
  const resolvedWarehouseId = almacenGlobal.length === 1 ? almacenGlobal[0].id : null;
  const resolvedProductId = productoGlobal.length === 1 ? productoGlobal[0].id : null;

  // 9. Watermark: fecha desde la que proponer por defecto
  let suggestedFechaDesde: string | null = parsed.fechaMin;
  if (resolvedWarehouseId && resolvedProductId) {
    const { data: watermark } = await supabase
      .from("excel_import_watermarks")
      .select("last_imported_date")
      .eq("warehouse_id", resolvedWarehouseId)
      .eq("product_id", resolvedProductId)
      .eq("source", WATERMARK_SOURCE)
      .maybeSingle();

    if (watermark?.last_imported_date) {
      const desde = addDaysISO(watermark.last_imported_date, 1);
      // Si ya está todo por debajo del watermark, se propone igualmente el
      // último día de la hoja para no dejar la vista vacía sin explicación.
      suggestedFechaDesde = parsed.fechaMax && desde > parsed.fechaMax ? parsed.fechaMax : desde;
    } else if (parsed.fechaMax) {
      // Primera vez: solo el último día de la hoja.
      suggestedFechaDesde = parsed.fechaMax;
    }
  }

  return {
    data: {
      proposals,
      alerts,
      // El motor de Excel es determinista: no hay una IA que pueda devolver
      // filas que haya que descartar. El campo existe por compartir tipo con
      // el análisis de PDF.
      descartadas: [],
      sourceInfo: {
        almacenDetectado: parsed.almacenDetectado,
        productoDetectado: parsed.productoDetectado,
        barco: parsed.barco,
        resolvedWarehouseId,
        resolvedProductId,
      },
      fechaMin: parsed.fechaMin,
      fechaMax: parsed.fechaMax,
      suggestedFechaDesde,
      parseWarnings: parsed.warnings,
    },
  };
}

// ============================================================
// WATERMARK — recuerda hasta qué fecha ya se ha importado
// ============================================================

export async function updateExcelWatermarkAction(input: {
  warehouseId: string;
  productId: string;
  fecha: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no válida. Vuelve a iniciar sesión." };

  const parsed = updateWatermarkSchema.safeParse({
    warehouse_id: input.warehouseId,
    product_id: input.productId,
    fecha: input.fecha,
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos." };
  }

  const { data: existente } = await supabase
    .from("excel_import_watermarks")
    .select("last_imported_date")
    .eq("warehouse_id", parsed.data.warehouse_id)
    .eq("product_id", parsed.data.product_id)
    .eq("source", WATERMARK_SOURCE)
    .maybeSingle();

  const nuevaFecha =
    existente?.last_imported_date && existente.last_imported_date > parsed.data.fecha
      ? existente.last_imported_date
      : parsed.data.fecha;

  const { error } = await supabase.from("excel_import_watermarks").upsert(
    {
      warehouse_id: parsed.data.warehouse_id,
      product_id: parsed.data.product_id,
      source: WATERMARK_SOURCE,
      last_imported_date: nuevaFecha,
    },
    { onConflict: "warehouse_id,product_id,source" }
  );

  return { error: error?.message };
}
