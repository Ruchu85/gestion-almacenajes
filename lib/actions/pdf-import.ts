"use server";

import { createClient } from "@/lib/supabase/server";
import { extractSalidasFromPdf } from "@/lib/gemini";
import { buildProposals } from "@/services/pdf-import.service";
import { PuestasService } from "@/services/puestas.service";
import { createSalidaParcial } from "@/app/(dashboard)/puestas/actions";
import {
  pdfExtractionSchema,
  pdfConfirmSchema,
  type PdfProposalItem,
  type PdfConfirmItem,
} from "@/validations/pdf-import.schema";

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB

// ============================================================
// ANALIZAR — extrae del PDF y propone (NUNCA graba)
// ============================================================

export async function analyzePdfAction(
  formData: FormData
): Promise<{ data?: PdfProposalItem[]; error?: string }> {
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

  // 4. Cargar puestas abiertas y construir propuestas
  const puestasService = new PuestasService(supabase);
  const summaryRes = await puestasService.getAllSummary();
  if (summaryRes.error || !summaryRes.data) {
    return { error: summaryRes.error ?? "No se pudieron cargar las puestas a disposición." };
  }
  const abiertas = summaryRes.data.filter((p) => p.estado === "abierta");

  const proposals = buildProposals(parsed.data.lineas, abiertas);

  // 5. Detección de duplicados (requiere DB): misma puesta + fecha + matrícula + cantidad
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

  return { data: proposals };
}

// ============================================================
// CONFIRMAR — graba las salidas seleccionadas (reutiliza la
// lógica existente de createSalidaParcial: plancha, outbound,
// auto-finalización, etc.)
// ============================================================

export interface ConfirmResult {
  puesta_id: string;
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
      puesta_id: item.puesta_id,
      matricula: item.matricula,
      cantidad: item.cantidad,
      ok: !res.error,
      error: res.error,
    });
  }

  return { data: results };
}
