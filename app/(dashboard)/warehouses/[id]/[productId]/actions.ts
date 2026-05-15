"use server";

import { createServiceClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

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

export async function deleteMonthlyInvoice(id: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase.from("monthly_invoices").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}
