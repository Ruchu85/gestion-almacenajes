"use server";

import { createServiceClient, createClient } from "@/lib/supabase/server";
import { puestaSchema, type PuestaFormValues } from "@/validations/puesta.schema";
import { salidaParcialSchema, type SalidaParcialFormValues } from "@/validations/salida-parcial.schema";
import type { PuestaADisposicion, SalidaParcial } from "@/types";
import { redirect } from "next/navigation";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

// ── Puestas ──────────────────────────────────────────────────

export async function createPuesta(
  values: PuestaFormValues
): Promise<{ data?: PuestaADisposicion; error?: string }> {
  const user = await requireAuth();
  const parsed = puestaSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("puestas_a_disposicion")
    .insert({
      numero_contrato: parsed.data.numero_contrato ?? null,
      customer_id: parsed.data.customer_id ?? null,
      product_id: parsed.data.product_id,
      warehouse_id: parsed.data.warehouse_id,
      cantidad_inicial: parsed.data.cantidad_inicial,
      fecha_puesta: parsed.data.fecha_puesta,
      dias_plancha: parsed.data.dias_plancha ?? 0,
      estado: parsed.data.estado ?? "abierta",
      comentarios: parsed.data.comentarios ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data: data as PuestaADisposicion };
}

export async function updatePuesta(
  id: string,
  values: PuestaFormValues
): Promise<{ data?: PuestaADisposicion; error?: string }> {
  await requireAuth();
  const parsed = puestaSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("puestas_a_disposicion")
    .update({
      numero_contrato: parsed.data.numero_contrato ?? null,
      customer_id: parsed.data.customer_id ?? null,
      product_id: parsed.data.product_id,
      warehouse_id: parsed.data.warehouse_id,
      cantidad_inicial: parsed.data.cantidad_inicial,
      fecha_puesta: parsed.data.fecha_puesta,
      dias_plancha: parsed.data.dias_plancha ?? 0,
      estado: parsed.data.estado ?? "abierta",
      comentarios: parsed.data.comentarios ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { data: data as PuestaADisposicion };
}

export async function deletePuesta(id: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("puestas_a_disposicion")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function changePuestaEstado(
  id: string,
  estado: "abierta" | "finalizada" | "cerrada_manual"
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("puestas_a_disposicion")
    .update({ estado })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// ── Salidas Parciales ────────────────────────────────────────

export async function createSalidaParcial(
  values: SalidaParcialFormValues,
  cantidadPendiente: number,
  forceOverflow = false
): Promise<{ data?: SalidaParcial; error?: string }> {
  const user = await requireAuth();
  const parsed = salidaParcialSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  if (!forceOverflow && parsed.data.cantidad > cantidadPendiente) {
    return {
      error: `La cantidad (${parsed.data.cantidad}) supera la pendiente (${cantidadPendiente})`,
    };
  }

  const supabase = await createServiceClient();

  // Fetch puesta to determine plancha period and warehouse/product context
  const { data: puesta, error: puestaError } = await supabase
    .from("puestas_a_disposicion")
    .select("fecha_puesta, dias_plancha, warehouse_id, product_id, customer_id, cantidad_inicial, salidas_parciales(cantidad, tipo)")
    .eq("id", parsed.data.puesta_id)
    .single();

  if (puestaError || !puesta) {
    return { error: "No se pudo cargar la puesta a disposición" };
  }

  // Create the salida_parcial
  const { data, error } = await supabase
    .from("salidas_parciales")
    .insert({
      puesta_id: parsed.data.puesta_id,
      fecha_salida: parsed.data.fecha_salida,
      n_camion: parsed.data.n_camion ?? null,
      matricula: parsed.data.matricula ?? null,
      cantidad: parsed.data.cantidad,
      tipo: "real",
      comentarios: parsed.data.comentarios ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // If the salida is within the plancha period, also create an outbound_movement
  const fechaPuesta = new Date(puesta.fecha_puesta + "T00:00:00");
  const fechaFinPlancha = new Date(fechaPuesta);
  fechaFinPlancha.setDate(fechaFinPlancha.getDate() + (Number(puesta.dias_plancha) ?? 0));
  const fechaFinStr = fechaFinPlancha.toISOString().split("T")[0];

  if (parsed.data.fecha_salida <= fechaFinStr) {
    await supabase.from("outbound_movements").insert({
      warehouse_id: puesta.warehouse_id,
      product_id: puesta.product_id,
      quantity: parsed.data.cantidad,
      movement_date: parsed.data.fecha_salida,
      free_days: 0,
      customer_id: puesta.customer_id ?? null,
      comments: `Retirada puesta a disposición${parsed.data.n_camion ? ` (camión: ${parsed.data.n_camion})` : ""}`,
      created_by: user.id,
    });
  }

  // Auto-finalizar cuando las salidas reales cubren o superan toda la cantidad inicial
  const salidaList = (puesta.salidas_parciales ?? []) as { cantidad: number; tipo: string }[];
  const realTotal = salidaList
    .filter((s) => s.tipo === "real")
    .reduce((sum, s) => sum + Number(s.cantidad), 0);
  if (realTotal + parsed.data.cantidad >= Number(puesta.cantidad_inicial)) {
    await supabase
      .from("puestas_a_disposicion")
      .update({ estado: "finalizada" })
      .eq("id", parsed.data.puesta_id);
  }

  return { data: data as SalidaParcial };
}

export async function triggerPlanchaAutoExit(puestaId: string): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createServiceClient();

  // Fetch puesta with all salidas_parciales
  const { data: puesta, error: puestaError } = await supabase
    .from("puestas_a_disposicion")
    .select("*, salidas_parciales(cantidad, tipo)")
    .eq("id", puestaId)
    .single();

  if (puestaError || !puesta) {
    return { error: puestaError?.message ?? "Puesta no encontrada" };
  }

  const salidaParciales = puesta.salidas_parciales as { cantidad: number; tipo: string }[];

  // Idempotency: if auto-exit already done, skip
  if (salidaParciales.some((s) => s.tipo === "plancha")) return {};

  // Calculate remaining pending (only real salidas reduce pending at this point)
  const totalReal = salidaParciales
    .filter((s) => s.tipo === "real")
    .reduce((sum, s) => sum + Number(s.cantidad), 0);
  const pending = Number(puesta.cantidad_inicial) - totalReal;
  if (pending <= 0) return {};

  // Determine fecha_fin_plancha
  const fechaPuesta = new Date(puesta.fecha_puesta + "T00:00:00");
  const fechaFinPlancha = new Date(fechaPuesta);
  fechaFinPlancha.setDate(fechaFinPlancha.getDate() + (Number(puesta.dias_plancha) ?? 0));
  const fechaFinStr = fechaFinPlancha.toISOString().split("T")[0];

  // Create the plancha auto-exit salida_parcial
  const { error: salidaError } = await supabase.from("salidas_parciales").insert({
    puesta_id: puestaId,
    fecha_salida: fechaFinStr,
    cantidad: pending,
    tipo: "plancha",
    comentarios: "Salida automática fin de plancha",
    created_by: user.id,
  });
  if (salidaError) return { error: salidaError.message };

  // Create the corresponding outbound_movement
  const { error: outboundError } = await supabase.from("outbound_movements").insert({
    warehouse_id: puesta.warehouse_id,
    product_id: puesta.product_id,
    quantity: pending,
    movement_date: fechaFinStr,
    free_days: 0,
    customer_id: puesta.customer_id ?? null,
    comments: `Auto-salida fin de plancha${puesta.numero_contrato ? ` (${puesta.numero_contrato})` : ""}`,
    created_by: user.id,
  });
  if (outboundError) return { error: outboundError.message };

  return {};
}

export async function updateSalidaParcial(
  id: string,
  values: SalidaParcialFormValues
): Promise<{ data?: SalidaParcial; error?: string }> {
  await requireAuth();
  const parsed = salidaParcialSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("salidas_parciales")
    .update({
      fecha_salida: parsed.data.fecha_salida,
      n_camion: parsed.data.n_camion ?? null,
      matricula: parsed.data.matricula ?? null,
      cantidad: parsed.data.cantidad,
      comentarios: parsed.data.comentarios ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { data: data as SalidaParcial };
}

export async function updatePuestaComentarios(
  id: string,
  comentarios: string | null
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("puestas_a_disposicion")
    .update({ comentarios })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteSalidaParcial(id: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("salidas_parciales")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}
