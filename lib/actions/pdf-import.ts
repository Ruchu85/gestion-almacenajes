"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { extractSalidasFromPdf } from "@/lib/gemini";
import {
  buildProposals,
  buildResumenAlerts,
  filterByText,
  normalizeLineUnits,
} from "@/services/pdf-import.service";
import { PuestasService } from "@/services/puestas.service";
import { createSalidaParcial } from "@/app/(dashboard)/puestas/actions";
import { upsertMatricula } from "@/lib/actions/matriculas";
import {
  pdfExtractionSchema,
  pdfConfirmSchema,
  pdfConfirmNormalesSchema,
  type PdfAnalysisResult,
  type PdfConfirmItem,
  type PdfConfirmNormalItem,
} from "@/validations/pdf-import.schema";

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB

// ============================================================
// ANALIZAR — extrae del PDF y propone (NUNCA graba)
// ============================================================

export async function analyzePdfAction(
  formData: FormData
): Promise<{ data?: PdfAnalysisResult; error?: string }> {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no válida. Vuelve a iniciar sesión." };

  // 2. Validar archivo
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No se ha recibido ningún archivo." };
  if (file.type !== "application/pdf") return { error: "El archivo debe ser un PDF." };
  if (file.size === 0) return { error: "El PDF está vacío." };
  if (file.size > MAX_PDF_BYTES) return { error: "El PDF supera el tamaño máximo (15 MB)." };

  // 3. Extraer con Gemini
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  let raw: unknown;
  try {
    raw = await extractSalidasFromPdf(base64);
  } catch (err) {
    return { error: (err as Error).message };
  }

  const parsed = pdfExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "La IA devolvió los datos en un formato inesperado. Reinténtalo." };
  }
  if (parsed.data.lineas.length === 0) {
    return { error: "No se detectaron salidas/retiradas en el documento." };
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

  // 5. Normalizar unidades (p. ej. el listado de pesadas viene en kg y el
  //    sistema gestiona el producto en TNS) y construir propuestas.
  const lineas = normalizeLineUnits(parsed.data.lineas, products);
  const proposals = buildProposals(lineas, abiertas);

  // 5.b Contrastar con el resumen de saldos del informe (KG RETIRADOS por
  //     cliente de la primera página): todo cliente que retira debe tener una
  //     puesta abierta a su nombre, y los kilos deben cuadrar con las pesadas.
  const alerts = buildResumenAlerts(parsed.data.resumen_clientes, proposals, abiertas, products);

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

  // 7. Detección de duplicados (requiere DB): misma puesta + fecha + matrícula + cantidad
  const puestaIds = [
    ...new Set(proposals.filter((p) => p.match).map((p) => p.match!.puesta_id)),
  ];
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

  return { data: { proposals, alerts } };
}

// ============================================================
// CONFIRMAR — graba las salidas seleccionadas (reutiliza la
// lógica existente de createSalidaParcial: plancha, outbound,
// auto-finalización, etc.)
// ============================================================

export interface ConfirmResult {
  id: string;
  matricula: string;
  cantidad: number;
  ok: boolean;
  error?: string;
}

export async function confirmSalidasAction(
  items: PdfConfirmItem[]
): Promise<{ data?: ConfirmResult[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no válida. Vuelve a iniciar sesión." };

  const parsed = pdfConfirmSchema.safeParse({ items });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos de confirmación inválidos." };
  }

  const results: ConfirmResult[] = [];

  for (const item of parsed.data.items) {
    const res = await createSalidaParcial(
      {
        puesta_id: item.puesta_id,
        fecha_salida: item.fecha_salida,
        matricula: item.matricula,
        cantidad: item.cantidad,
        n_camion: item.n_camion ?? null,
        comentarios: item.comentarios ?? "Registrada desde PDF",
      },
      item.cantidad_pendiente,
      true // el usuario ya revisó los avisos en la propuesta
    );

    results.push({
      id: item.puesta_id,
      matricula: item.matricula,
      cantidad: item.cantidad,
      ok: !res.error,
      error: res.error,
    });
  }

  return { data: results };
}

// ============================================================
// CONFIRMAR SALIDAS NORMALES — outbound_movements directos
// (sin puesta a disposición: salidas propias desde puerto)
// ============================================================

export async function confirmSalidasNormalesAction(
  items: PdfConfirmNormalItem[]
): Promise<{ data?: ConfirmResult[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no válida. Vuelve a iniciar sesión." };

  const parsed = pdfConfirmNormalesSchema.safeParse({ items });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos de confirmación inválidos." };
  }

  const serviceClient = await createServiceClient();
  const results: ConfirmResult[] = [];

  for (const item of parsed.data.items) {
    const { error } = await serviceClient.from("outbound_movements").insert({
      warehouse_id: item.warehouse_id,
      product_id: item.product_id,
      quantity: item.cantidad,
      movement_date: item.fecha_salida,
      free_days: 0,
      customer_id: null,
      comments: `Salida propia${item.matricula ? ` — matrícula: ${item.matricula}` : ""}${item.comentarios ? ` — ${item.comentarios}` : ""} · Importada desde PDF`,
      from_puesta: false,
      created_by: user.id,
    });

    if (!error && item.matricula) {
      await upsertMatricula(item.matricula);
    }

    results.push({
      id: `normal-${item.warehouse_id}-${item.fecha_salida}`,
      matricula: item.matricula,
      cantidad: item.cantidad,
      ok: !error,
      error: error?.message,
    });
  }

  return { data: results };
}
