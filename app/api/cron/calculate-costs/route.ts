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

    console.log(`[cron] Calculated costs for ${today}: ${data} records processed`);

    return NextResponse.json({
      success: true,
      date: today,
      records: data,
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
