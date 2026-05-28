"use server";

import { createServiceClient } from "@/lib/supabase/server";

export async function getMatriculas(): Promise<string[]> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("matriculas")
    .select("value")
    .order("value", { ascending: true });
  return (data ?? []).map((m) => m.value);
}

export async function upsertMatricula(value: string): Promise<void> {
  if (!value?.trim()) return;
  const normalized = value.trim().toUpperCase();
  const supabase = await createServiceClient();
  await supabase
    .from("matriculas")
    .upsert({ value: normalized }, { onConflict: "value", ignoreDuplicates: true });
}
