import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Verify the user is authenticated
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { start_date?: string; end_date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { start_date, end_date } = body;

  if (!start_date || !end_date) {
    return NextResponse.json(
      { error: "start_date and end_date are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(start_date) || !datePattern.test(end_date)) {
    return NextResponse.json(
      { error: "Dates must be in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  if (start_date > end_date) {
    return NextResponse.json(
      { error: "start_date must be before or equal to end_date" },
      { status: 400 }
    );
  }

  // Use service client to bypass RLS for recalculation
  const serviceSupabase = await createServiceClient();

  const { data, error } = await serviceSupabase.rpc(
    "recalculate_storage_costs",
    {
      p_start_date: start_date,
      p_end_date: end_date,
    }
  );

  if (error) {
    console.error("[api] recalculate_storage_costs error:", error);
    return NextResponse.json(
      { error: "Database error", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    start_date,
    end_date,
    records: data,
  });
}
