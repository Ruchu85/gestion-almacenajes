import { BaseRepository, type SupabaseClientType } from "./base.repository";
import type { Tables, InsertDto, UpdateDto } from "@/types/database.types";

type SupplierRow = Tables<"suppliers">;
type SupplierInsert = InsertDto<"suppliers">;
type SupplierUpdate = UpdateDto<"suppliers">;

export class SuppliersRepository extends BaseRepository<
  SupplierRow,
  SupplierInsert,
  SupplierUpdate
> {
  constructor(supabase: SupabaseClientType) {
    super(supabase, "suppliers");
  }

  async findActive(): Promise<SupplierRow[]> {
    const { data, error } = await this.supabase
      .from("suppliers")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) throw new Error(`[suppliers] findActive: ${error.message}`);
    return data ?? [];
  }

  async toggleActive(id: string, active: boolean): Promise<SupplierRow> {
    return this.update(id, { active });
  }
}
