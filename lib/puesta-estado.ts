import type { SupabaseClient } from "@supabase/supabase-js";
import { roundQty } from "@/utils/calculations";

/**
 * Auto-finalización de puestas a disposición agotadas.
 *
 * Una puesta `abierta` cuyo pendiente (cantidad inicial − retiradas reales −
 * desaplicaciones) es 0 debe pasar a `finalizada`. Antes esa decisión se tomaba
 * en cada flujo con `realTotal + cantidad >= cantidad_inicial` sobre números de
 * coma flotante: 239,99999999999997 >= 240 es falso, así que muchas puestas
 * agotadas se quedaban `abierta` con "0,00 TNS" pendientes (10 en producción el
 * 07/10/2026). Aquí el pendiente se lee de la BD y se redondea con roundQty (la
 * precisión de la columna, DECIMAL(12,3)) antes de comparar.
 *
 * Solo transiciona `abierta → finalizada`: nunca pisa `cerrada_manual` ni
 * `traspasada`, que son decisiones del usuario.
 *
 * Las salidas de tipo `plancha` NO restan: son el traspaso contable de fin de
 * plancha, no una retirada del cliente (ver [[project-plancha-stock]]).
 */

type SalidaRef = { cantidad: number | string; tipo: string };
type PuestaRow = {
  id: string;
  estado: string;
  cantidad_inicial: number | string;
  salidas_parciales: SalidaRef[] | null;
};

export function pendienteDePuesta(cantidadInicial: number | string, salidas: SalidaRef[] | null): number {
  const consumido = (salidas ?? [])
    .filter((s) => s.tipo === "real" || s.tipo === "desaplicacion")
    .reduce((sum, s) => sum + Number(s.cantidad), 0);
  return roundQty(Number(cantidadInicial) - consumido);
}

/** Finaliza UNA puesta si está abierta y agotada. Devuelve true si la finalizó. */
export async function autoFinalizarPuestaSiAgotada(
  supabase: SupabaseClient,
  puestaId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("puestas_a_disposicion")
    .select("id, estado, cantidad_inicial, salidas_parciales(cantidad, tipo)")
    .eq("id", puestaId)
    .single();

  const puesta = data as PuestaRow | null;
  if (!puesta || puesta.estado !== "abierta") return false;
  if (pendienteDePuesta(puesta.cantidad_inicial, puesta.salidas_parciales) > 0) return false;

  const { error } = await supabase
    .from("puestas_a_disposicion")
    .update({ estado: "finalizada" })
    .eq("id", puestaId)
    .eq("estado", "abierta");
  return !error;
}

/**
 * Red de seguridad para el cron: finaliza todas las abiertas agotadas, vengan
 * de donde vengan (importaciones, ediciones o borrados de retiradas...).
 * Devuelve cuántas finalizó.
 */
export async function autoFinalizarPuestasAgotadas(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from("puestas_a_disposicion")
    .select("id, estado, cantidad_inicial, salidas_parciales(cantidad, tipo)")
    .eq("estado", "abierta");
  if (error || !data) return 0;

  const agotadas = (data as PuestaRow[])
    .filter((p) => pendienteDePuesta(p.cantidad_inicial, p.salidas_parciales) <= 0)
    .map((p) => p.id);
  if (agotadas.length === 0) return 0;

  const { error: updError } = await supabase
    .from("puestas_a_disposicion")
    .update({ estado: "finalizada" })
    .in("id", agotadas)
    .eq("estado", "abierta");
  return updError ? 0 : agotadas.length;
}
