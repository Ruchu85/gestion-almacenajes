"use server";

import { createClient } from "@/lib/supabase/server";
import { extractPuestaFromPdf } from "@/lib/gemini";
import {
  buildPuestaProposal,
  type MasterData,
} from "@/services/pdf-puestas.service";
import { createPuesta } from "@/app/(dashboard)/puestas/actions";
import {
  puestaPdfExtractionSchema,
  puestaPdfConfirmSchema,
  type PuestaProposal,
  type MasterRef,
  type PuestaPdfConfirm,
} from "@/validations/pdf-puestas.schema";

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB

/** Listas de maestros para los desplegables de la propuesta. */
export interface PuestaImportMasters {
  warehouses: MasterRef[];
  products: MasterRef[];
  customers: MasterRef[];
}

export interface AnalyzePuestaResult {
  proposal: PuestaProposal;
  masters: PuestaImportMasters;
}

// ============================================================
// ANALIZAR — extrae del PDF y propone (NUNCA graba)
// ============================================================

export async function analyzePuestaPdfAction(
  formData: FormData
): Promise<{ data?: AnalyzePuestaResult; error?: string }> {
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
    raw = await extractPuestaFromPdf(base64);
  } catch (err) {
    return { error: (err as Error).message };
  }

  const parsed = puestaPdfExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "La IA devolvió los datos en un formato inesperado. Reinténtalo." };
  }

  // 4. Cargar maestros activos
  const [whRes, prodRes, custRes] = await Promise.all([
    supabase.from("warehouses").select("id, code, name").eq("active", true),
    supabase.from("products").select("id, code, name").eq("active", true),
    supabase.from("customers").select("id, codigo, name").eq("active", true),
  ]);

  if (whRes.error) return { error: whRes.error.message };
  if (prodRes.error) return { error: prodRes.error.message };
  if (custRes.error) return { error: custRes.error.message };

  const masterData: MasterData = {
    warehouses: whRes.data ?? [],
    products: prodRes.data ?? [],
    customers: custRes.data ?? [],
  };

  // 5. Construir la propuesta
  const proposal = buildPuestaProposal(parsed.data, masterData);

  // 6. Detección de duplicados (requiere BD): mismo nº de contrato
  if (proposal.numero_contrato) {
    const { data: existing } = await supabase
      .from("puestas_a_disposicion")
      .select("id")
      .eq("numero_contrato", proposal.numero_contrato)
      .maybeSingle();
    if (existing) {
      proposal.warnings.push(
        `Ya existe una puesta con el nº "${proposal.numero_contrato}". Podrías estar duplicándola.`
      );
      if (proposal.state === "listo") proposal.state = "dudoso";
    }
  }

  // 7. Preparar listas para los desplegables
  const masters: PuestaImportMasters = {
    warehouses: masterData.warehouses.map((w) => ({
      id: w.id,
      label: w.code ? `[${w.code}] ${w.name}` : w.name,
    })),
    products: masterData.products.map((p) => ({
      id: p.id,
      label: p.code ? `[${p.code}] ${p.name}` : p.name,
    })),
    customers: masterData.customers.map((c) => ({
      id: c.id,
      label: c.codigo ? `[${c.codigo}] ${c.name}` : c.name,
    })),
  };

  return { data: { proposal, masters } };
}

// ============================================================
// CONFIRMAR — crea la puesta (reusa createPuesta)
// ============================================================

export async function confirmPuestaPdfAction(
  values: PuestaPdfConfirm
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no válida. Vuelve a iniciar sesión." };

  const parsed = puestaPdfConfirmSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos." };
  }

  const res = await createPuesta({
    numero_contrato: parsed.data.numero_contrato ?? null,
    customer_id: parsed.data.customer_id ?? null,
    product_id: parsed.data.product_id,
    warehouse_id: parsed.data.warehouse_id,
    cantidad_inicial: parsed.data.cantidad_inicial,
    fecha_puesta: parsed.data.fecha_puesta,
    dias_plancha: parsed.data.dias_plancha,
    estado: "abierta",
    comentarios: parsed.data.comentarios ?? null,
  });

  if (res.error) return { error: res.error };
  return { id: res.data?.id };
}
