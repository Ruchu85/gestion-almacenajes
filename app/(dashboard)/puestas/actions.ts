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

  // Auto-finalizar si la cantidad física pendiente llega a 0 o negativo
  if (parsed.data.cantidad >= cantidadPendiente) {
    await supabase
      .from("puestas_a_disposicion")
      .update({ estado: "finalizada" })
      .eq("id", parsed.data.puesta_id);
  }

  return { data: data as SalidaParcial };
}

export async function triggerPlanchaAutoExit(puestaId: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase.rpc("create_plancha_auto_exit", {
    p_puesta_id: puestaId,
  });
  if (error) return { error: error.message };
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
