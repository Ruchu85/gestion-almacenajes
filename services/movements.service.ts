import {
  InboundMovementsRepository,
  OutboundMovementsRepository,
} from "@/repositories/movements.repository";
import type { SupabaseClientType } from "@/repositories/base.repository";
import type {
  InboundMovement,
  OutboundMovement,
  InboundMovementWithRelations,
  OutboundMovementWithRelations,
  ServiceResult,
  PaginatedResult,
  InboundFilters,
  OutboundFilters,
  PaginationParams,
} from "@/types";
import type { InboundFormValues } from "@/validations/inbound.schema";
import type { OutboundFormValues } from "@/validations/outbound.schema";

export class InboundMovementsService {
  private readonly repo: InboundMovementsRepository;

  constructor(supabase: SupabaseClientType) {
    this.repo = new InboundMovementsRepository(supabase);
  }

  async getAll(
    filters?: InboundFilters,
    pagination?: PaginationParams
  ): Promise<ServiceResult<PaginatedResult<InboundMovementWithRelations>>> {
    try {
      const data = await this.repo.findWithRelations(filters, pagination);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getById(id: string): Promise<ServiceResult<InboundMovement>> {
    try {
      const data = await this.repo.findById(id);
      if (!data) return { data: null, error: "Movimiento no encontrado" };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async create(
    values: InboundFormValues,
    userId: string
  ): Promise<ServiceResult<InboundMovement>> {
    try {
      const data = await this.repo.create({
        ...values,
        created_by: userId,
      });
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async update(
    id: string,
    values: Partial<InboundFormValues>
  ): Promise<ServiceResult<InboundMovement>> {
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
      return { data: null, error: (err as Error).message };
    }
  }
}

export class OutboundMovementsService {
  private readonly repo: OutboundMovementsRepository;
  private readonly inboundRepo: InboundMovementsRepository;

  constructor(supabase: SupabaseClientType) {
    this.repo = new OutboundMovementsRepository(supabase);
    this.inboundRepo = new InboundMovementsRepository(supabase);
  }

  async getAll(
    filters?: OutboundFilters,
    pagination?: PaginationParams
  ): Promise<ServiceResult<PaginatedResult<OutboundMovementWithRelations>>> {
    try {
      const data = await this.repo.findWithRelations(filters, pagination);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getById(id: string): Promise<ServiceResult<OutboundMovement>> {
    try {
      const data = await this.repo.findById(id);
      if (!data) return { data: null, error: "Movimiento no encontrado" };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async create(
    values: OutboundFormValues,
    userId: string
  ): Promise<ServiceResult<OutboundMovement>> {
    try {
      const inbound = await this.inboundRepo.findByWarehouseAndProduct(
        values.warehouse_id,
        values.product_id
      );
      const outbound = await this.repo.findByWarehouseAndProduct(
        values.warehouse_id,
        values.product_id
      );

      const totalInbound = inbound.reduce(
        (acc, m) => acc + Number(m.quantity),
        0
      );
      const totalOutbound = outbound.reduce(
        (acc, m) => acc + Number(m.quantity),
        0
      );
      const pendingStock = totalInbound - totalOutbound;

      if (values.quantity > pendingStock) {
        return {
          data: null,
          error: `Stock insuficiente. Stock disponible: ${pendingStock.toFixed(3)} ud.`,
        };
      }

      const data = await this.repo.create({
        ...values,
        created_by: userId,
      });
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async update(
    id: string,
    values: Partial<OutboundFormValues>
  ): Promise<ServiceResult<OutboundMovement>> {
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
      return { data: null, error: (err as Error).message };
    }
  }
}
