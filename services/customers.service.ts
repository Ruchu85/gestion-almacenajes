import { CustomersRepository } from "@/repositories/customers.repository";
import type { SupabaseClientType } from "@/repositories/base.repository";
import type { Customer, ServiceResult, PaginatedResult, PaginationParams } from "@/types";
import type { CustomerFormValues } from "@/validations/customer.schema";

export class CustomersService {
  private readonly repo: CustomersRepository;

  constructor(supabase: SupabaseClientType) {
    this.repo = new CustomersRepository(supabase);
  }

  async getAll(
    pagination?: PaginationParams
  ): Promise<ServiceResult<PaginatedResult<Customer>>> {
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

  async getActive(): Promise<ServiceResult<Customer[]>> {
    try {
      const data = await this.repo.findActive();
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getById(id: string): Promise<ServiceResult<Customer>> {
    try {
      const data = await this.repo.findById(id);
      if (!data) return { data: null, error: "Cliente no encontrado" };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async create(values: CustomerFormValues): Promise<ServiceResult<Customer>> {
    try {
      const data = await this.repo.create(values);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async update(
    id: string,
    values: Partial<CustomerFormValues>
  ): Promise<ServiceResult<Customer>> {
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
          error: "No se puede eliminar: el cliente tiene movimientos asociados",
        };
      }
      return { data: null, error: msg };
    }
  }

  async toggleActive(
    id: string,
    active: boolean
  ): Promise<ServiceResult<Customer>> {
    try {
      const data = await this.repo.toggleActive(id, active);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }
}
