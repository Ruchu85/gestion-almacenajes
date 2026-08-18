"use server";

/**
 * Variante EXPERIMENTAL de "Subir Salidas Puerto (PDF)" que usa Gemini 3.5
 * Flash en vez de Gemini 2.5 Flash, para poder comparar la calidad de
 * extracción sin tocar el flujo de producción (`lib/actions/pdf-import.ts`).
 *
 * Reutiliza el mismo motor de cruce/matching y las mismas acciones de
 * confirmación que el flujo estable — no reinventa nada de esa lógica, solo
 * cambia qué modelo hace la extracción del PDF. Pensado para probarse en
 * modo Desarrollo (schema `dev`) antes de plantear si sustituye al estable.
 */
import { createClient } from "@/lib/supabase/server";
import { extractSalidasFromPdf } from "@/lib/gemini";
import { buildProposals, buildResumenAlerts, filterByText, normalizeLineUnits } from "@/services/pdf-import.service";
import { PuestasService } from "@/services/puestas.service";
import { pdfExtractionSchema, type PdfAnalysisResult } from "@/validations/pdf-import.schema";

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB
const GEMINI_MODEL_BETA = "gemini-3.5-flash";

export async function analyzePdfActionGemini35(
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

  // 3. Extraer con Gemini 3.5 Flash (única diferencia real con el flujo estable)
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  let raw: unknown;
  try {
    raw = await extractSalidasFromPdf(base64, GEMINI_MODEL_BETA);
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

  // 5. Normalizar unidades y construir propuestas (idéntico al flujo estable)
  const lineas = normalizeLineUnits(parsed.data.lineas, products);
  const proposals = buildProposals(lineas, abiertas);
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

  return { data: { proposals, alerts } };
}
