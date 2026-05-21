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

export async function deleteAllCustomers(): Promise<{ deleted: number; error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("customers")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000")
    .select("id");
  if (error) return { deleted: 0, error: error.message };
  return { deleted: data?.length ?? 0 };
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

export async function bulkImportCustomers(
  rows: { nombre: string; cif: string; direccion: string; comentarios: string }[]
): Promise<{ imported: number; errors: string[] }> {
  await requireAuth();
  const supabase = await createServiceClient();

  const records = rows.map((row) => {
    const commentParts = [
      row.direccion ? `Dirección: ${row.direccion}` : null,
      row.comentarios || null,
    ].filter(Boolean);
    return {
      name: row.nombre,
      tax_id: row.cif || null,
      comments: commentParts.length > 0 ? commentParts.join(" | ") : null,
      active: true,
    };
  });

  const { data, error } = await supabase
    .from("customers")
    .insert(records)
    .select("id");

  if (error) return { imported: 0, errors: [error.message] };
  return { imported: data?.length ?? 0, errors: [] };
}
