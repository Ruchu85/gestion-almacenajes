"use server";

import { createServiceClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { recalcStorageCostsFrom } from "@/lib/storage-costs";
import { minDate } from "@/services/puestas-plancha.service";
import { inboundEditSchema, type InboundEditValues } from "@/validations/inbound.schema";
import { formatNumber } from "@/utils/format";

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * Stock resultante para una combinación de almacén y producto, contando todos
 * los movimientos. Sirve para avisar de que una edición deja el almacén en
 * negativo, algo que no se bloquea (puede ser justo la corrección que hace
 * falta) pero que el usuario debe conocer.
 */
async function stockResultante(
  supabase: ServiceClient,
  warehouseId: string,
  productId: string
): Promise<number> {
  const [inboundRes, outboundRes] = await Promise.all([
    supabase
      .from("inbound_movements")
      .select("quantity")
      .eq("warehouse_id", warehouseId)
      .eq("product_id", productId),
    supabase
      .from("outbound_movements")
      .select("quantity")
      .eq("warehouse_id", warehouseId)
      .eq("product_id", productId),
  ]);

  const entradas = (inboundRes.data ?? []).reduce((sum, m) => sum + Number(m.quantity), 0);
  const salidas = (outboundRes.data ?? []).reduce((sum, m) => sum + Number(m.quantity), 0);
  return Math.round((entradas - salidas) * 1000) / 1000;
}

/**
 * Edita una entrada de mercancía y recalcula todo lo que dependa de ella.
 *
 * Cambiar la cantidad, la fecha o los días de plancha altera el stock y el
 * momento en que empieza a devengar almacenaje, así que los costes se
 * reconstruyen desde la más antigua de las dos fechas implicadas (la de antes
 * y la de después) hasta hoy — el equivalente a borrar la entrada y volver a
 * grabarla, pero conservando el registro y su trazabilidad.
 *
 * El almacén y el producto no se tocan: son la cuenta contra la que se calcula
 * todo. Para moverlos hay que eliminar la entrada y crearla de nuevo.
 */
export async function updateInboundMovementAction(
  id: string,
  values: InboundEditValues
): Promise<{ error?: string; aviso?: string }> {
  await requireAuth();

  const parsed = inboundEditSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();

  const { data: actual, error: readError } = await supabase
    .from("inbound_movements")
    .select("warehouse_id, product_id, movement_date, quantity, free_days")
    .eq("id", id)
    .single();

  if (readError || !actual) return { error: "No se pudo cargar la entrada a modificar." };

  const { error } = await supabase
    .from("inbound_movements")
    .update({
      supplier_id: parsed.data.supplier_id ?? null,
      quantity: parsed.data.quantity,
      movement_date: parsed.data.movement_date,
      free_days: parsed.data.free_days ?? 0,
      comments: parsed.data.comments ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  // El rango arranca en la fecha más antigua entre la original y la nueva:
  // adelantar o retrasar la entrada cambia los costes de los días intermedios.
  const desde = minDate(actual.movement_date, parsed.data.movement_date);
  const recalc = await recalcStorageCostsFrom(supabase, desde);
  if (recalc.error) {
    return {
      error: `La entrada se guardó pero falló el recálculo de costes: ${recalc.error}`,
    };
  }

  const stock = await stockResultante(supabase, actual.warehouse_id, actual.product_id);
  if (stock < 0) {
    return {
      aviso:
        `El stock de esta combinación de almacén y producto queda en ${formatNumber(stock)}. ` +
        `Hay más salidas registradas que mercancía entrada: revisa las salidas o la cantidad de la entrada.`,
    };
  }

  return {};
}

/**
 * Elimina una entrada y recalcula los costes desde su fecha.
 */
export async function deleteInboundMovementAction(
  id: string
): Promise<{ error?: string; aviso?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();

  const { data: actual } = await supabase
    .from("inbound_movements")
    .select("warehouse_id, product_id, movement_date")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("inbound_movements").delete().eq("id", id);
  if (error) return { error: error.message };

  if (!actual) return {};

  const recalc = await recalcStorageCostsFrom(supabase, actual.movement_date);
  if (recalc.error) {
    return { error: `La entrada se eliminó pero falló el recálculo de costes: ${recalc.error}` };
  }

  const stock = await stockResultante(supabase, actual.warehouse_id, actual.product_id);
  if (stock < 0) {
    return {
      aviso:
        `El stock de esta combinación de almacén y producto queda en ${formatNumber(stock)}. ` +
        `Al eliminar la entrada quedan salidas sin mercancía que las respalde.`,
    };
  }

  return {};
}
