import { NextResponse } from "next/server";
import { validateBcApiKey } from "@/lib/bc-api-auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/health
 * Comprueba que la API y la base de datos están operativas.
 * BC puede llamar a este endpoint para verificar conectividad antes de enviar datos.
 */
export async function GET(request: Request) {
  const authError = validateBcApiKey(request);
  if (authError) return authError;

  try {
    const supabase = await createServiceClient();
    const { error } = await supabase.from("warehouses").select("id").limit(1);
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      service: "GestAlmacén API v1",
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "database_error", detail: (err as Error).message },
      { status: 503 }
    );
  }
}
