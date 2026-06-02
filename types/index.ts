import type { Tables } from "./database.types";

// ============================================================
// ENTIDADES DE DOMINIO (re-exports tipados de la DB)
// ============================================================
export type Warehouse = Tables<"warehouses">;
export type Product = Tables<"products">;
export type Supplier = Tables<"suppliers">;
export type Customer = Tables<"customers">;
export type UserProfile = Tables<"user_profiles">;
export type InboundMovement = Tables<"inbound_movements">;
export type OutboundMovement = Tables<"outbound_movements">;
export type StorageCost = Tables<"storage_costs">;
export type PuestaADisposicion = Tables<"puestas_a_disposicion">;
export type SalidaParcial = Tables<"salidas_parciales">;
export type TarifaTramo = Tables<"tarifa_tramos">;
export type Matricula = Tables<"matriculas">;
export type WarehousePriceHistory = Tables<"warehouse_price_history">;

// ============================================================
// TIPOS ENRIQUECIDOS (con relaciones joined)
// ============================================================
export type InboundMovementWithRelations = InboundMovement & {
  warehouse: Pick<Warehouse, "id" | "code" | "name">;
  product: Pick<Product, "id" | "code" | "name" | "unit">;
  supplier: Pick<Supplier, "id" | "name"> | null;
};

export type OutboundMovementWithRelations = OutboundMovement & {
  warehouse: Pick<Warehouse, "id" | "code" | "name">;
  product: Pick<Product, "id" | "code" | "name" | "unit">;
  customer: Pick<Customer, "id" | "name"> | null;
};

export type StorageCostWithRelations = StorageCost & {
  warehouse: Pick<Warehouse, "id" | "code" | "name">;
  product: Pick<Product, "id" | "code" | "name" | "unit">;
};

// ============================================================
// TIPOS DE STOCK Y KPIs
// ============================================================
// ============================================================
// TIPOS ENRIQUECIDOS — PUESTAS A DISPOSICIÓN
// ============================================================
export type PuestaEstado = "abierta" | "finalizada" | "cerrada_manual" | "traspasada";

export interface PuestaSummary {
  puesta_id: string;
  numero_contrato: string;
  customer_name: string;
  product_name: string;
  product_code: string;
  unit: string;
  warehouse_name: string;
  cantidad_inicial: number;
  cantidad_salida: number;
  cantidad_pendiente: number;
  cantidad_fisica_pendiente: number;
  fecha_puesta: string;
  dias_plancha: number;
  fecha_fin_plancha: string;
  dias_activos: number;
  coste_acumulado: number;
  estado: string;
  created_at: string;
}

export interface PuestaDailyBreakdown {
  dia: string;
  dias_activos: number;
  cantidad_pendiente: number;
  tarifa_diaria: number;
  coste_dia: number;
}

export type PuestaADisposicionWithRelations = PuestaADisposicion & {
  customer: Pick<Customer, "id" | "name"> | null;
  product: Pick<Product, "id" | "code" | "name" | "unit">;
  warehouse: Pick<Warehouse, "id" | "code" | "name">;
  salidas_parciales?: SalidaParcial[];
};

// ============================================================
export interface StockSummaryItem {
  warehouse_id: string;
  warehouse_name: string;
  product_id: string;
  product_name: string;
  product_code: string;
  unit: string;
  total_inbound: number;
  total_outbound: number;
  pending_stock: number;
  daily_price: number;
  daily_cost: number;
}

export interface DashboardKPIs {
  total_cost_today: number;
  total_cost_month: number;
  total_cost_year: number;
  active_warehouses: number;
  active_products: number;
  pending_stock_units: number;
  inbound_month: number;
  outbound_month: number;
}

export interface MonthlyCostEvolution {
  month: string;
  total_cost: number;
}

// ============================================================
// TIPOS DE RESPUESTA DE SERVICIO
// ============================================================
export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================
// TIPOS DE FILTROS
// ============================================================
export interface DateRangeFilter {
  from?: Date;
  to?: Date;
}

export interface MovementFilters {
  warehouseId?: string;
  productId?: string;
  dateRange?: DateRangeFilter;
}

export interface InboundFilters extends MovementFilters {
  supplierId?: string;
}

export interface OutboundFilters extends MovementFilters {
  customerId?: string;
}

export interface StorageCostFilters {
  warehouseId?: string;
  productId?: string;
  dateRange?: DateRangeFilter;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ============================================================
// TIPOS DE AUTENTICACIÓN
// ============================================================
export type UserRole = "admin" | "user";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
}

// ============================================================
// TIPOS DE EXPORTACIÓN
// ============================================================
export type ExportFormat = "csv" | "excel" | "pdf";

export interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  title?: string;
}
