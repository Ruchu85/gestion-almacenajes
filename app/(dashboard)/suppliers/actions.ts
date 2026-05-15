"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { supplierSchema, type SupplierFormValues } from "@/validations/supplier.schema";
import type { Supplier } from "@/types";
import { redirect } from "next/navigation";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
}

export async function createSupplier(values: SupplierFormValues): Promise<{ data?: Supplier; error?: string }> {
  await requireAuth();
  const parsed = supplierSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert(parsed.data)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as Supplier };
}

export async function updateSupplier(id: string, values: SupplierFormValues): Promise<{ data?: Supplier; error?: string }> {
  await requireAuth();
  const parsed = supplierSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("suppliers")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as Supplier };
}

export async function deleteSupplier(id: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function toggleSupplierActive(id: string, active: boolean): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ active })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function bulkImportSuppliers(
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
    .from("suppliers")
    .insert(records)
    .select("id");

  if (error) return { imported: 0, errors: [error.message] };
  return { imported: data?.length ?? 0, errors: [] };
}
