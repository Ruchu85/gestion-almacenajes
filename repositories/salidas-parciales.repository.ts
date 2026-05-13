import { BaseRepository, type SupabaseClientType } from "./base.repository";
import type { Database } from "@/types/database.types";

type SalidaRow    = Database["public"]["Tables"]["salidas_parciales"]["Row"];
type SalidaInsert = Database["public"]["Tables"]["salidas_parciales"]["Insert"];
type SalidaUpdate = Database["public"]["Tables"]["salidas_parciales"]["Update"];

export class SalidasParcialesRepository extends BaseRepository<SalidaRow, SalidaInsert, SalidaUpdate> {
  constructor(supabase: SupabaseClientType) {
    super(supabase, "salidas_parciales");
  }

  async findByPuesta(puestaId: string): Promise<SalidaRow[]> {
    const { data, error } = await this.supabase
      .from("salidas_parciales")
      .select("*")
      .eq("puesta_id", puestaId)
      .order("fecha_salida", { ascending: false });
    if (error) throw new Error(`[salidas_parciales] findByPuesta: ${error.message}`);
    return data ?? [];
  }

  async totalSalidaByPuesta(puestaId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("salidas_parciales")
      .select("cantidad")
      .eq("puesta_id", puestaId);
    if (error) throw new Error(`[salidas_parciales] totalSalidaByPuesta: ${error.message}`);
    return (data ?? []).reduce((sum, row) => sum + row.cantidad, 0);
  }
}
