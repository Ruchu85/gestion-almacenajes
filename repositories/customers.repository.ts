import { BaseRepository, type SupabaseClientType } from "./base.repository";
import type { Tables, InsertDto, UpdateDto } from "@/types/database.types";

type CustomerRow = Tables<"customers">;
type CustomerInsert = InsertDto<"customers">;
type CustomerUpdate = UpdateDto<"customers">;

export class CustomersRepository extends BaseRepository<
  CustomerRow,
  CustomerInsert,
  CustomerUpdate
> {
  constructor(supabase: SupabaseClientType) {
    super(supabase, "customers");
  }

  async findActive(): Promise<CustomerRow[]> {
    const { data, error } = await this.supabase
      .from("customers")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) throw new Error(`[customers] findActive: ${error.message}`);
    return data ?? [];
  }

  async toggleActive(id: string, active: boolean): Promise<CustomerRow> {
    return this.update(id, { active });
  }
}
