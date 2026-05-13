"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { customerSchema, type CustomerFormValues } from "@/validations/customer.schema";
import type { Customer } from "@/types";
import { redirect } from "next/navigation";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
}

export async function createCustomer(values: CustomerFormValues): Promise<{ data?: Customer; error?: string }> {
  await requireAuth();
  const parsed = customerSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("customers")
    .insert(parsed.data)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as Customer };
}

export async function updateCustomer(id: string, values: CustomerFormValues): Promise<{ data?: Customer; error?: string }> {
  await requireAuth();
  const parsed = customerSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("customers")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as Customer };
}

export async function deleteCustomer(id: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function toggleCustomerActive(id: string, active: boolean): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("customers")
    .update({ active })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}
