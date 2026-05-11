import { StorageCostsRepository } from "@/repositories/storage-costs.repository";
import type { SupabaseClientType } from "@/repositories/base.repository";
import type {
  StorageCostWithRelations,
  DashboardKPIs,
  MonthlyCostEvolution,
  StockSummaryItem,
  ServiceResult,
  PaginatedResult,
  StorageCostFilters,
  PaginationParams,
} from "@/types";
import { format } from "date-fns";

export class StorageCostsService {
  private readonly repo: StorageCostsRepository;

  constructor(supabase: SupabaseClientType) {
    this.repo = new StorageCostsRepository(supabase);
  }

  async getAll(
    filters?: StorageCostFilters,
    pagination?: PaginationParams
  ): Promise<ServiceResult<PaginatedResult<StorageCostWithRelations>>> {
    try {
      const data = await this.repo.findWithRelations(filters, pagination);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getDashboardKPIs(
    date?: Date
  ): Promise<ServiceResult<DashboardKPIs>> {
    try {
      const { data, error } = await (this.repo as unknown as {
        supabase: SupabaseClientType;
      }).supabase.rpc("get_dashboard_kpis", {
        p_date: date ? format(date, "yyyy-MM-dd") : undefined,
      });

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        return {
          data: {
            total_cost_today: 0,
            total_cost_month: 0,
            total_cost_year: 0,
            active_warehouses: 0,
            active_products: 0,
            pending_stock_units: 0,
            inbound_month: 0,
            outbound_month: 0,
          },
          error: null,
        };
      }

      return { data: data[0] as DashboardKPIs, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getMonthlyCostEvolution(
    months = 12
  ): Promise<ServiceResult<MonthlyCostEvolution[]>> {
    try {
      const data = await this.repo.getMonthlyCostEvolution(months);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getStockSummary(): Promise<ServiceResult<StockSummaryItem[]>> {
    try {
      const { data, error } = await (this.repo as unknown as {
        supabase: SupabaseClientType;
      }).supabase.rpc("get_stock_summary");

      if (error) throw new Error(error.message);
      return { data: (data ?? []) as StockSummaryItem[], error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async recalculate(
    startDate: string,
    endDate: string
  ): Promise<ServiceResult<number>> {
    try {
      const rows = await this.repo.recalculate(startDate, endDate);
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async recalculateToday(): Promise<ServiceResult<number>> {
    const today = format(new Date(), "yyyy-MM-dd");
    return this.recalculate(today, today);
  }
}
