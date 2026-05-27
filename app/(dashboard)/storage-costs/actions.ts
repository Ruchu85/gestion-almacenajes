"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
}

export async function recalculateStorageCosts(
  startDate: string,
  endDate: string
): Promise<{ data?: number; error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();

  // Eliminar primero desde la server action: el service client bypasea RLS
  // garantizando que las filas stale se borran antes de recalcular.
  const { error: deleteError } = await supabase
    .from("storage_costs")
    .delete()
    .gte("cost_date", startDate)
    .lte("cost_date", endDate);

  if (deleteError) return { error: `Error al limpiar costes: ${deleteError.message}` };

  const { data, error } = await supabase.rpc("recalculate_storage_costs", {
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) return { error: error.message };
  return { data: data as number };
}

/**
 * Elimina TODOS los registros de storage_costs y recalcula desde la fecha
 * de entrada más antigua hasta hoy. Útil cuando se han borrado movimientos
 * y los costes históricos han quedado obsoletos.
 */
export async function recalculateAllStorageCosts(): Promise<{ data?: number; error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();

  // Borrar absolutamente todos los costes existentes desde la server action.
  // Esto garantiza que no queden filas stale de movimientos ya eliminados,
  // independientemente del estado de la función SQL en Supabase.
  const { error: deleteError } = await supabase
    .from("storage_costs")
    .delete()
    .gte("cost_date", "2000-01-01");

  if (deleteError) return { error: `Error al limpiar costes: ${deleteError.message}` };

  // Obtener la fecha de entrada más antigua para saber desde dónde recalcular
  const { data: oldest } = await supabase
    .from("inbound_movements")
    .select("movement_date")
    .order("movement_date", { ascending: true })
    .limit(1)
    .single();

  // Sin entradas: nada que recalcular, tabla ya limpia
  if (!oldest) return { data: 0 };

  const startDate = oldest.movement_date as string;
  const endDate = format(new Date(), "yyyy-MM-dd");

  const { data, error } = await supabase.rpc("recalculate_storage_costs", {
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) return { error: error.message };
  return { data: data as number };
}
