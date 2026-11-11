/**
 * Reparto del stock físico de un almacén/producto entre "a disposición"
 * (comprometido con clientes, dentro de plancha) e "invendido".
 *
 *   invendida(día) = stock físico(día) − a disposición(día)
 *
 * - Stock físico = entradas − salidas con fecha ≤ día (todas las salidas de
 *   stock: directas, retiradas en plancha, auto-salidas de fin de plancha y
 *   rebases).
 * - A disposición = pendiente, ese día, de cada puesta cuyo período de
 *   plancha incluye el día (`fecha_puesta ≤ día ≤ fecha_fin_plancha`) Y cuya
 *   mercancía todavía no ha salido del stock con la auto-salida de plancha.
 *   Pendiente = inicial − retiradas reales − desaplicaciones con fecha ≤ día.
 *   Las salidas de tipo 'plancha' NO restan del pendiente: son el traspaso
 *   contable, y esa mercancía ya sale del stock físico por su propio
 *   movimiento.
 *
 *   Por qué se exige lo último: la auto-salida se fecha EL ÚLTIMO día de
 *   plancha, que sigue siendo "dentro de plancha". Ese día el stock físico ya
 *   ha bajado, así que contar además la puesta como "a disposición" restaba la
 *   misma mercancía dos veces (la invendida se hundía un día y al siguiente
 *   volvía). La puesta deja de contar justo cuando su salida entra en el stock.
 *
 * SIN topes a propósito (decisión del usuario, 11/11/2026): si una puesta
 * supera el stock, o el stock queda en negativo, la invendida sale negativa
 * para que el descuadre se vea. El coste de almacenaje es otra cosa y nunca
 * baja de 0 (lo garantiza la función SQL con GREATEST(0, …)).
 *
 * Lo usan el calendario de la ficha almacén/producto (día a día) y el
 * dashboard (hoy), para que las dos pantallas den siempre la misma cifra.
 */
import { roundQty } from "@/utils/calculations";

export interface PuestaParaReparto {
  fecha_puesta: string;
  /** Columna generada en la BD; último día franco. Única fuente de verdad. */
  fecha_fin_plancha: string;
  cantidad_inicial: number | string;
  salidas_parciales:
    | { cantidad: number | string; tipo: string; fecha_salida: string }[]
    | null;
}

/** Puesta preparada: retiradas acumuladas por fecha para consultas rápidas. */
export interface PuestaReparto {
  fecha_puesta: string;
  fecha_fin_plancha: string;
  cantidad_inicial: number;
  retiradas: { fecha: string; acumulado: number }[];
  /**
   * Fecha de la auto-salida de fin de plancha, si ya existe. Desde ese día la
   * mercancía pendiente ya no está en el stock del almacén (la sacó la
   * auto-salida), así que deja de contar como "a disposición".
   */
  traspasadaDesde: string | null;
}

export function prepararPuestas(puestas: PuestaParaReparto[]): PuestaReparto[] {
  return puestas.map((p) => {
    const ordenadas = (p.salidas_parciales ?? [])
      .filter((s) => s.tipo === "real" || s.tipo === "desaplicacion")
      .sort((a, b) => a.fecha_salida.localeCompare(b.fecha_salida));
    let acumulado = 0;
    const retiradas = ordenadas.map((s) => {
      acumulado += Number(s.cantidad);
      return { fecha: s.fecha_salida, acumulado };
    });
    const fechasPlancha = (p.salidas_parciales ?? [])
      .filter((s) => s.tipo === "plancha")
      .map((s) => s.fecha_salida)
      .sort();
    return {
      fecha_puesta: p.fecha_puesta,
      fecha_fin_plancha: p.fecha_fin_plancha,
      cantidad_inicial: Number(p.cantidad_inicial),
      retiradas,
      traspasadaDesde: fechasPlancha[0] ?? null,
    };
  });
}

/** Retirado de una puesta hasta el cierre del día `dateStr` (incluido). */
function retiradoHasta(puesta: PuestaReparto, dateStr: string): number {
  // Desde el final: lo normal es preguntar por días recientes.
  for (let i = puesta.retiradas.length - 1; i >= 0; i--) {
    if (puesta.retiradas[i].fecha <= dateStr) return puesta.retiradas[i].acumulado;
  }
  return 0;
}

/** Cantidad a disposición de clientes, en plancha y sin retirar, ese día. */
export function aDisposicionEn(puestas: PuestaReparto[], dateStr: string): number {
  let total = 0;
  for (const p of puestas) {
    // Fuera del período de plancha no cuenta: antes la puesta no existía y
    // después la mercancía ya se traspasó al cliente (salió del stock).
    if (dateStr < p.fecha_puesta || dateStr > p.fecha_fin_plancha) continue;
    // Su auto-salida ya sacó la mercancía del stock: contarla aquí la restaría
    // dos veces (ver la cabecera del archivo).
    if (p.traspasadaDesde && dateStr >= p.traspasadaDesde) continue;
    const pendiente = p.cantidad_inicial - retiradoHasta(p, dateStr);
    if (pendiente > 0) total += pendiente;
  }
  return roundQty(total);
}

/** Invendida = stock físico − a disposición. Puede ser negativa. */
export function invendidaDe(stockFisico: number, aDisposicion: number): number {
  return roundQty(stockFisico - aDisposicion);
}
