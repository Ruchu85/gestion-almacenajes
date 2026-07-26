/**
 * Lógica de la salida automática de fin de plancha.
 *
 * Los "días de plancha" son los días que la mercancía puede estar en el
 * almacén sin generar coste. Al vencer, lo que siga pendiente se considera
 * entregado al cliente y se registra una salida automática (`tipo = 'plancha'`)
 * con su movimiento de stock, de modo que deje de contar como stock del
 * almacén. A partir de ahí el coste lo soporta el cliente y aparece en el
 * desglose diario de la puesta.
 *
 * Este módulo NO toca la base de datos: decide qué debería existir. La
 * orquestación (leer, escribir y recalcular costes) vive en las server actions.
 */

/** Salida parcial mínima necesaria para decidir sobre la plancha. */
export interface SalidaParcialRef {
  id: string;
  /** 'real' | 'plancha' | 'desaplicacion' */
  tipo: string;
  fecha_salida: string;
  cantidad: number;
}

/** Suma días naturales a una fecha ISO (YYYY-MM-DD) sin líos de zona horaria. */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}

/** Fecha en la que vence el período de plancha de una puesta. */
export function calcFechaFinPlancha(fechaPuesta: string, diasPlancha: number): string {
  return addDays(fechaPuesta, Number(diasPlancha) || 0);
}

/** La menor de varias fechas ISO, ignorando las vacías. */
export function minDate(...dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter((d): d is string => !!d);
  if (valid.length === 0) return null;
  return valid.reduce((min, d) => (d < min ? d : min));
}

/** Redondeo a 3 decimales — la precisión de las cantidades en base de datos. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export type PlanchaMotivo =
  /** La plancha aún no ha vencido: la auto-salida todavía no toca. */
  | "en_plancha"
  /** Al vencer la plancha ya no quedaba nada pendiente. */
  | "sin_pendiente"
  /** Queda mercancía pendiente al vencer la plancha. */
  | "pendiente";

export interface PlanchaPlan {
  /** Fecha de fin de plancha con los datos actuales de la puesta. */
  fechaFin: string;
  /** Auto-salida que debería existir hoy. Null si no procede. */
  autoSalida: { fecha: string; cantidad: number } | null;
  motivo: PlanchaMotivo;
}

/**
 * Decide si a día de hoy debe existir una auto-salida de fin de plancha y de
 * cuánto.
 *
 * La cantidad es lo que quedaba pendiente EN la fecha de fin de plancha, es
 * decir descontando solo las salidas reales hasta esa fecha inclusive. Las
 * retiradas posteriores no cuentan: ocurrieron cuando la mercancía ya estaba a
 * cargo del cliente.
 */
export function planPlanchaAutoExit(input: {
  fechaPuesta: string;
  diasPlancha: number;
  cantidadInicial: number;
  salidas: SalidaParcialRef[];
  hoy: string;
}): PlanchaPlan {
  const fechaFin = calcFechaFinPlancha(input.fechaPuesta, input.diasPlancha);

  // La auto-salida se genera cuando la plancha ya ha vencido, nunca antes.
  if (input.hoy <= fechaFin) {
    return { fechaFin, autoSalida: null, motivo: "en_plancha" };
  }

  const retiradoEnPlancha = input.salidas
    .filter((s) => s.tipo === "real" && s.fecha_salida <= fechaFin)
    .reduce((sum, s) => sum + Number(s.cantidad), 0);

  const pendiente = round3(Number(input.cantidadInicial) - retiradoEnPlancha);
  if (pendiente <= 0) {
    return { fechaFin, autoSalida: null, motivo: "sin_pendiente" };
  }

  return {
    fechaFin,
    autoSalida: { fecha: fechaFin, cantidad: pendiente },
    motivo: "pendiente",
  };
}

export type PlanchaAccion =
  | { tipo: "crear"; fecha: string; cantidad: number }
  | {
      tipo: "actualizar";
      salidaId: string;
      fecha: string;
      cantidad: number;
      fechaAnterior: string;
    }
  | { tipo: "eliminar"; salidaId: string; fechaAnterior: string }
  | { tipo: "sin_cambios" };

/** Tolerancia al comparar cantidades en decimal(12,3). */
const EPSILON = 0.0005;

/**
 * Compara la auto-salida que debería existir con la que hay registrada y
 * devuelve la operación necesaria para dejarlas iguales.
 */
export function diffPlanchaAutoExit(
  plan: PlanchaPlan,
  actual: SalidaParcialRef | null
): PlanchaAccion {
  if (!plan.autoSalida) {
    return actual
      ? { tipo: "eliminar", salidaId: actual.id, fechaAnterior: actual.fecha_salida }
      : { tipo: "sin_cambios" };
  }

  if (!actual) {
    return { tipo: "crear", fecha: plan.autoSalida.fecha, cantidad: plan.autoSalida.cantidad };
  }

  const mismaFecha = actual.fecha_salida === plan.autoSalida.fecha;
  const mismaCantidad =
    Math.abs(Number(actual.cantidad) - plan.autoSalida.cantidad) < EPSILON;
  if (mismaFecha && mismaCantidad) return { tipo: "sin_cambios" };

  return {
    tipo: "actualizar",
    salidaId: actual.id,
    fecha: plan.autoSalida.fecha,
    cantidad: plan.autoSalida.cantidad,
    fechaAnterior: actual.fecha_salida,
  };
}

/**
 * Primera fecha cuyo coste de almacenaje puede haber cambiado tras aplicar una
 * acción sobre la plancha. Los costes se recalculan desde ahí hasta hoy.
 *
 * Se toma la más antigua entre el fin de plancha anterior y el nuevo, porque
 * mover la plancha altera el stock desde el más temprano de los dos.
 */
export function fechaDesdeLaQueRecalcular(
  accion: PlanchaAccion,
  fechaFinAnterior: string | null,
  fechaFinNueva: string
): string | null {
  switch (accion.tipo) {
    case "crear":
      return minDate(fechaFinAnterior, accion.fecha);
    case "actualizar":
      return minDate(fechaFinAnterior, accion.fechaAnterior, accion.fecha);
    case "eliminar":
      return minDate(fechaFinAnterior, accion.fechaAnterior, fechaFinNueva);
    case "sin_cambios":
      return fechaFinAnterior && fechaFinAnterior !== fechaFinNueva
        ? minDate(fechaFinAnterior, fechaFinNueva)
        : null;
  }
}
