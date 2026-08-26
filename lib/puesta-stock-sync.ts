import type { createServiceClient } from "@/lib/supabase/server";
import { recalcStorageCostsFrom } from "@/lib/storage-costs";
import {
  diffPlanchaAutoExit,
  minDate,
  planPlanchaAutoExit,
  type PlanchaAccion,
  type SalidaParcialRef,
} from "@/services/puestas-plancha.service";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * Reconciliación del stock de almacén que genera una puesta a disposición.
 *
 * Una puesta produce movimientos de salida de stock (`outbound_movements`) por
 * dos vías:
 *
 *  1. Cada retirada real ocurrida DENTRO del período de plancha: la mercancía
 *     sale físicamente del almacén mientras aún era stock propio.
 *  2. La auto-salida de fin de plancha: al vencer la plancha, lo que quede
 *     pendiente pasa a estar a cargo del cliente y deja de ser stock del
 *     almacén.
 *
 * Las retiradas POSTERIORES al fin de plancha no generan movimiento: esa
 * mercancía ya salió del stock con la auto-salida.
 *
 * De ahí que mover la plancha lo cambie todo: una retirada que estaba dentro
 * puede quedar fuera (y su movimiento sobra) o al revés (y falta), además de
 * cambiar la fecha y la cantidad de la propia auto-salida. Por eso no se
 * parchea movimiento a movimiento: se calcula el conjunto completo de
 * movimientos que DEBERÍA existir y se ajusta la base de datos a él.
 *
 * El vínculo `outbound_movements.salida_parcial_id` es lo que hace esto
 * posible: identifica sin ambigüedad el movimiento que refleja cada salida
 * parcial. Los movimientos de rebase (mercancía retirada de más) llevan solo
 * `puesta_id` y quedan fuera de la reconciliación, porque no son el reflejo de
 * ninguna salida parcial.
 */

interface PuestaRow {
  id: string;
  /** Columna generada en la BD: última fecha del período de plancha. */
  fecha_fin_plancha: string;
  cantidad_inicial: number;
  warehouse_id: string;
  product_id: string;
  customer_id: string | null;
  numero_contrato: string | null;
}

interface OutboundRow {
  id: string;
  salida_parcial_id: string | null;
  movement_date: string;
  quantity: number;
}

export interface SyncResult {
  error?: string;
  /** Operación aplicada sobre la auto-salida de fin de plancha. */
  accionPlancha: PlanchaAccion["tipo"];
  /** Movimientos de stock creados, actualizados y eliminados. */
  movimientos: { creados: number; actualizados: number; eliminados: number };
  /** Fecha desde la que se han recalculado los costes (null si no hizo falta). */
  recalculadoDesde: string | null;
}

const EMPTY_RESULT: SyncResult = {
  accionPlancha: "sin_cambios",
  movimientos: { creados: 0, actualizados: 0, eliminados: 0 },
  recalculadoDesde: null,
};

/** Tolerancia al comparar cantidades en decimal(12,3). */
const EPSILON = 0.0005;

function hoy(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Ajusta las salidas parciales y los movimientos de stock de una puesta a lo
 * que corresponde según sus datos actuales, y recalcula los costes de
 * almacenaje afectados.
 *
 * @param fechaFinPlanchaAnterior Fin de plancha antes del cambio, cuando se
 *   llama tras editar la puesta. Amplía hacia atrás el rango de recálculo para
 *   que los días que dejan de estar en plancha (o pasan a estarlo) se
 *   recalculen también.
 */
export async function sincronizarPuestaStock(
  supabase: ServiceClient,
  puestaId: string,
  userId: string | null,
  fechaFinPlanchaAnterior?: string | null
): Promise<SyncResult> {
  // ── 1. Estado actual de la puesta ────────────────────────────
  const { data: puesta, error: puestaError } = await supabase
    .from("puestas_a_disposicion")
    .select(
      "id, fecha_fin_plancha, cantidad_inicial, warehouse_id, product_id, customer_id, numero_contrato, salidas_parciales(id, tipo, fecha_salida, cantidad)"
    )
    .eq("id", puestaId)
    .single();

  if (puestaError || !puesta) {
    return { ...EMPTY_RESULT, error: puestaError?.message ?? "Puesta no encontrada" };
  }

  const row = puesta as unknown as PuestaRow & { salidas_parciales: SalidaParcialRef[] };
  const salidas = (row.salidas_parciales ?? []).map((s) => ({
    ...s,
    cantidad: Number(s.cantidad),
  }));

  /**
   * Fecha que tenía cada salida parcial ANTES de reconciliar. Permite
   * reconocer movimientos de stock antiguos (sin vínculo) que se quedaron en
   * la fecha vieja al mover la plancha.
   */
  const fechaPrevia = new Map(salidas.map((s) => [s.id, s.fecha_salida]));

  // ── 2. Qué auto-salida de plancha debería existir ────────────
  const plan = planPlanchaAutoExit({
    fechaFinPlancha: row.fecha_fin_plancha,
    cantidadInicial: Number(row.cantidad_inicial),
    salidas,
    hoy: hoy(),
  });

  const planchaActual = salidas.find((s) => s.tipo === "plancha") ?? null;
  const accion = diffPlanchaAutoExit(plan, planchaActual);

  /** Fechas cuyo coste puede haber cambiado. */
  const fechasTocadas: (string | null)[] = [fechaFinPlanchaAnterior ?? null, plan.fechaFin];

  // ── 3. Aplicar la acción sobre la salida parcial de plancha ──
  /** Salidas parciales que deben tener reflejo en el stock, ya actualizadas. */
  const salidasFinales = salidas.filter((s) => s.tipo !== "plancha");

  switch (accion.tipo) {
    case "crear": {
      const { data: creada, error } = await supabase
        .from("salidas_parciales")
        .insert({
          puesta_id: puestaId,
          fecha_salida: accion.fecha,
          cantidad: accion.cantidad,
          tipo: "plancha",
          comentarios: "Salida automática fin de plancha",
          created_by: userId,
        })
        .select("id, tipo, fecha_salida, cantidad")
        .single();
      if (error) return { ...EMPTY_RESULT, error: error.message };
      salidasFinales.push(creada as SalidaParcialRef);
      fechasTocadas.push(accion.fecha);
      break;
    }

    case "actualizar": {
      const { error } = await supabase
        .from("salidas_parciales")
        .update({ fecha_salida: accion.fecha, cantidad: accion.cantidad })
        .eq("id", accion.salidaId);
      if (error) return { ...EMPTY_RESULT, error: error.message };
      salidasFinales.push({
        id: accion.salidaId,
        tipo: "plancha",
        fecha_salida: accion.fecha,
        cantidad: accion.cantidad,
      });
      fechasTocadas.push(accion.fecha, accion.fechaAnterior);
      break;
    }

    case "eliminar": {
      // El movimiento de stock asociado cae con ella (ON DELETE CASCADE).
      const { error } = await supabase
        .from("salidas_parciales")
        .delete()
        .eq("id", accion.salidaId);
      if (error) return { ...EMPTY_RESULT, error: error.message };
      fechasTocadas.push(accion.fechaAnterior);
      break;
    }

    case "sin_cambios":
      if (planchaActual) salidasFinales.push(planchaActual);
      break;
  }

  // ── 4. Movimientos de stock que deberían existir ─────────────
  //    · la auto-salida de plancha (si procede)
  //    · cada retirada real ocurrida hasta el fin de plancha inclusive
  const deseados = new Map<string, { fecha: string; cantidad: number; esPlancha: boolean }>();
  for (const salida of salidasFinales) {
    if (salida.tipo === "plancha") {
      deseados.set(salida.id, {
        fecha: salida.fecha_salida,
        cantidad: Number(salida.cantidad),
        esPlancha: true,
      });
    } else if (
      salida.tipo === "real" &&
      // Las salidas NEGATIVAS (devoluciones) no llevan espejo: outbound_movements
      // exige quantity > 0. Su efecto en el stock se registra como una ENTRADA
      // al grabarlas, igual que hace una desaplicación.
      Number(salida.cantidad) > 0 &&
      salida.fecha_salida <= plan.fechaFin
    ) {
      deseados.set(salida.id, {
        fecha: salida.fecha_salida,
        cantidad: Number(salida.cantidad),
        esPlancha: false,
      });
    }
  }

  // ── 5. Movimientos que hay ahora ─────────────────────────────
  const idsSalidas = salidas.map((s) => s.id);
  let actuales: OutboundRow[] = [];
  if (idsSalidas.length > 0) {
    const { data, error } = await supabase
      .from("outbound_movements")
      .select("id, salida_parcial_id, movement_date, quantity")
      .in("salida_parcial_id", idsSalidas);
    if (error) return { ...EMPTY_RESULT, error: error.message };
    actuales = (data ?? []) as OutboundRow[];
  }

  const porSalida = new Map<string, OutboundRow>();
  /** Duplicados: restos de reconciliaciones antiguas, se eliminan. */
  const sobrantes: string[] = [];
  for (const mov of actuales) {
    if (!mov.salida_parcial_id) continue;
    if (porSalida.has(mov.salida_parcial_id)) sobrantes.push(mov.id);
    else porSalida.set(mov.salida_parcial_id, mov);
  }

  // ── 6. Igualar la base de datos al conjunto deseado ──────────
  let creados = 0;
  let actualizados = 0;
  let eliminados = 0;

  for (const [salidaId, deseado] of deseados) {
    const actual = porSalida.get(salidaId);

    if (!actual) {
      // Antes de crear uno nuevo, buscar un movimiento anterior a esta
      // trazabilidad que corresponda a esta misma salida: los registros
      // previos a la migración no llevan vínculo, y crear otro duplicaría la
      // salida de stock. Se busca tanto en la fecha nueva como en la que
      // tenía la salida parcial antes de ajustarla.
      const candidatas = [
        ...new Set([deseado.fecha, fechaPrevia.get(salidaId)].filter(Boolean) as string[]),
      ];
      const { data: huerfanos } = await supabase
        .from("outbound_movements")
        .select("id")
        .eq("warehouse_id", row.warehouse_id)
        .eq("product_id", row.product_id)
        .eq("from_puesta", true)
        .is("salida_parcial_id", null)
        .in("movement_date", candidatas)
        .limit(1);

      const adoptado = huerfanos?.[0];
      if (adoptado) {
        const { error } = await supabase
          .from("outbound_movements")
          .update({
            movement_date: deseado.fecha,
            quantity: deseado.cantidad,
            puesta_id: puestaId,
            salida_parcial_id: salidaId,
          })
          .eq("id", adoptado.id);
        if (error) return { ...EMPTY_RESULT, error: error.message };
        actualizados++;
        fechasTocadas.push(deseado.fecha, ...candidatas);
        continue;
      }

      const { error } = await supabase.from("outbound_movements").insert({
        warehouse_id: row.warehouse_id,
        product_id: row.product_id,
        quantity: deseado.cantidad,
        movement_date: deseado.fecha,
        free_days: 0,
        customer_id: row.customer_id ?? null,
        comments: deseado.esPlancha
          ? `Auto-salida fin de plancha${row.numero_contrato ? ` (${row.numero_contrato})` : ""}`
          : "Retirada puesta a disposición",
        from_puesta: true,
        puesta_id: puestaId,
        salida_parcial_id: salidaId,
        created_by: userId,
      });
      if (error) return { ...EMPTY_RESULT, error: error.message };
      creados++;
      fechasTocadas.push(deseado.fecha);
      continue;
    }

    const mismaFecha = actual.movement_date === deseado.fecha;
    const mismaCantidad = Math.abs(Number(actual.quantity) - deseado.cantidad) < EPSILON;
    if (mismaFecha && mismaCantidad) continue;

    const { error } = await supabase
      .from("outbound_movements")
      .update({ movement_date: deseado.fecha, quantity: deseado.cantidad })
      .eq("id", actual.id);
    if (error) return { ...EMPTY_RESULT, error: error.message };
    actualizados++;
    fechasTocadas.push(deseado.fecha, actual.movement_date);
  }

  // Movimientos vinculados a salidas que ya no deben reflejarse en el stock
  // (retiradas que han quedado fuera de plancha) y duplicados.
  for (const [salidaId, mov] of porSalida) {
    if (deseados.has(salidaId)) continue;
    sobrantes.push(mov.id);
    fechasTocadas.push(mov.movement_date);
  }

  if (sobrantes.length > 0) {
    const { error } = await supabase.from("outbound_movements").delete().in("id", sobrantes);
    if (error) return { ...EMPTY_RESULT, error: error.message };
    eliminados = sobrantes.length;
  }

  // ── 7. Recalcular costes desde la fecha más antigua afectada ─
  const hayCambios = creados + actualizados + eliminados > 0 || accion.tipo !== "sin_cambios";
  const distintaPlancha =
    !!fechaFinPlanchaAnterior && fechaFinPlanchaAnterior !== plan.fechaFin;

  let recalculadoDesde: string | null = null;
  if (hayCambios || distintaPlancha) {
    recalculadoDesde = minDate(...fechasTocadas);
    const { error } = await recalcStorageCostsFrom(supabase, recalculadoDesde);
    if (error) {
      return {
        error: `Los movimientos se ajustaron pero falló el recálculo de costes: ${error}`,
        accionPlancha: accion.tipo,
        movimientos: { creados, actualizados, eliminados },
        recalculadoDesde,
      };
    }
  }

  return {
    accionPlancha: accion.tipo,
    movimientos: { creados, actualizados, eliminados },
    recalculadoDesde,
  };
}
