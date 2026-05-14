"use server";

import { createServiceClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export async function upsertMonthlyInvoice(
  warehouseId: string,
  productId: string,
  yearMonth: string,
  invoiceAmount: number | null,
  invoiceRef: string | null,
  notes: string | null,
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();

  const { error } = await supabase
    .from("monthly_invoices")
    .upsert(
      {
        warehouse_id: warehouseId,
        product_id: productId,
        year_month: yearMonth,
        invoice_amount: invoiceAmount,
        invoice_ref: invoiceRef,
        notes: notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "warehouse_id,product_id,year_month" }
    );

  if (error) return { error: error.message };
  return {};
}
