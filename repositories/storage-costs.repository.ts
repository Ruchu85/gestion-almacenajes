import { BaseRepository, type SupabaseClientType } from "./base.repository";
import type { Tables, InsertDto, UpdateDto } from "@/types/database.types";
import type {
  StorageCostWithRelations,
  StorageCostFilters,
  PaginationParams,
  PaginatedResult,
  MonthlyCostEvolution,
} from "@/types";
import { format } from "date-fns";

type StorageCostRow = Tables<"storage_costs">;
type StorageCostInsert = InsertDto<"storage_costs">;
type StorageCostUpdate = UpdateDto<"storage_costs">;

const STORAGE_COST_WITH_RELATIONS = `
  *,
  warehouse:warehouses(id, code, name),
  product:products(id, code, name, unit)
`;

export class StorageCostsRepository extends BaseRepository<
  StorageCostRow,
  StorageCostInsert,
  StorageCostUpdate
> {
  constructor(supabase: SupabaseClientType) {
    super(supabase, "storage_costs");
  }

  async findWithRelations(
    filters?: StorageCostFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<StorageCostWithRelations>> {
    const page = pagination?.page ?? 1;
    const pageSize = pagination?.pageSize ?? 50;
    const sortBy = pagination?.sortBy ?? "cost_date";
    const sortOrder = pagination?.sortOrder ?? "desc";
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from("storage_costs")
      .select(STORAGE_COST_WITH_RELATIONS, { count: "exact" });

    if (filters?.warehouseId) {
      query = query.eq("warehouse_id", filters.warehouseId);
    }
    if (filters?.productId) {
      query = query.eq("product_id", filters.productId);
    }
    if (filters?.dateRange?.from) {
      query = query.gte(
        "cost_date",
        format(filters.dateRange.from, "yyyy-MM-dd")
      );
    }
    if (filters?.dateRange?.to) {
      query = query.lte(
        "cost_date",
        format(filters.dateRange.to, "yyyy-MM-dd")
      );
    }

    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(from, to);

    if (error) {
      throw new Error(`[storage_costs] findWithRelations: ${error.message}`);
    }

    return {
      data: (data ?? []) as StorageCostWithRelations[],
      count: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async getTotalCostForDateRange(
    startDate: string,
    endDate: string
  ): Promise<number> {
    const { data, error } = await this.supabase
      .from("storage_costs")
      .select("total_cost")
      .gte("cost_date", startDate)
      .lte("cost_date", endDate);

    if (error) {
      throw new Error(
        `[storage_costs] getTotalCostForDateRange: ${error.message}`
      );
    }

    return (data ?? []).reduce(
      (acc, row) => acc + Number(row.total_cost),
      0
    );
  }

  async getMonthlyCostEvolution(months = 12): Promise<MonthlyCostEvolution[]> {
    const { data, error } = await this.supabase.rpc(
      "get_monthly_cost_evolution",
      { p_months: months }
    );

    if (error) {
      throw new Error(
        `[storage_costs] getMonthlyCostEvolution: ${error.message}`
      );
    }

    return (data ?? []) as MonthlyCostEvolution[];
  }

  async recalculate(startDate: string, endDate: string): Promise<number> {
    const { data, error } = await this.supabase.rpc(
      "recalculate_storage_costs",
      {
        p_start_date: startDate,
        p_end_date: endDate,
      }
    );

    if (error) {
      throw new Error(`[storage_costs] recalculate: ${error.message}`);
    }

    return data as number;
  }
}
