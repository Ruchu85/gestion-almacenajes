"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

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
