import { ProductsRepository } from "@/repositories/products.repository";
import type { SupabaseClientType } from "@/repositories/base.repository";
import type { Product, ServiceResult, PaginatedResult, PaginationParams } from "@/types";
import type { ProductFormValues } from "@/validations/product.schema";

export class ProductsService {
  private readonly repo: ProductsRepository;

  constructor(supabase: SupabaseClientType) {
    this.repo = new ProductsRepository(supabase);
  }

  async getAll(
    pagination?: PaginationParams
  ): Promise<ServiceResult<PaginatedResult<Product>>> {
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

  async getActive(): Promise<ServiceResult<Product[]>> {
    try {
      const data = await this.repo.findActive();
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getById(id: string): Promise<ServiceResult<Product>> {
    try {
      const data = await this.repo.findById(id);
      if (!data) return { data: null, error: "Producto no encontrado" };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async create(values: ProductFormValues): Promise<ServiceResult<Product>> {
    try {
      const existing = await this.repo.findByCode(values.code);
      if (existing) {
        return {
          data: null,
          error: `Ya existe un producto con el código "${values.code}"`,
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
    values: Partial<ProductFormValues>
  ): Promise<ServiceResult<Product>> {
    try {
      if (values.code) {
        const existing = await this.repo.findByCode(values.code);
        if (existing && existing.id !== id) {
          return {
            data: null,
            error: `Ya existe un producto con el código "${values.code}"`,
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
          error: "No se puede eliminar: el producto tiene movimientos asociados",
        };
      }
      return { data: null, error: msg };
    }
  }

  async toggleActive(
    id: string,
    active: boolean
  ): Promise<ServiceResult<Product>> {
    try {
      const data = await this.repo.toggleActive(id, active);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }
}
