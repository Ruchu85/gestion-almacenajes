import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBcApiKey, validationError, referenceError, dbError } from "@/lib/bc-api-auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/puestas
 *
 * Registra una nueva puesta a disposición desde Business Central.
 * La clave de negocio es `numero_puesta` (= puestas_a_disposicion.numero_contrato).
 * Si ya existe una puesta con ese número, devuelve { action: "already_exists" }
 * sin crear duplicado (idempotente).
 *
 * La fecha de fin de plancha (fecha_fin_plancha) se calcula automáticamente
 * en la base de datos como columna GENERATED (fecha_puesta + dias_plancha).
 *
 * Payload esperado:
 * {
 *   "numero_puesta":    "D02600235_40-1",  // obligatorio — clave idempotencia
 *   "warehouse_code":   "CN",              // obligatorio — warehouses.code
 *   "product_code":     "051000",          // obligatorio — products.code
 *   "customer_code":    "CLI001",          // opcional   — customers.codigo
 *   "cantidad_inicial": 150.0,            // obligatorio — > 0
 *   "fecha_puesta":     "2024-01-15",      // obligatorio — YYYY-MM-DD
 *   "dias_plancha":     0,                // opcional   — por defecto 0
 *   "comentarios":      "..."             // opcional
 * }
 *
 * Respuestas:
 *   201 { ok: true, action: "created",        id }
 *   200 { ok: true, action: "already_exists", id }
 *   400 { ok: false, error: "validation_error",    detail }
 *   401 { ok: false, error: "unauthorized" }
 *   422 { ok: false, error: "reference_not_found", detail }
 */

const schema = z.object({
  numero_puesta:    z.string().min(1).max(100),
  warehouse_code:   z.string().min(1).max(20),
  product_code:     z.string().min(1).max(50),
  customer_code:    z.string().max(50).optional().nullable(),
  cantidad_inicial: z.number({ invalid_type_error: "cantidad_inicial debe ser un número" }).positive("cantidad_inicial debe ser > 0"),
  fecha_puesta:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha_puesta debe ser YYYY-MM-DD"),
  dias_plancha:     z.number().int().min(0).max(365).default(0),
  comentarios:      z.string().max(2000).optional().nullable(),
});

export async function POST(request: Request) {
  const authError = validateBcApiKey(request);
  if (authError) return authError;

  let body: unknown;
  try { body = await request.json(); }
  catch { return validationError("El cuerpo de la petición no es JSON válido"); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.errors[0].message);

  const {
    numero_puesta, warehouse_code, product_code, customer_code,
    cantidad_inicial, fecha_puesta, dias_plancha, comentarios,
  } = parsed.data;

  const supabase = await createServiceClient();

  // ── Idempotencia ──────────────────────────────────────────────
  const { data: existing, error: dupErr } = await supabase
    .from("puestas_a_disposicion")
    .select("id")
    .eq("numero_contrato", numero_puesta)
    .maybeSingle();

  if (dupErr) return dbError(dupErr.message);
  if (existing) {
    return NextResponse.json({ ok: true, action: "already_exists", id: existing.id });
  }

  // ── Resolución de FKs ─────────────────────────────────────────
  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id")
    .eq("code", warehouse_code)
    .maybeSingle();

  if (!warehouse) return referenceError(`Almacén con código '${warehouse_code}' no encontrado`);

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("code", product_code)
    .maybeSingle();

  if (!product) return referenceError(`Producto con código '${product_code}' no encontrado`);

  let customer_id: string | null = null;
  if (customer_code) {
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("codigo", customer_code)
      .maybeSingle();
    if (!customer) return referenceError(`Cliente con código '${customer_code}' no encontrado`);
    customer_id = customer.id;
  }

  // ── Inserción ─────────────────────────────────────────────────
  // fecha_fin_plancha es GENERATED ALWAYS en la BD — no se envía
  const { data, error } = await supabase
    .from("puestas_a_disposicion")
    .insert({
      numero_contrato:  numero_puesta,
      warehouse_id:     warehouse.id,
      product_id:       product.id,
      customer_id,
      cantidad_inicial,
      fecha_puesta,
      dias_plancha,
      estado:           "abierta",
      comentarios:      comentarios ?? null,
      created_by:       null,
    })
    .select("id")
    .single();

  if (error) return dbError(error.message);

  return NextResponse.json({ ok: true, action: "created", id: data.id }, { status: 201 });
}
