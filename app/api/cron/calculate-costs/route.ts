import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = await createServiceClient();
    const today = new Date().toISOString().split("T")[0];

    // ── 1. Calcular costes de almacenaje del día ────────────────────────────
    const { data, error } = await supabase.rpc("recalculate_storage_costs", {
      p_start_date: today,
      p_end_date: today,
    });

    if (error) {
      console.error("[cron] recalculate_storage_costs error:", error);
      return NextResponse.json(
        { error: "Database error", details: error.message },
        { status: 500 }
      );
    }

    // ── 2. Generar auto-salidas de fin de plancha vencidas ──────────────────
    // Busca puestas abiertas cuya fecha_fin_plancha ya pasó y no tienen
    // salida de tipo 'plancha' → las genera con la cantidad pendiente
    // a fecha fin de plancha (solo salidas reales ≤ fecha_fin_plancha).
    type SalidaRow = { cantidad: number; tipo: string; fecha_salida: string };
    const { data: puestasVencidas } = await supabase
      .from("puestas_a_disposicion")
      .select("id, fecha_fin_plancha, warehouse_id, product_id, customer_id, numero_contrato, cantidad_inicial, salidas_parciales(cantidad, tipo, fecha_salida)")
      .eq("estado", "abierta")
      .lte("fecha_fin_plancha", today);

    let planchaCreated = 0;
    for (const puesta of puestasVencidas ?? []) {
      const salidas = (puesta.salidas_parciales ?? []) as SalidaRow[];

      // Idempotencia: si ya existe, saltar
      if (salidas.some((s) => s.tipo === "plancha")) continue;

      const fechaFinStr = puesta.fecha_fin_plancha as string;

      // Solo salidas reales hasta el fin de plancha
      const totalReal = salidas
        .filter((s) => s.tipo === "real" && s.fecha_salida <= fechaFinStr)
        .reduce((sum, s) => sum + Number(s.cantidad), 0);
      const pending = Math.max(0, Number(puesta.cantidad_inicial) - totalReal);
      if (pending <= 0) continue;

      const { error: salidaErr } = await supabase.from("salidas_parciales").insert({
        puesta_id: puesta.id,
        fecha_salida: fechaFinStr,
        cantidad: pending,
        tipo: "plancha",
        comentarios: "Salida automática fin de plancha (cron)",
        created_by: null,
      });
      if (salidaErr) {
        console.error(`[cron] plancha auto-exit error for puesta ${puesta.id}:`, salidaErr.message);
        continue;
      }

      await supabase.from("outbound_movements").insert({
        warehouse_id: puesta.warehouse_id,
        product_id: puesta.product_id,
        quantity: pending,
        movement_date: fechaFinStr,
        free_days: 0,
        customer_id: puesta.customer_id ?? null,
        comments: `Auto-salida fin de plancha${puesta.numero_contrato ? ` (${puesta.numero_contrato})` : ""} (cron)`,
        from_puesta: true,
        created_by: null,
      });

      planchaCreated++;
    }

    console.log(`[cron] ${today}: costs=${data} records, plancha_exits=${planchaCreated} created`);

    return NextResponse.json({
      success: true,
      date: today,
      records: data,
      planchaExitsCreated: planchaCreated,
    });
  } catch (err) {
    console.error("[cron] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Vercel cron jobs call via GET in some configurations — support both
export async function GET(request: NextRequest) {
  return POST(request);
}
