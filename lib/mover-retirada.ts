/**
 * Cambiar una retirada de puesta a disposición (núcleo, sin dependencias de
 * Next para poder probarlo contra la base de datos). Lo expone la acción de
 * servidor app/(dashboard)/puestas/mover-retirada.actions.ts.
 *
 * Es nuevo y separado a propósito: no modifica `updateSalidaParcial` (la
 * edición de fecha/cantidad, ya probada), solo la complementa. Las reglas de
 * qué se puede mover viven puras en services/mover-retirada.service.ts.
 *
 * Secuencia al mover (ver el análisis en el propio servicio):
 *   1. Validar de nuevo en servidor (nunca fiarse de lo que mostró el diálogo).
 *   2. Cambiar `salidas_parciales.puesta_id` (con guarda optimista sobre el
 *      origen, por si otra pestaña la movió antes).
 *   3. Cambiar `outbound_movements.puesta_id` del movimiento de stock que
 *      refleja la retirada. Imprescindible: la reconciliación localiza ese
 *      movimiento por `salida_parcial_id`, pero su `puesta_id` debe apuntar a
 *      la puesta dueña.
 *   4. Reconciliar las DOS puestas (`sincronizarPuestaStock`): ajusta sus
 *      auto-salidas de fin de plancha, crea/borra el movimiento de stock si la
 *      retirada cambia de lado de la plancha y recalcula `storage_costs` desde
 *      la fecha más antigua afectada.
 *   5. Estados: el destino se finaliza si se agota; el origen se reabre si
 *      estaba finalizado y vuelve a tener pendiente.
 */

import type { createServiceClient } from "@/lib/supabase/server";
import { sincronizarPuestaStock } from "@/lib/puesta-stock-sync";
import {
  autoFinalizarPuestaSiAgotada,
  pendienteDePuesta,
  reabrirPuestaSiTienePendiente,
} from "@/lib/puesta-estado";
import {
  motivoDestinoNoValido,
  motivoRetiradaNoMovible,
  type PuestaMovible,
  type RetiradaMovible,
} from "@/services/mover-retirada.service";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export interface OpcionPuestaDestino {
  id: string;
  numero_contrato: string | null;
  fecha_puesta: string;
  fecha_fin_plancha: string;
  pendiente: number;
  /** null = destino válido; si no, por qué no se puede elegir. */
  motivo: string | null;
}

export interface OpcionesMoverRetirada {
  /** Si la retirada no se puede mover a ninguna puesta, el motivo. */
  bloqueo: string | null;
  actual: { id: string; numero_contrato: string | null } | null;
  opciones: OpcionPuestaDestino[];
}

const PUESTA_SELECT =
  "id, numero_contrato, estado, customer_id, product_id, warehouse_id, fecha_puesta, fecha_fin_plancha, cantidad_inicial, salidas_parciales(cantidad, tipo)";

interface PuestaRow {
  id: string;
  numero_contrato: string | null;
  estado: string;
  customer_id: string | null;
  product_id: string;
  warehouse_id: string;
  fecha_puesta: string;
  fecha_fin_plancha: string;
  cantidad_inicial: number;
  salidas_parciales: { cantidad: number; tipo: string }[] | null;
}

function toMovible(p: PuestaRow, meses: string[]): PuestaMovible {
  return {
    id: p.id,
    estado: p.estado,
    customer_id: p.customer_id,
    product_id: p.product_id,
    warehouse_id: p.warehouse_id,
    fecha_puesta: p.fecha_puesta,
    pendiente: pendienteDePuesta(p.cantidad_inicial, p.salidas_parciales),
    mesesFacturados: meses,
  };
}

async function mesesFacturados(supabase: ServiceClient, puestaIds: string[]) {
  const porPuesta = new Map<string, string[]>();
  if (puestaIds.length === 0) return porPuesta;
  const { data } = await supabase
    .from("puesta_facturacion_meses")
    .select("puesta_id, year_month")
    .in("puesta_id", puestaIds);
  for (const r of data ?? []) {
    porPuesta.set(r.puesta_id, [...(porPuesta.get(r.puesta_id) ?? []), r.year_month]);
  }
  return porPuesta;
}

/** Rebases de la puesta: salidas de stock por encima de lo pendiente. */
async function tieneRebase(supabase: ServiceClient, puestaId: string): Promise<boolean> {
  const { count } = await supabase
    .from("outbound_movements")
    .select("id", { count: "exact", head: true })
    .eq("puesta_id", puestaId)
    .eq("from_puesta", true)
    .is("salida_parcial_id", null)
    .ilike("comments", "Rebase%");
  return (count ?? 0) > 0;
}

async function cargarRetirada(supabase: ServiceClient, salidaId: string) {
  const { data } = await supabase
    .from("salidas_parciales")
    .select("id, puesta_id, tipo, cantidad, fecha_salida")
    .eq("id", salidaId)
    .single();
  if (!data) return null;
  return { ...data, cantidad: Number(data.cantidad) } as RetiradaMovible;
}

/**
 * Para el diálogo de edición: puestas a las que se puede mover la retirada.
 * Lista todas las abiertas del mismo cliente, producto y almacén; las que no
 * sirven van con su motivo para que el usuario entienda por qué.
 */
export async function obtenerOpcionesMoverRetirada(
  supabase: ServiceClient,
  salidaId: string
): Promise<OpcionesMoverRetirada> {
  const retirada = await cargarRetirada(supabase, salidaId);
  if (!retirada) return { bloqueo: "No se encontró la retirada.", actual: null, opciones: [] };

  const { data: origenData } = await supabase
    .from("puestas_a_disposicion")
    .select(PUESTA_SELECT)
    .eq("id", retirada.puesta_id)
    .single();
  const origenRow = origenData as unknown as PuestaRow | null;
  if (!origenRow) return { bloqueo: "No se encontró la puesta de la retirada.", actual: null, opciones: [] };

  const actual = { id: origenRow.id, numero_contrato: origenRow.numero_contrato };

  let candidatasQ = supabase
    .from("puestas_a_disposicion")
    .select(PUESTA_SELECT)
    .eq("estado", "abierta")
    .eq("product_id", origenRow.product_id)
    .eq("warehouse_id", origenRow.warehouse_id)
    .neq("id", origenRow.id)
    .order("fecha_puesta", { ascending: true });
  candidatasQ = origenRow.customer_id
    ? candidatasQ.eq("customer_id", origenRow.customer_id)
    : candidatasQ.is("customer_id", null);
  const { data: candData } = await candidatasQ;
  const candidatas = (candData ?? []) as unknown as PuestaRow[];

  const meses = await mesesFacturados(supabase, [origenRow.id, ...candidatas.map((c) => c.id)]);
  const origen = toMovible(origenRow, meses.get(origenRow.id) ?? []);

  const bloqueo = motivoRetiradaNoMovible(retirada, origen, await tieneRebase(supabase, origen.id));

  const opciones: OpcionPuestaDestino[] = candidatas.map((c) => {
    const destino = toMovible(c, meses.get(c.id) ?? []);
    return {
      id: c.id,
      numero_contrato: c.numero_contrato,
      fecha_puesta: c.fecha_puesta,
      fecha_fin_plancha: c.fecha_fin_plancha,
      pendiente: destino.pendiente,
      motivo: bloqueo ? bloqueo : motivoDestinoNoValido(retirada, origen, destino),
    };
  });

  return { bloqueo, actual, opciones };
}

export interface ResultadoMoverRetirada {
  error?: string;
  /** El movimiento se hizo pero algo posterior (reconciliación) falló. */
  aviso?: string;
  destino?: { id: string; numero_contrato: string | null };
}

export async function ejecutarMoverRetirada(
  supabase: ServiceClient,
  salidaId: string,
  destinoId: string,
  userId: string | null
): Promise<ResultadoMoverRetirada> {
  // ── 1. Validación en servidor ────────────────────────────────
  const retirada = await cargarRetirada(supabase, salidaId);
  if (!retirada) return { error: "No se encontró la retirada." };

  const { data: puestasData } = await supabase
    .from("puestas_a_disposicion")
    .select(PUESTA_SELECT)
    .in("id", [retirada.puesta_id, destinoId]);
  const puestas = (puestasData ?? []) as unknown as PuestaRow[];
  const origenRow = puestas.find((p) => p.id === retirada.puesta_id);
  const destinoRow = puestas.find((p) => p.id === destinoId);
  if (!origenRow || !destinoRow) return { error: "No se encontró la puesta de origen o la de destino." };

  const meses = await mesesFacturados(supabase, [origenRow.id, destinoRow.id]);
  const origen = toMovible(origenRow, meses.get(origenRow.id) ?? []);
  const destino = toMovible(destinoRow, meses.get(destinoRow.id) ?? []);

  const bloqueo =
    motivoRetiradaNoMovible(retirada, origen, await tieneRebase(supabase, origen.id)) ??
    motivoDestinoNoValido(retirada, origen, destino);
  if (bloqueo) return { error: bloqueo };

  // ── 2. Mover la salida parcial (guarda optimista sobre el origen) ──
  const { data: movida, error: moverError } = await supabase
    .from("salidas_parciales")
    .update({ puesta_id: destinoId })
    .eq("id", salidaId)
    .eq("puesta_id", origen.id)
    .select("id");
  if (moverError) return { error: moverError.message };
  if (!movida || movida.length === 0) {
    return { error: "La retirada ha cambiado mientras tanto (¿se movió desde otra pestaña?). Recarga y vuelve a intentarlo." };
  }

  // ── 3. Su movimiento de stock pasa a pertenecer al destino ───
  const { error: movError } = await supabase
    .from("outbound_movements")
    .update({ puesta_id: destinoId })
    .eq("salida_parcial_id", salidaId);

  const avisos: string[] = [];
  if (movError) avisos.push(`No se pudo actualizar el movimiento de stock: ${movError.message}`);

  // ── 4. Reconciliar las dos puestas (auto-salidas, stock y costes) ──
  const syncDestino = await sincronizarPuestaStock(supabase, destinoId, userId);
  if (syncDestino.error) avisos.push(`Puesta destino: ${syncDestino.error}`);
  const syncOrigen = await sincronizarPuestaStock(supabase, origen.id, userId);
  if (syncOrigen.error) avisos.push(`Puesta origen: ${syncOrigen.error}`);

  // ── 5. Estados ────────────────────────────────────────────────
  await autoFinalizarPuestaSiAgotada(supabase, destinoId);
  await reabrirPuestaSiTienePendiente(supabase, origen.id);

  return {
    destino: { id: destinoRow.id, numero_contrato: destinoRow.numero_contrato },
    aviso: avisos.length
      ? `La retirada se movió, pero: ${avisos.join(" · ")}. Usa "Recalcular auto-salida plancha" en ambas puestas para completarlo.`
      : undefined,
  };
}
