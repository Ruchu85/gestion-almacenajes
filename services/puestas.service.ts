import { PuestasRepository } from "@/repositories/puestas.repository";
import { SalidasParcialesRepository } from "@/repositories/salidas-parciales.repository";
import type { SupabaseClientType } from "@/repositories/base.repository";
import type {
  PuestaADisposicion,
  SalidaParcial,
  PuestaSummary,
  PuestaDailyBreakdown,
  ServiceResult,
  PaginatedResult,
  PaginationParams,
} from "@/types";
import type { PuestaFormValues } from "@/validations/puesta.schema";
import type { SalidaParcialFormValues } from "@/validations/salida-parcial.schema";

export class PuestasService {
  private readonly repo: PuestasRepository;
  private readonly salidasRepo: SalidasParcialesRepository;

  constructor(supabase: SupabaseClientType) {
    this.repo = new PuestasRepository(supabase);
    this.salidasRepo = new SalidasParcialesRepository(supabase);
  }

  // ── Puestas ──────────────────────────────────────────────

  async getAllSummary(fecha?: string): Promise<ServiceResult<PuestaSummary[]>> {
    try {
      const data = await this.repo.findAllSummary(fecha);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getAll(pagination?: PaginationParams): Promise<ServiceResult<PaginatedResult<PuestaADisposicion>>> {
    try {
      const data = await this.repo.findAll({
        ...pagination,
        sortBy: pagination?.sortBy ?? "created_at",
        sortOrder: pagination?.sortOrder ?? "desc",
      });
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getById(id: string): Promise<ServiceResult<PuestaADisposicion>> {
    try {
      const data = await this.repo.findById(id);
      if (!data) return { data: null, error: "Puesta a disposición no encontrada" };
      return { data: data as PuestaADisposicion, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getSummaryById(id: string, fecha?: string): Promise<ServiceResult<PuestaSummary>> {
    try {
      const data = await this.repo.findSummaryById(id, fecha);
      if (!data) return { data: null, error: "Puesta a disposición no encontrada" };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async getDailyBreakdown(
    id: string,
    fechaInicio?: string | null,
    fechaFin?: string
  ): Promise<ServiceResult<PuestaDailyBreakdown[]>> {
    try {
      const data = await this.repo.findDailyBreakdown(id, fechaInicio, fechaFin);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async create(values: PuestaFormValues): Promise<ServiceResult<PuestaADisposicion>> {
    try {
      const data = await this.repo.create({
        numero_contrato: values.numero_contrato ?? null,
        customer_id: values.customer_id ?? null,
        product_id: values.product_id,
        warehouse_id: values.warehouse_id,
        cantidad_inicial: values.cantidad_inicial,
        fecha_puesta: values.fecha_puesta,
        dias_plancha: values.dias_plancha ?? 0,
        estado: values.estado ?? "abierta",
        comentarios: values.comentarios ?? null,
      });
      return { data: data as PuestaADisposicion, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async update(id: string, values: Partial<PuestaFormValues>): Promise<ServiceResult<PuestaADisposicion>> {
    try {
      const data = await this.repo.update(id, {
        numero_contrato: values.numero_contrato ?? null,
        customer_id: values.customer_id ?? null,
        product_id: values.product_id,
        warehouse_id: values.warehouse_id,
        cantidad_inicial: values.cantidad_inicial,
        fecha_puesta: values.fecha_puesta,
        dias_plancha: values.dias_plancha,
        estado: values.estado,
        comentarios: values.comentarios ?? null,
      });
      return { data: data as PuestaADisposicion, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async updateEstado(
    id: string,
    estado: "abierta" | "finalizada" | "cerrada_manual"
  ): Promise<ServiceResult<PuestaADisposicion>> {
    try {
      const data = await this.repo.updateEstado(id, estado);
      return { data: data as PuestaADisposicion, error: null };
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
        return { data: null, error: "No se puede eliminar: la puesta tiene salidas asociadas" };
      }
      return { data: null, error: msg };
    }
  }

  // ── Salidas Parciales ────────────────────────────────────

  async getSalidasByPuesta(puestaId: string): Promise<ServiceResult<SalidaParcial[]>> {
    try {
      const data = await this.salidasRepo.findByPuesta(puestaId);
      return { data: data as SalidaParcial[], error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async createSalida(values: SalidaParcialFormValues): Promise<ServiceResult<SalidaParcial>> {
    try {
      // Validate that quantity doesn't exceed pending
      const summary = await this.repo.findSummaryById(values.puesta_id);
      if (summary) {
        if (values.cantidad > summary.cantidad_pendiente) {
          return {
            data: null,
            error: `La cantidad (${values.cantidad}) supera la pendiente (${summary.cantidad_pendiente} ${summary.unit})`,
          };
        }
      }

      const data = await this.salidasRepo.create({
        puesta_id: values.puesta_id,
        fecha_salida: values.fecha_salida,
        n_camion: values.n_camion ?? null,
        matricula: values.matricula ?? null,
        cantidad: values.cantidad,
        comentarios: values.comentarios ?? null,
      });

      // Auto-finalizar si cantidad_pendiente llega a 0
      if (summary && values.cantidad >= summary.cantidad_pendiente) {
        await this.repo.updateEstado(values.puesta_id, "finalizada");
      }

      return { data: data as SalidaParcial, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async updateSalida(
    id: string,
    values: Partial<SalidaParcialFormValues>
  ): Promise<ServiceResult<SalidaParcial>> {
    try {
      const data = await this.salidasRepo.update(id, {
        fecha_salida: values.fecha_salida,
        n_camion: values.n_camion ?? null,
        matricula: values.matricula ?? null,
        cantidad: values.cantidad,
        comentarios: values.comentarios ?? null,
      });
      return { data: data as SalidaParcial, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }

  async deleteSalida(id: string): Promise<ServiceResult<void>> {
    try {
      await this.salidasRepo.delete(id);
      return { data: undefined, error: null };
    } catch (err) {
      return { data: null, error: (err as Error).message };
    }
  }
}
