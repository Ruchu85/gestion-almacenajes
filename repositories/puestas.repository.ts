import { BaseRepository, type SupabaseClientType } from "./base.repository";
import type { Database } from "@/types/database.types";
import type { PuestaSummary, PuestaDailyBreakdown } from "@/types";

type PuestaRow    = Database["public"]["Tables"]["puestas_a_disposicion"]["Row"];
type PuestaInsert = Database["public"]["Tables"]["puestas_a_disposicion"]["Insert"];
type PuestaUpdate = Database["public"]["Tables"]["puestas_a_disposicion"]["Update"];

export class PuestasRepository extends BaseRepository<PuestaRow, PuestaInsert, PuestaUpdate> {
  constructor(supabase: SupabaseClientType) {
    super(supabase, "puestas_a_disposicion");
  }

  async findAllSummary(fecha?: string): Promise<PuestaSummary[]> {
    const { data, error } = await this.supabase.rpc("get_all_puestas_summary", {
      p_fecha: fecha ?? new Date().toISOString().split("T")[0],
    });
    if (error) throw new Error(`[puestas] findAllSummary: ${error.message}`);
    return (data ?? []) as PuestaSummary[];
  }

  async findSummaryById(id: string, fecha?: string): Promise<PuestaSummary | null> {
    const { data, error } = await this.supabase.rpc("get_puesta_summary", {
      p_puesta_id: id,
      p_fecha: fecha ?? new Date().toISOString().split("T")[0],
    });
    if (error) throw new Error(`[puestas] findSummaryById: ${error.message}`);
    return (data?.[0] as PuestaSummary) ?? null;
  }

  async findDailyBreakdown(
    id: string,
    fechaInicio?: string | null,
    fechaFin?: string
  ): Promise<PuestaDailyBreakdown[]> {
    const { data, error } = await this.supabase.rpc("get_puesta_daily_breakdown", {
      p_puesta_id: id,
      p_fecha_inicio: fechaInicio ?? null,
      p_fecha_fin: fechaFin ?? new Date().toISOString().split("T")[0],
    });
    if (error) throw new Error(`[puestas] findDailyBreakdown: ${error.message}`);
    return (data ?? []) as PuestaDailyBreakdown[];
  }

  async findByEstado(estado: "abierta" | "finalizada" | "cerrada_manual"): Promise<PuestaRow[]> {
    const { data, error } = await this.supabase
      .from("puestas_a_disposicion")
      .select("*")
      .eq("estado", estado)
      .order("fecha_puesta", { ascending: false });
    if (error) throw new Error(`[puestas] findByEstado: ${error.message}`);
    return data ?? [];
  }

  async updateEstado(
    id: string,
    estado: "abierta" | "finalizada" | "cerrada_manual"
  ): Promise<PuestaRow> {
    const update: PuestaUpdate = { estado };
    const { data, error } = await this.supabase
      .from("puestas_a_disposicion")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(`[puestas] updateEstado: ${error.message}`);
    return data as PuestaRow;
  }
}
