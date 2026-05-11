import { BaseRepository, type SupabaseClientType } from "./base.repository";
import type {
  Database,
  Tables,
  InsertDto,
  UpdateDto,
} from "@/types/database.types";

type WarehouseRow = Tables<"warehouses">;
type WarehouseInsert = InsertDto<"warehouses">;
type WarehouseUpdate = UpdateDto<"warehouses">;

export class WarehousesRepository extends BaseRepository<
  WarehouseRow,
  WarehouseInsert,
  WarehouseUpdate
> {
  constructor(supabase: SupabaseClientType) {
    super(supabase, "warehouses");
  }

  async findActive(): Promise<WarehouseRow[]> {
    const { data, error } = await this.supabase
      .from("warehouses")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) throw new Error(`[warehouses] findActive: ${error.message}`);
    return data ?? [];
  }

  async findByCode(code: string): Promise<WarehouseRow | null> {
    const { data, error } = await this.supabase
      .from("warehouses")
      .select("*")
      .eq("code", code.toUpperCase())
      .single();

    if (error?.code === "PGRST116") return null;
    if (error) throw new Error(`[warehouses] findByCode: ${error.message}`);
    return data;
  }

  async toggleActive(id: string, active: boolean): Promise<WarehouseRow> {
    return this.update(id, { active });
  }
}
