import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBcApiKey, validationError, dbError } from "@/lib/bc-api-auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/products
 *
 * Crea o actualiza un producto en base a su código BC.
 * La clave de negocio es `code` — si ya existe, actualiza nombre y unidad.
 *
 * Payload esperado:
 * {
 *   "code": "051000",   // obligatorio — clave BC (= products.code)
 *   "name": "MAÍZ",    // obligatorio
 *   "unit": "TNS"      // obligatorio — unidad de medida
 * }
 *
 * Nota: el precio diario de almacenaje NO se sincroniza desde BC;
 * se gestiona directamente en el almacén (warehouses.storage_daily_price).
 *
 * Respuestas:
 *   201 { ok: true, action: "created", id }
 *   200 { ok: true, action: "updated", id }
 *   400 { ok: false, error: "validation_error", detail }
 *   401 { ok: false, error: "unauthorized" }
 */

const schema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(20),
});

export async function POST(request: Request) {
  const authError = validateBcApiKey(request);
  if (authError) return authError;

  let body: unknown;
  try { body = await request.json(); }
  catch { return validationError("El cuerpo de la petición no es JSON válido"); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.errors[0].message);

  const { code, name, unit } = parsed.data;
  const supabase = await createServiceClient();

  const { data: existing, error: findErr } = await supabase
    .from("products")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (findErr) return dbError(findErr.message);

  if (existing) {
    const { error } = await supabase
      .from("products")
      .update({ name, unit })
      .eq("id", existing.id);
    if (error) return dbError(error.message);
    return NextResponse.json({ ok: true, action: "updated", id: existing.id });
  }

  const { data, error } = await supabase
    .from("products")
    .insert({ code, name, unit, active: true })
    .select("id")
    .single();
  if (error) return dbError(error.message);

  return NextResponse.json({ ok: true, action: "created", id: data.id }, { status: 201 });
}
