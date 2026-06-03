"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { productSchema, type ProductFormValues } from "@/validations/product.schema";
import type { Product } from "@/types";
import { redirect } from "next/navigation";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
}

export async function createProduct(values: ProductFormValues): Promise<{ data?: Product; error?: string; visualError?: string }> {
  await requireAuth();
  const parsed = productSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const { icon, bg_image_url, ...coreData } = parsed.data;
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from("products")
    .insert(coreData)
    .select()
    .single();
  if (error) return { error: error.message };

  if (icon !== undefined || bg_image_url !== undefined) {
    const { error: visualErr } = await supabase
      .from("products")
      .update({ icon: icon ?? null, bg_image_url: bg_image_url ?? null } as never)
      .eq("id", (data as Product).id);
    if (visualErr) return { data: data as Product, visualError: visualErr.message };
  }

  return { data: data as Product };
}

export async function updateProduct(id: string, values: ProductFormValues): Promise<{ data?: Product; error?: string; visualError?: string }> {
  await requireAuth();
  const parsed = productSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const { icon, bg_image_url, ...coreData } = parsed.data;
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from("products")
    .update(coreData)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: error.message };

  if (icon !== undefined || bg_image_url !== undefined) {
    const { error: visualErr } = await supabase
      .from("products")
      .update({ icon: icon ?? null, bg_image_url: bg_image_url ?? null } as never)
      .eq("id", id);
    if (visualErr) return { data: data as Product, visualError: visualErr.message };
  }

  return { data: data as Product };
}

export async function deleteProduct(id: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();

  // ── 1. storage_costs: FK crítico, debe eliminarse primero ────────────────
  const { error: scErr } = await supabase
    .from("storage_costs")
    .delete()
    .eq("product_id", id);
  if (scErr) return { error: scErr.message };

  // ── 2. Tablas opcionales: ignoramos error si no tienen product_id ─────────
  await supabase.from("monthly_invoices").delete().eq("product_id", id);
  await supabase.from("tarifa_tramos").delete().eq("product_id", id);

  // ── 3. Puestas (cascada DB a salidas_parciales y puesta_facturacion_meses) ─
  const { error: puestasErr } = await supabase
    .from("puestas_a_disposicion")
    .delete()
    .eq("product_id", id);
  if (puestasErr) return { error: puestasErr.message };

  // ── 4. Movimientos ────────────────────────────────────────────────────────
  const { error: outErr } = await supabase
    .from("outbound_movements")
    .delete()
    .eq("product_id", id);
  if (outErr) return { error: outErr.message };

  const { error: inErr } = await supabase
    .from("inbound_movements")
    .delete()
    .eq("product_id", id);
  if (inErr) return { error: inErr.message };

  // ── 5. Eliminar el producto ───────────────────────────────────────────────
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function toggleProductActive(id: string, active: boolean): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("products")
    .update({ active })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}
