/**
 * Reglas para mover una retirada (salida parcial real) de una puesta a
 * disposición a otra. Lógica pura, sin base de datos: la acción de servidor
 * (app/(dashboard)/puestas/mover-retirada.actions.ts) carga los datos, llama
 * aquí y solo escribe si no hay ningún bloqueo.
 *
 * Por qué es seguro con estas reglas:
 *  · Solo entre puestas del MISMO cliente, producto y almacén. El coste
 *    global (`storage_costs`) va por almacén+producto, así que el stock total
 *    no cambia: solo pueden moverse las fechas en que la mercancía sale del
 *    stock, y eso lo reconcilia `sincronizarPuestaStock` en las dos puestas.
 *  · Pendientes, retirados y el coste por puesta no se guardan: se derivan en
 *    vivo de las salidas parciales, así que se corrigen solos.
 *
 * Lo que se bloquea es justo lo que NO tiene reconciliación automática.
 */

export interface RetiradaMovible {
  id: string;
  puesta_id: string;
  tipo: string;
  cantidad: number;
  fecha_salida: string;
}

export interface PuestaMovible {
  id: string;
  estado: string;
  customer_id: string | null;
  product_id: string;
  warehouse_id: string;
  fecha_puesta: string;
  /** Pendiente actual (inicial − reales − desaplicaciones), ya redondeado. */
  pendiente: number;
  /** Meses "YYYY-MM" marcados como facturados en esta puesta. */
  mesesFacturados: string[];
}

/** Tolerancia al comparar cantidades en decimal(12,3). */
const EPSILON = 0.0005;

/** Un mes facturado igual o posterior al de la retirada se vería alterado. */
function mesFacturadoAfectado(meses: string[], fecha: string): string | null {
  const mesRetirada = fecha.slice(0, 7);
  return meses.filter((m) => m >= mesRetirada).sort()[0] ?? null;
}

/**
 * ¿Se puede mover esta retirada a CUALQUIER otra puesta? Devuelve el motivo
 * si no, o null si sí. No depende del destino.
 */
export function motivoRetiradaNoMovible(
  retirada: RetiradaMovible,
  origen: PuestaMovible,
  origenTieneRebase: boolean
): string | null {
  if (retirada.tipo !== "real") {
    return "Solo se pueden cambiar de puesta las retiradas de camión (no las desaplicaciones ni la auto-salida de plancha).";
  }
  if (retirada.cantidad <= 0) {
    return "Las devoluciones (cantidad negativa) no se pueden cambiar de puesta.";
  }
  if (origenTieneRebase) {
    return "La puesta tiene un rebase (retirada por encima de lo pendiente) que no está vinculado a ninguna retirada concreta; cambiar retiradas de puesta lo dejaría descuadrado.";
  }
  const mes = mesFacturadoAfectado(origen.mesesFacturados, retirada.fecha_salida);
  if (mes) {
    return `La puesta tiene facturado el mes ${mes}: cambiar la retirada alteraría un importe ya facturado.`;
  }
  return null;
}

/**
 * ¿Es esta puesta un destino válido para la retirada? Devuelve el motivo si
 * no, o null si sí. Se asume que la retirada ya es movible.
 */
export function motivoDestinoNoValido(
  retirada: RetiradaMovible,
  origen: PuestaMovible,
  destino: PuestaMovible
): string | null {
  if (destino.id === origen.id) return "Es la misma puesta.";
  if (
    destino.customer_id !== origen.customer_id ||
    destino.product_id !== origen.product_id ||
    destino.warehouse_id !== origen.warehouse_id
  ) {
    return "Debe ser del mismo cliente, producto y almacén.";
  }
  if (destino.estado !== "abierta") return "La puesta destino no está abierta.";
  if (retirada.fecha_salida < destino.fecha_puesta) {
    return "La retirada es anterior a la fecha de esta puesta.";
  }
  if (retirada.cantidad > destino.pendiente + EPSILON) {
    return "No tiene pendiente suficiente para esta retirada.";
  }
  const mes = mesFacturadoAfectado(destino.mesesFacturados, retirada.fecha_salida);
  if (mes) return `Tiene facturado el mes ${mes}.`;
  return null;
}
