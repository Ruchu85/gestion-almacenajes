"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { warehouseSchema, type WarehouseFormValues } from "@/validations/warehouse.schema";
import type { Warehouse } from "@/types";
import { redirect } from "next/navigation";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
}

export async function createWarehouse(values: WarehouseFormValues): Promise<{ data?: Warehouse; error?: string }> {
  await requireAuth();
  const parsed = warehouseSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("warehouses")
    .insert(parsed.data)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as Warehouse };
}

export async function updateWarehouse(id: string, values: WarehouseFormValues): Promise<{ data?: Warehouse; error?: string }> {
  await requireAuth();
  const parsed = warehouseSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("warehouses")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as Warehouse };
}

export async function deleteWarehouse(id: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();

  // ── 1. Eliminar costes y facturas asociados al almacén ────────────────────
  const cascadeErrors = await Promise.all([
    supabase.from("storage_costs").delete().eq("warehouse_id", id),
    supabase.from("monthly_invoices").delete().eq("warehouse_id", id),
  ]);
  for (const r of cascadeErrors) {
    if (r.error) return { error: r.error.message };
  }

  // ── 2. Eliminar puestas (cascada a salidas_parciales y facturacion_meses) ─
  const { error: puestasErr } = await supabase
    .from("puestas_a_disposicion")
    .delete()
    .eq("warehouse_id", id);
  if (puestasErr) return { error: puestasErr.message };

  // ── 3. Eliminar movimientos de entrada y salida ───────────────────────────
  const movErrors = await Promise.all([
    supabase.from("outbound_movements").delete().eq("warehouse_id", id),
    supabase.from("inbound_movements").delete().eq("warehouse_id", id),
  ]);
  for (const r of movErrors) {
    if (r.error) return { error: r.error.message };
  }

  // ── 4. Eliminar el almacén ────────────────────────────────────────────────
  const { error } = await supabase.from("warehouses").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function toggleWarehouseActive(id: string, active: boolean): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("warehouses")
    .update({ active })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}
