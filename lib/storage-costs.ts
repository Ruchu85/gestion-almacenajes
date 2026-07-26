import type { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * Fecha más antigua desde la que tiene sentido recalcular. Actúa de red de
 * seguridad: `recalculate_storage_costs` itera día a día, así que una fecha
 * corrupta o absurdamente antigua bloquearía la petición.
 */
const MIN_RECALC_DATE = "2020-01-01";

function today(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Recalcula y persiste los costes de almacenaje desde `fromDate` hasta hoy.
 *
 * La función SQL `recalculate_storage_costs` borra el rango completo y lo
 * reconstruye a partir de los movimientos actuales, para TODAS las
 * combinaciones de almacén y producto. Por eso basta con pasarle la fecha más
 * antigua afectada: no hay que enumerar los pares almacén/producto, y un
 * movimiento que cambia de almacén o de producto queda cubierto igualmente.
 *
 * Es idempotente: repetirla no duplica ni altera nada.
 */
export async function recalcStorageCostsFrom(
  supabase: ServiceClient,
  fromDate: string | null | undefined
): Promise<{ error?: string }> {
  if (!fromDate) return {};

  const start = fromDate < MIN_RECALC_DATE ? MIN_RECALC_DATE : fromDate;
  const end = today();
  if (start > end) return {};

  const { error } = await supabase.rpc("recalculate_storage_costs", {
    p_start_date: start,
    p_end_date: end,
  });

  if (error) return { error: error.message };
  return {};
}
