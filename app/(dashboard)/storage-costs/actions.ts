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

  // Obtener la fecha de entrada más antigua
  const { data: oldest, error: oldestError } = await supabase
    .from("inbound_movements")
    .select("movement_date")
    .order("movement_date", { ascending: true })
    .limit(1)
    .single();

  if (oldestError || !oldest) {
    // No hay entradas: simplemente borrar todos los costes
    await supabase.from("storage_costs").delete().gte("cost_date", "2000-01-01");
    return { data: 0 };
  }

  const startDate = oldest.movement_date as string;
  const endDate = format(new Date(), "yyyy-MM-dd");

  const { data, error } = await supabase.rpc("recalculate_storage_costs", {
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) return { error: error.message };
  return { data: data as number };
}
