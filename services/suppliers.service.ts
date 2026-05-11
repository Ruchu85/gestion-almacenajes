import { SuppliersRepository } from "@/repositories/suppliers.repository";
import type { SupabaseClientType } from "@/repositories/base.repository";
import type { Supplier, ServiceResult, PaginatedResult, PaginationParams } from "@/types";
import type { SupplierFormValues } from "@/validations/supplier.schema";

export class SuppliersService {
  private readonly repo: SuppliersRepository;

  constructor(supabase: SupabaseClientType) {
    this.repo = new SuppliersRepository(supabase);
  }

  async getAll(
    pagination?: PaginationParams
  ): Promise<ServiceResult<PaginatedResult<Supplier>>> {
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

  async getActive(): Promise<ServiceResult<Supplier[]>> {
    try {
      const data = await this.repo.findActive();
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getById(id: string): Promise<ServiceResult<Supplier>> {
    try {
      const data = await this.repo.findById(id);
      if (!data) return { data: null, error: "Proveedor no encontrado" };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async create(values: SupplierFormValues): Promise<ServiceResult<Supplier>> {
    try {
      const data = await this.repo.create(values);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async update(
    id: string,
    values: Partial<SupplierFormValues>
  ): Promise<ServiceResult<Supplier>> {
    try {
      const data = await this.repo.update(id, values);
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
            "No se puede eliminar: el proveedor tiene movimientos asociados",
        };
      }
      return { data: null, error: msg };
    }
  }

  async toggleActive(
    id: string,
    active: boolean
  ): Promise<ServiceResult<Supplier>> {
    try {
      const data = await this.repo.toggleActive(id, active);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }
}
