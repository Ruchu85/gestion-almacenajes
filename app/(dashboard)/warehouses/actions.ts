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

/** Sincroniza warehouses.storage_daily_price con la entrada de fecha más reciente del historial. */
async function syncWarehouseCurrentPrice(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  warehouseId: string,
) {
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
}

/** Recalcula storage_costs desde `fromDate` hasta hoy, solo si `fromDate` no es futura. */
async function recalculateCostsFrom(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  fromDate: string,
): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0];
  if (fromDate > today) return false;
  await supabase.rpc("recalculate_storage_costs", {
    p_start_date: fromDate,
    p_end_date: today,
  });
  return true;
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
  if (histErr) {
    if (histErr.code === "23505") {
      return { error: `Ya existe una entrada de precio con fecha de aplicación ${effectiveFrom}.` };
    }
    return { error: histErr.message };
  }

  // 2. Actualizar warehouses.storage_daily_price con el precio más reciente
  await syncWarehouseCurrentPrice(supabase, warehouseId);

  // 3. Recalcular costes si la fecha es pasada o presente
  const recalculated = await recalculateCostsFrom(supabase, effectiveFrom);
  return recalculated ? { recalculated: true } : {};
}

export async function updateWarehousePriceEntry(
  warehouseId: string,
  entryId: string,
  price: number,
  effectiveFrom: string, // YYYY-MM-DD
): Promise<{ error?: string; recalculated?: boolean }> {
  await requireAuth();
  const supabase = await createServiceClient();

  // 1. Recuperar la fecha original, para recalcular desde la más antigua de las dos
  const { data: original, error: fetchErr } = await supabase
    .from("warehouse_price_history")
    .select("effective_from")
    .eq("id", entryId)
    .eq("warehouse_id", warehouseId)
    .single();
  if (fetchErr || !original) return { error: "No se encontró la entrada del historial." };

  // 2. Actualizar
  const { error: updErr } = await supabase
    .from("warehouse_price_history")
    .update({ price, effective_from: effectiveFrom })
    .eq("id", entryId)
    .eq("warehouse_id", warehouseId);
  if (updErr) {
    if (updErr.code === "23505") {
      return { error: `Ya existe una entrada de precio con fecha de aplicación ${effectiveFrom}.` };
    }
    return { error: updErr.message };
  }

  // 3. Sincronizar precio actual y recalcular desde la fecha más antigua afectada
  await syncWarehouseCurrentPrice(supabase, warehouseId);
  const fromDate = original.effective_from < effectiveFrom ? original.effective_from : effectiveFrom;
  const recalculated = await recalculateCostsFrom(supabase, fromDate);
  return recalculated ? { recalculated: true } : {};
}

export async function deleteWarehousePriceEntry(
  warehouseId: string,
  entryId: string,
): Promise<{ error?: string; recalculated?: boolean }> {
  await requireAuth();
  const supabase = await createServiceClient();

  // 1. No permitir borrar la última entrada: el almacén debe conservar siempre un precio vigente
  const { count } = await supabase
    .from("warehouse_price_history")
    .select("id", { count: "exact", head: true })
    .eq("warehouse_id", warehouseId);
  if ((count ?? 0) <= 1) {
    return { error: "No puedes eliminar la última entrada del historial: el almacén debe conservar siempre un precio vigente." };
  }

  // 2. Recuperar su fecha antes de borrarla, para saber qué recalcular
  const { data: entry, error: fetchErr } = await supabase
    .from("warehouse_price_history")
    .select("effective_from")
    .eq("id", entryId)
    .eq("warehouse_id", warehouseId)
    .single();
  if (fetchErr || !entry) return { error: "No se encontró la entrada del historial." };

  // 3. Borrar
  const { error: delErr } = await supabase
    .from("warehouse_price_history")
    .delete()
    .eq("id", entryId)
    .eq("warehouse_id", warehouseId);
  if (delErr) return { error: delErr.message };

  // 4. Sincronizar precio actual y recalcular costes desde la fecha de la entrada borrada
  await syncWarehouseCurrentPrice(supabase, warehouseId);
  const recalculated = await recalculateCostsFrom(supabase, entry.effective_from);
  return recalculated ? { recalculated: true } : {};
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
