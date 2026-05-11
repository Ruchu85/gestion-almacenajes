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
 * Calcula la fecha en que empieza a generar costes un movimiento de entrada.
 * La fecha de inicio es: movement_date + free_days + 1
 */
export function getCostStartDate(
  movementDate: string | Date,
  freeDays: number
): Date {
  const date =
    typeof movementDate === "string" ? parseISO(movementDate) : movementDate;
  const result = new Date(date);
  result.setDate(result.getDate() + freeDays + 1);
  return result;
}

/**
 * Indica si un movimiento de entrada ha empezado a generar costes en una fecha dada.
 */
export function isMovementActiveForCosts(
  movementDate: string | Date,
  freeDays: number,
  targetDate: Date = new Date()
): boolean {
  const costStart = getCostStartDate(movementDate, freeDays);
  return !isAfter(costStart, targetDate);
}

/**
 * Calcula la cantidad pendiente (stock activo que genera coste) para
 * una combinación almacén/producto en una fecha dada.
 */
export function calculatePendingQuantity(
  inboundMovements: Pick<
    InboundMovement,
    "quantity" | "movement_date" | "free_days"
  >[],
  outboundMovements: Pick<OutboundMovement, "quantity" | "movement_date">[],
  targetDate: Date = new Date()
): number {
  const activeInbound = inboundMovements
    .filter((m) =>
      isMovementActiveForCosts(m.movement_date, m.free_days, targetDate)
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
