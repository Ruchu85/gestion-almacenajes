import { BaseRepository, type SupabaseClientType } from "./base.repository";
import type { Tables, InsertDto, UpdateDto } from "@/types/database.types";
import type {
  InboundMovementWithRelations,
  OutboundMovementWithRelations,
  InboundFilters,
  OutboundFilters,
  PaginationParams,
  PaginatedResult,
} from "@/types";
import { format } from "date-fns";

type InboundRow = Tables<"inbound_movements">;
type InboundInsert = InsertDto<"inbound_movements">;
type InboundUpdate = UpdateDto<"inbound_movements">;

type OutboundRow = Tables<"outbound_movements">;
type OutboundInsert = InsertDto<"outbound_movements">;
type OutboundUpdate = UpdateDto<"outbound_movements">;

const INBOUND_WITH_RELATIONS = `
  *,
  warehouse:warehouses(id, code, name),
  product:products(id, code, name, unit),
  supplier:suppliers(id, name)
`;

const OUTBOUND_WITH_RELATIONS = `
  *,
  warehouse:warehouses(id, code, name),
  product:products(id, code, name, unit),
  customer:customers(id, name)
`;

export class InboundMovementsRepository extends BaseRepository<
  InboundRow,
  InboundInsert,
  InboundUpdate
> {
  constructor(supabase: SupabaseClientType) {
    super(supabase, "inbound_movements");
  }

  async findWithRelations(
    filters?: InboundFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<InboundMovementWithRelations>> {
    const page = pagination?.page ?? 1;
    const pageSize = pagination?.pageSize ?? 50;
    const sortBy = pagination?.sortBy ?? "movement_date";
    const sortOrder = pagination?.sortOrder ?? "desc";
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from("inbound_movements")
      .select(INBOUND_WITH_RELATIONS, { count: "exact" });

    if (filters?.warehouseId) {
      query = query.eq("warehouse_id", filters.warehouseId);
    }
    if (filters?.productId) {
      query = query.eq("product_id", filters.productId);
    }
    if (filters?.supplierId) {
      query = query.eq("supplier_id", filters.supplierId);
    }
    if (filters?.dateRange?.from) {
      query = query.gte(
        "movement_date",
        format(filters.dateRange.from, "yyyy-MM-dd")
      );
    }
    if (filters?.dateRange?.to) {
      query = query.lte(
        "movement_date",
        format(filters.dateRange.to, "yyyy-MM-dd")
      );
    }

    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(from, to);

    if (error) {
      throw new Error(`[inbound_movements] findWithRelations: ${error.message}`);
    }

    return {
      data: (data ?? []) as InboundMovementWithRelations[],
      count: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async findByWarehouseAndProduct(
    warehouseId: string,
    productId: string
  ): Promise<InboundRow[]> {
    const { data, error } = await this.supabase
      .from("inbound_movements")
      .select("*")
      .eq("warehouse_id", warehouseId)
      .eq("product_id", productId)
      .order("movement_date", { ascending: true });

    if (error) {
      throw new Error(
        `[inbound_movements] findByWarehouseAndProduct: ${error.message}`
      );
    }
    return data ?? [];
  }
}

export class OutboundMovementsRepository extends BaseRepository<
  OutboundRow,
  OutboundInsert,
  OutboundUpdate
> {
  constructor(supabase: SupabaseClientType) {
    super(supabase, "outbound_movements");
  }

  async findWithRelations(
    filters?: OutboundFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<OutboundMovementWithRelations>> {
    const page = pagination?.page ?? 1;
    const pageSize = pagination?.pageSize ?? 50;
    const sortBy = pagination?.sortBy ?? "movement_date";
    const sortOrder = pagination?.sortOrder ?? "desc";
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from("outbound_movements")
      .select(OUTBOUND_WITH_RELATIONS, { count: "exact" });

    if (filters?.warehouseId) {
      query = query.eq("warehouse_id", filters.warehouseId);
    }
    if (filters?.productId) {
      query = query.eq("product_id", filters.productId);
    }
    if (filters?.customerId) {
      query = query.eq("customer_id", filters.customerId);
    }
    if (filters?.dateRange?.from) {
      query = query.gte(
        "movement_date",
        format(filters.dateRange.from, "yyyy-MM-dd")
      );
    }
    if (filters?.dateRange?.to) {
      query = query.lte(
        "movement_date",
        format(filters.dateRange.to, "yyyy-MM-dd")
      );
    }

    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(from, to);

    if (error) {
      throw new Error(
        `[outbound_movements] findWithRelations: ${error.message}`
      );
    }

    return {
      data: (data ?? []) as OutboundMovementWithRelations[],
      count: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  }

  async findByWarehouseAndProduct(
    warehouseId: string,
    productId: string
  ): Promise<OutboundRow[]> {
    const { data, error } = await this.supabase
      .from("outbound_movements")
      .select("*")
      .eq("warehouse_id", warehouseId)
      .eq("product_id", productId)
      .order("movement_date", { ascending: true });

    if (error) {
      throw new Error(
        `[outbound_movements] findByWarehouseAndProduct: ${error.message}`
      );
    }
    return data ?? [];
  }
}
