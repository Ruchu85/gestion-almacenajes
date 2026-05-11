import { BaseRepository, type SupabaseClientType } from "./base.repository";
import type { Tables, InsertDto, UpdateDto } from "@/types/database.types";

type ProductRow = Tables<"products">;
type ProductInsert = InsertDto<"products">;
type ProductUpdate = UpdateDto<"products">;

export class ProductsRepository extends BaseRepository<
  ProductRow,
  ProductInsert,
  ProductUpdate
> {
  constructor(supabase: SupabaseClientType) {
    super(supabase, "products");
  }

  async findActive(): Promise<ProductRow[]> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) throw new Error(`[products] findActive: ${error.message}`);
    return data ?? [];
  }

  async findByCode(code: string): Promise<ProductRow | null> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*")
      .eq("code", code.toUpperCase())
      .single();

    if (error?.code === "PGRST116") return null;
    if (error) throw new Error(`[products] findByCode: ${error.message}`);
    return data;
  }

  async toggleActive(id: string, active: boolean): Promise<ProductRow> {
    return this.update(id, { active });
  }
}
