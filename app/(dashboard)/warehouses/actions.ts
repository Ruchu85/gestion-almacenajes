"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { warehouseSchema, type WarehouseFormValues } from "@/validations/warehouse.schema";
import type { Warehouse, WarehousePriceHistory } from "@/types";
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

  // Excluir storage_daily_price del update normal: se gestiona solo a través del historial de precios
  const { storage_daily_price: _price, ...updateData } = parsed.data;
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("warehouses")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as Warehouse };
}

export async function deleteWarehouse(id: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();

  // ── 1. storage_costs: FK crítico, debe eliminarse primero ────────────────
  const { error: scErr } = await supabase
    .from("storage_costs")
    .delete()
    .eq("warehouse_id", id);
  if (scErr) return { error: scErr.message };

  // ── 2. Tablas opcionales: ignoramos error si no tienen warehouse_id ───────
  await supabase.from("monthly_invoices").delete().eq("warehouse_id", id);

  // ── 3. Puestas (cascada DB a salidas_parciales y puesta_facturacion_meses) ─
  const { error: puestasErr } = await supabase
    .from("puestas_a_disposicion")
    .delete()
    .eq("warehouse_id", id);
  if (puestasErr) return { error: puestasErr.message };

  // ── 4. Movimientos ────────────────────────────────────────────────────────
  const { error: outErr } = await supabase
    .from("outbound_movements")
    .delete()
    .eq("warehouse_id", id);
  if (outErr) return { error: outErr.message };

  const { error: inErr } = await supabase
    .from("inbound_movements")
    .delete()
    .eq("warehouse_id", id);
  if (inErr) return { error: inErr.message };

  // ── 5. Eliminar el almacén ────────────────────────────────────────────────
  const { error } = await supabase.from("warehouses").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// ── Historial de precios ──────────────────────────────────────────────────────

export async function getWarehousePriceHistory(
  warehouseId: string,
): Promise<{ data?: WarehousePriceHistory[]; error?: string }> {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouse_price_history")
    .select("*")
    .eq("warehouse_id", warehouseId)
    .order("effective_from", { ascending: false });
  if (error) return { error: error.message };
  return { data: data as WarehousePriceHistory[] };
}

export async function addWarehousePriceEntry(
  warehouseId: string,
  price: number,
  effectiveFrom: string, // YYYY-MM-DD
): Promise<{ error?: string; recalculated?: boolean }> {
  await requireAuth();
  const supabase = await createServiceClient();

  // 1. Insertar en el historial
  const { error: histErr } = await supabase
    .from("warehouse_price_history")
    .insert({ warehouse_id: warehouseId, price, effective_from: effectiveFrom });
  if (histErr) return { error: histErr.message };

  // 2. Actualizar warehouses.storage_daily_price con el precio más reciente
  const { data: latest } = await supabase
    .from("warehouse_price_history")
    .select("price")
    .eq("warehouse_id", warehouseId)
    .order("effective_from", { ascending: false })
    .limit(1)
    .single();
  if (latest) {
    await supabase
      .from("warehouses")
      .update({ storage_daily_price: latest.price })
      .eq("id", warehouseId);
  }

  // 3. Recalcular costes si la fecha es pasada o presente
  const today = new Date().toISOString().split("T")[0];
  if (effectiveFrom <= today) {
    await supabase.rpc("recalculate_storage_costs", {
      p_start_date: effectiveFrom,
      p_end_date: today,
    });
    return { recalculated: true };
  }

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
