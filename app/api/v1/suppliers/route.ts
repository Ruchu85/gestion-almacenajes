import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBcApiKey, validationError, dbError } from "@/lib/bc-api-auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/suppliers
 *
 * Crea o actualiza un proveedor en base a su código de BC.
 * La clave de negocio es `codigo` — si ya existe, actualiza nombre y NIF.
 *
 * Payload esperado:
 * {
 *   "codigo":   "PROV001",          // obligatorio — clave BC
 *   "name":     "Proveedor S.A.",   // obligatorio
 *   "tax_id":   "A87654321",        // opcional
 *   "comments": "..."               // opcional
 * }
 *
 * Respuestas:
 *   201 { ok: true, action: "created",  id }
 *   200 { ok: true, action: "updated",  id }
 *   400 { ok: false, error: "validation_error", detail }
 *   401 { ok: false, error: "unauthorized" }
 */

const schema = z.object({
  codigo:   z.string().min(1).max(50),
  name:     z.string().min(1).max(200),
  tax_id:   z.string().max(50).optional().nullable(),
  comments: z.string().max(2000).optional().nullable(),
});

export async function POST(request: Request) {
  const authError = validateBcApiKey(request);
  if (authError) return authError;

  let body: unknown;
  try { body = await request.json(); }
  catch { return validationError("El cuerpo de la petición no es JSON válido"); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.errors[0].message);

  const { codigo, name, tax_id, comments } = parsed.data;
  const supabase = await createServiceClient();

  // Buscar por código BC
  const { data: existing, error: findErr } = await supabase
    .from("suppliers")
    .select("id")
    .eq("codigo", codigo)
    .maybeSingle();

  if (findErr) return dbError(findErr.message);

  if (existing) {
    const { error } = await supabase
      .from("suppliers")
      .update({ name, tax_id: tax_id ?? null, comments: comments ?? null })
      .eq("id", existing.id);
    if (error) return dbError(error.message);
    return NextResponse.json({ ok: true, action: "updated", id: existing.id });
  }

  const { data, error } = await supabase
    .from("suppliers")
    .insert({ codigo, name, tax_id: tax_id ?? null, comments: comments ?? null, active: true })
    .select("id")
    .single();
  if (error) return dbError(error.message);

  return NextResponse.json({ ok: true, action: "created", id: data.id }, { status: 201 });
}
