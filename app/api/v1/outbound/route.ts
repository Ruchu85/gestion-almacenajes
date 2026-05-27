import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBcApiKey, validationError, referenceError, dbError } from "@/lib/bc-api-auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/outbound
 *
 * Registra una salida de mercancía desde Business Central.
 * La clave de negocio es `numero_albaran` — idempotente.
 *
 * Payload esperado:
 * {
 *   "numero_albaran":  "ALB-SAL-2024-001",  // obligatorio — clave idempotencia
 *   "warehouse_code":  "CN",                // obligatorio — warehouses.code
 *   "product_code":    "051000",            // obligatorio — products.code
 *   "customer_code":   "CLI001",            // opcional   — customers.codigo
 *   "quantity":        50.0,               // obligatorio — > 0
 *   "movement_date":   "2024-01-20",        // obligatorio — YYYY-MM-DD
 *   "free_days":       0,                  // opcional   — por defecto 0
 *   "comments":        "..."               // opcional
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
  numero_albaran: z.string().min(1).max(100),
  warehouse_code: z.string().min(1).max(20),
  product_code:   z.string().min(1).max(50),
  customer_code:  z.string().max(50).optional().nullable(),
  quantity:       z.number({ invalid_type_error: "quantity debe ser un número" }).positive("quantity debe ser > 0"),
  movement_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "movement_date debe ser YYYY-MM-DD"),
  free_days:      z.number().int().min(0).max(365).default(0),
  comments:       z.string().max(2000).optional().nullable(),
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
    numero_albaran, warehouse_code, product_code,
    customer_code, quantity, movement_date, free_days, comments,
  } = parsed.data;

  const supabase = await createServiceClient();

  // ── Idempotencia ──────────────────────────────────────────────
  const { data: existing, error: dupErr } = await supabase
    .from("outbound_movements")
    .select("id")
    .eq("numero_albaran", numero_albaran)
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
  const { data, error } = await supabase
    .from("outbound_movements")
    .insert({
      numero_albaran,
      warehouse_id:  warehouse.id,
      product_id:    product.id,
      customer_id,
      quantity,
      movement_date,
      free_days,
      comments:      comments ?? null,
      created_by:    null,
    })
    .select("id")
    .single();

  if (error) return dbError(error.message);

  return NextResponse.json({ ok: true, action: "created", id: data.id }, { status: 201 });
}
