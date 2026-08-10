import { differenceInDays, isAfter, parseISO } from "date-fns";
import type { InboundMovement, OutboundMovement } from "@/types";

// ============================================================
// LÓGICA DE NEGOCIO: Cálculo de costes de almacenaje
// Regla principal: los días de plancha (free_days) NO generan coste.
// El coste empieza el día siguiente al fin del período gratuito.
// ============================================================

export interface StorageCostCalculation {
  pendingQuantity: number;
  dailyPrice: number;
  totalDailyCost: number;
  costStartDate: Date;
  daysInStorage: number;
  totalAccumulatedCost: number;
}

/**
 * Corte de la migración 017: las entradas/puestas creadas a partir de esta
 * fecha cuentan los días de plancha desde el propio día de la entrada
 * (incluido); las anteriores mantienen el cálculo de siempre para no alterar
 * nada retroactivamente. Debe coincidir exactamente con el literal usado en
 * `calculate_storage_costs_for_date` (supabase/migrations/017_*.sql).
 */
export const DIAS_PLANCHA_CUTOFF = new Date("2026-08-10T00:00:00+02:00");

/**
 * Calcula la fecha en que empieza a generar costes un movimiento de entrada.
 *
 * Desde el corte [[DIAS_PLANCHA_CUTOFF]], los días de plancha se cuentan
 * desde el día de la entrada (incluido): con free_days = N, el día de la
 * entrada es el día 1 de plancha, el último día franco es
 * movement_date + (N - 1) y el coste empieza el día siguiente: movement_date + N.
 *
 * Para entradas creadas antes del corte se mantiene la fórmula anterior
 * (movement_date + N + 1), igual que ya está persistido en la base de datos.
 *
 * `createdAt` es la fecha de creación real del registro; si se omite (p.ej.
 * al previsualizar una entrada que aún no existe) se asume que se crea ahora,
 * es decir, después del corte.
 */
export function getCostStartDate(
  movementDate: string | Date,
  freeDays: number,
  createdAt?: string | Date | null
): Date {
  const date =
    typeof movementDate === "string" ? parseISO(movementDate) : movementDate;
  const created = createdAt
    ? typeof createdAt === "string"
      ? parseISO(createdAt)
      : createdAt
    : null;
  const usesNewRule = !created || !isAfter(DIAS_PLANCHA_CUTOFF, created);
  const result = new Date(date);
  result.setDate(result.getDate() + freeDays + (usesNewRule ? 0 : 1));
  return result;
}

/**
 * Indica si un movimiento de entrada ha empezado a generar costes en una fecha dada.
 */
export function isMovementActiveForCosts(
  movementDate: string | Date,
  freeDays: number,
  targetDate: Date = new Date(),
  createdAt?: string | Date | null
): boolean {
  const costStart = getCostStartDate(movementDate, freeDays, createdAt);
  return !isAfter(costStart, targetDate);
}

/**
 * Calcula la cantidad pendiente (stock activo que genera coste) para
 * una combinación almacén/producto en una fecha dada.
 */
export function calculatePendingQuantity(
  inboundMovements: Pick<
    InboundMovement,
    "quantity" | "movement_date" | "free_days" | "created_at"
  >[],
  outboundMovements: Pick<OutboundMovement, "quantity" | "movement_date">[],
  targetDate: Date = new Date()
): number {
  const activeInbound = inboundMovements
    .filter((m) =>
      isMovementActiveForCosts(m.movement_date, m.free_days, targetDate, m.created_at)
    )
    .reduce((acc, m) => acc + Number(m.quantity), 0);

  const totalOutbound = outboundMovements
    .filter((m) => !isAfter(parseISO(m.movement_date), targetDate))
    .reduce((acc, m) => acc + Number(m.quantity), 0);

  return Math.max(0, activeInbound - totalOutbound);
}

/**
 * Calcula el coste diario de almacenaje.
 * coste_diario = cantidad_pendiente * precio_almacenaje_diario
 */
export function calculateDailyCost(
  pendingQuantity: number,
  storageDailyPrice: number
): number {
  return Math.max(0, pendingQuantity * storageDailyPrice);
}

/**
 * Calcula el coste acumulado de almacenaje para un movimiento de entrada
 * desde su fecha de inicio de costes hasta hoy (o targetDate).
 */
export function calculateAccumulatedCost(
  movementDate: string | Date,
  freeDays: number,
  quantity: number,
  storageDailyPrice: number,
  targetDate: Date = new Date()
): number {
  const costStart = getCostStartDate(movementDate, freeDays);

  if (isAfter(costStart, targetDate)) {
    return 0;
  }

  const daysCharged = differenceInDays(targetDate, costStart) + 1;
  return daysCharged * quantity * storageDailyPrice;
}

/**
 * Calcula días en almacenaje desde la fecha de entrada hasta hoy.
 */
export function getDaysInStorage(
  movementDate: string | Date,
  targetDate: Date = new Date()
): number {
  const date =
    typeof movementDate === "string" ? parseISO(movementDate) : movementDate;
  return Math.max(0, differenceInDays(targetDate, date));
}

/**
 * Calcula días restantes de plancha desde hoy.
 */
export function getRemainingFreeDays(
  movementDate: string | Date,
  freeDays: number,
  targetDate: Date = new Date()
): number {
  const date =
    typeof movementDate === "string" ? parseISO(movementDate) : movementDate;
  const daysElapsed = differenceInDays(targetDate, date);
  return Math.max(0, freeDays - daysElapsed);
}

/**
 * Redondea una cantidad a la precisión con la que se guarda en BD
 * (DECIMAL(12,3)). Las restas encadenadas de cantidades (p.ej.
 * cantidad_inicial - salidas) se hacen en JS con números de coma flotante,
 * que no representan exactamente decimales como 23,30 o 3,78: el resultado
 * puede quedar en algo como 2,9199999999999999 en vez de 2,92. Sin este
 * redondeo, ese ruido de coma flotante hace que comparaciones "≤ máximo"
 * rechacen el propio valor que se muestra en pantalla como máximo.
 */
export function roundQty(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
