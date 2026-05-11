import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { PaginationParams, PaginatedResult } from "@/types";

export type SupabaseClientType = SupabaseClient<Database>;

export abstract class BaseRepository<
  TRow extends Record<string, unknown>,
  TInsert extends Record<string, unknown>,
  TUpdate extends Record<string, unknown>
> {
  protected readonly tableName: string;

  constructor(
    protected readonly supabase: SupabaseClientType,
    tableName: string
  ) {
    this.tableName = tableName;
  }

  async findById(id: string): Promise<TRow | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`[${this.tableName}] findById: ${error.message}`);
    }

    return data as TRow;
  }

  async findAll(pagination?: PaginationParams): Promise<PaginatedResult<TRow>> {
    const page = pagination?.page ?? 1;
    const pageSize = pagination?.pageSize ?? 50;
    const sortBy = pagination?.sortBy ?? "created_at";
    const sortOrder = pagination?.sortOrder ?? "desc";

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await this.supabase
      .from(this.tableName)
      .select("*", { count: "exact" })
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(from, to);

    if (error) {
      throw new Error(`[${this.tableName}] findAll: ${error.message}`);
    }

    return {
      data: (data ?? []) as TRow[],
      count: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async create(data: TInsert): Promise<TRow> {
    const { data: created, error } = await this.supabase
      .from(this.tableName)
      .insert(data as never)
      .select()
      .single();

    if (error) {
      throw new Error(`[${this.tableName}] create: ${error.message}`);
    }

    return created as TRow;
  }

  async update(id: string, data: TUpdate): Promise<TRow> {
    const { data: updated, error } = await this.supabase
      .from(this.tableName)
      .update(data as never)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(`[${this.tableName}] update: ${error.message}`);
    }

    return updated as TRow;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(`[${this.tableName}] delete: ${error.message}`);
    }
  }

  async exists(id: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("id")
      .eq("id", id)
      .single();

    if (error && error.code === "PGRST116") return false;
    if (error) throw new Error(`[${this.tableName}] exists: ${error.message}`);
    return !!data;
  }
}
