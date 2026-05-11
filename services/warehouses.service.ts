import { WarehousesRepository } from "@/repositories/warehouses.repository";
import type { SupabaseClientType } from "@/repositories/base.repository";
import type { Warehouse, ServiceResult, PaginatedResult, PaginationParams } from "@/types";
import type { WarehouseFormValues } from "@/validations/warehouse.schema";

export class WarehousesService {
  private readonly repo: WarehousesRepository;

  constructor(supabase: SupabaseClientType) {
    this.repo = new WarehousesRepository(supabase);
  }

  async getAll(
    pagination?: PaginationParams
  ): Promise<ServiceResult<PaginatedResult<Warehouse>>> {
    try {
      const data = await this.repo.findAll({
        ...pagination,
        sortBy: pagination?.sortBy ?? "name",
        sortOrder: pagination?.sortOrder ?? "asc",
      });
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getActive(): Promise<ServiceResult<Warehouse[]>> {
    try {
      const data = await this.repo.findActive();
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getById(id: string): Promise<ServiceResult<Warehouse>> {
    try {
      const data = await this.repo.findById(id);
      if (!data) return { data: null, error: "Almacén no encontrado" };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async create(values: WarehouseFormValues): Promise<ServiceResult<Warehouse>> {
    try {
      const existing = await this.repo.findByCode(values.code);
      if (existing) {
        return {
          data: null,
          error: `Ya existe un almacén con el código "${values.code}"`,
        };
      }

      const data = await this.repo.create({
        ...values,
        code: values.code.toUpperCase(),
      });
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async update(
    id: string,
    values: Partial<WarehouseFormValues>
  ): Promise<ServiceResult<Warehouse>> {
    try {
      if (values.code) {
        const existing = await this.repo.findByCode(values.code);
        if (existing && existing.id !== id) {
          return {
            data: null,
            error: `Ya existe un almacén con el código "${values.code}"`,
          };
        }
      }

      const data = await this.repo.update(id, {
        ...values,
        ...(values.code ? { code: values.code.toUpperCase() } : {}),
      });
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async delete(id: string): Promise<ServiceResult<void>> {
    try {
      await this.repo.delete(id);
      return { data: undefined, error: null };
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("foreign key")) {
        return {
          data: null,
          error:
            "No se puede eliminar: el almacén tiene movimientos asociados",
        };
      }
      return { data: null, error: msg };
    }
  }

  async toggleActive(
    id: string,
    active: boolean
  ): Promise<ServiceResult<Warehouse>> {
    try {
      const data = await this.repo.toggleActive(id, active);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }
}
