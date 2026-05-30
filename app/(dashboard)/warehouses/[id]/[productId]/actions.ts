"use server";

import { createServiceClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

async function recalcCosts(warehouseId: string, productId: string, fromDate: string) {
  const today = new Date().toISOString().split("T")[0];
  const supabase = await createServiceClient();
  await supabase
    .from("storage_costs")
    .delete()
    .eq("warehouse_id", warehouseId)
    .eq("product_id", productId)
    .gte("cost_date", fromDate)
    .lte("cost_date", today);
  await supabase.rpc("recalculate_storage_costs", {
    p_start_date: fromDate,
    p_end_date: today,
  });
}

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export async function addMonthlyInvoice(
  warehouseId: string,
  productId: string,
  yearMonth: string,
): Promise<{ data?: { id: string }; error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from("monthly_invoices")
    .insert({
      warehouse_id: warehouseId,
      product_id: productId,
      year_month: yearMonth,
      invoice_amount: null,
      invoice_ref: null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { data: { id: data.id } };
}

export async function updateMonthlyInvoice(
  id: string,
  invoiceAmount: number | null,
  invoiceRef: string | null,
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();

  const { error } = await supabase
    .from("monthly_invoices")
    .update({
      invoice_amount: invoiceAmount,
      invoice_ref: invoiceRef,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  return {};
}

// ── Entradas ─────────────────────────────────────────────────

export async function updateInboundMovement(
  id: string,
  values: { movement_date: string; quantity: number; free_days: number; comments: string | null },
  warehouseId: string,
  productId: string,
  oldDate: string,
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("inbound_movements")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  const fromDate = oldDate < values.movement_date ? oldDate : values.movement_date;
  await recalcCosts(warehouseId, productId, fromDate);
  return {};
}

export async function deleteInboundMovement(
  id: string,
  warehouseId: string,
  productId: string,
  movementDate: string,
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase.from("inbound_movements").delete().eq("id", id);
  if (error) return { error: error.message };
  await recalcCosts(warehouseId, productId, movementDate);
  return {};
}

// ── Salidas manuales ─────────────────────────────────────────

export async function updateOutboundMovement(
  id: string,
  values: { movement_date: string; quantity: number; matricula: string | null; comments: string | null },
  warehouseId: string,
  productId: string,
  oldDate: string,
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  // Solo permite editar salidas manuales
  const { data: existing } = await supabase
    .from("outbound_movements")
    .select("from_puesta")
    .eq("id", id)
    .single();
  if (existing?.from_puesta) return { error: "Solo se pueden editar salidas manuales" };
  const { error } = await supabase
    .from("outbound_movements")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  const fromDate = oldDate < values.movement_date ? oldDate : values.movement_date;
  await recalcCosts(warehouseId, productId, fromDate);
  return {};
}

export async function deleteOutboundMovement(
  id: string,
  warehouseId: string,
  productId: string,
  movementDate: string,
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { data: existing } = await supabase
    .from("outbound_movements")
    .select("from_puesta")
    .eq("id", id)
    .single();
  if (existing?.from_puesta) return { error: "Solo se pueden eliminar salidas manuales" };
  const { error } = await supabase.from("outbound_movements").delete().eq("id", id);
  if (error) return { error: error.message };
  await recalcCosts(warehouseId, productId, movementDate);
  return {};
}

// ── Facturas mensuales ────────────────────────────────────────

export async function deleteMonthlyInvoice(id: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase.from("monthly_invoices").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}
