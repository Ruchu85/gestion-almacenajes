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

export async function createProduct(values: ProductFormValues): Promise<{ data?: Product; error?: string }> {
  await requireAuth();
  const parsed = productSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("products")
    .insert(parsed.data)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as Product };
}

export async function updateProduct(id: string, values: ProductFormValues): Promise<{ data?: Product; error?: string }> {
  await requireAuth();
  const parsed = productSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("products")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as Product };
}

export async function deleteProduct(id: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();

  // ── 1. Comprobar stock pendiente en almacenes activos ──────────────────────
  const { data: activeWarehouses, error: whError } = await supabase
    .from("warehouses")
    .select("id")
    .eq("active", true);

  if (whError) return { error: whError.message };

  const activeWarehouseIds = (activeWarehouses ?? []).map((w) => w.id);

  if (activeWarehouseIds.length > 0) {
    const { data: inboundRows, error: inbErr } = await supabase
      .from("inbound_movements")
      .select("warehouse_id, quantity")
      .eq("product_id", id)
      .in("warehouse_id", activeWarehouseIds);

    if (inbErr) return { error: inbErr.message };

    const inboundByWh: Record<string, number> = {};
    for (const row of inboundRows ?? []) {
      inboundByWh[row.warehouse_id] = (inboundByWh[row.warehouse_id] ?? 0) + Number(row.quantity);
    }

    const relevantWhs = Object.keys(inboundByWh);

    if (relevantWhs.length > 0) {
      const { data: outboundRows, error: outErr } = await supabase
        .from("outbound_movements")
        .select("warehouse_id, quantity")
        .eq("product_id", id)
        .in("warehouse_id", relevantWhs);

      if (outErr) return { error: outErr.message };

      const outboundByWh: Record<string, number> = {};
      for (const row of outboundRows ?? []) {
        outboundByWh[row.warehouse_id] = (outboundByWh[row.warehouse_id] ?? 0) + Number(row.quantity);
      }

      const hasPendingStock = relevantWhs.some(
        (wId) => (inboundByWh[wId] ?? 0) - (outboundByWh[wId] ?? 0) > 0
      );

      if (hasPendingStock) {
        return {
          error:
            "No se puede eliminar: hay stock pendiente en uno o más almacenes activos. Retira o traslada toda la mercancía antes de eliminar el producto.",
        };
      }
    }
  }

  // ── 2. Comprobar si hay registros históricos vinculados ────────────────────
  // La BD impide borrar si existen FK en movimientos, puestas o tarifas.
  // En ese caso el producto solo puede desactivarse, no eliminarse.
  const [{ count: cInbound }, { count: cOutbound }, { count: cPuestas }, { count: cTarifas }] =
    await Promise.all([
      supabase.from("inbound_movements").select("id",  { count: "exact", head: true }).eq("product_id", id),
      supabase.from("outbound_movements").select("id", { count: "exact", head: true }).eq("product_id", id),
      supabase.from("puestas_a_disposicion").select("id", { count: "exact", head: true }).eq("product_id", id),
      supabase.from("tarifa_tramos").select("id", { count: "exact", head: true }).eq("product_id", id),
    ]);

  const hasLinkedRecords =
    (cInbound ?? 0) > 0 || (cOutbound ?? 0) > 0 || (cPuestas ?? 0) > 0 || (cTarifas ?? 0) > 0;

  if (hasLinkedRecords) {
    return {
      error:
        "No se puede eliminar: el producto tiene movimientos, puestas o tarifas registradas. Puedes desactivarlo para ocultarlo sin perder el historial.",
    };
  }

  // ── 3. Eliminar ────────────────────────────────────────────────────────────
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
