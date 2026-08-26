"use server";

import { createServiceClient, createClient } from "@/lib/supabase/server";
import { puestaSchema, type PuestaFormValues } from "@/validations/puesta.schema";
import { salidaParcialSchema, type SalidaParcialFormValues } from "@/validations/salida-parcial.schema";
import type { PuestaADisposicion, SalidaParcial } from "@/types";
import { redirect } from "next/navigation";
import { upsertMatricula } from "@/lib/actions/matriculas";
import { sincronizarPuestaStock } from "@/lib/puesta-stock-sync";
import { recalcStorageCostsFrom } from "@/lib/storage-costs";
import { minDate } from "@/services/puestas-plancha.service";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

// ── Puestas ──────────────────────────────────────────────────

export async function createPuesta(
  values: PuestaFormValues
): Promise<{ data?: PuestaADisposicion; error?: string }> {
  const user = await requireAuth();
  const parsed = puestaSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("puestas_a_disposicion")
    .insert({
      numero_contrato: parsed.data.numero_contrato ?? null,
      customer_id: parsed.data.customer_id ?? null,
      product_id: parsed.data.product_id,
      warehouse_id: parsed.data.warehouse_id,
      cantidad_inicial: parsed.data.cantidad_inicial,
      fecha_puesta: parsed.data.fecha_puesta,
      dias_plancha: parsed.data.dias_plancha ?? 0,
      estado: parsed.data.estado ?? "abierta",
      comentarios: parsed.data.comentarios ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data: data as PuestaADisposicion };
}

/**
 * Actualiza una puesta y deja el stock coherente con los datos nuevos.
 *
 * Cambiar la fecha de puesta, los días de plancha o la cantidad inicial mueve
 * la frontera del período de plancha, y con ella la auto-salida de fin de
 * plancha y los movimientos de stock de las retiradas que cruzan esa frontera.
 * Todo eso se reconcilia aquí y se recalculan los costes afectados, de forma
 * que el calendario de stock del almacén y el desglose diario de la puesta
 * reflejen la plancha nueva sin intervención manual.
 */
export async function updatePuesta(
  id: string,
  values: PuestaFormValues
): Promise<{ data?: PuestaADisposicion; error?: string; aviso?: string }> {
  const user = await requireAuth();
  const parsed = puestaSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();

  // Estado anterior: hace falta el fin de plancha previo para saber desde qué
  // fecha hay que recalcular los costes. Se lee la columna generada, que ya
  // aplica la regla vigente para la puesta según cuándo se creó.
  const { data: anterior } = await supabase
    .from("puestas_a_disposicion")
    .select("fecha_puesta, fecha_fin_plancha, warehouse_id, product_id")
    .eq("id", id)
    .single();

  const finPlanchaAnterior = anterior?.fecha_fin_plancha ?? null;

  const { data, error } = await supabase
    .from("puestas_a_disposicion")
    .update({
      numero_contrato: parsed.data.numero_contrato ?? null,
      customer_id: parsed.data.customer_id ?? null,
      product_id: parsed.data.product_id,
      warehouse_id: parsed.data.warehouse_id,
      cantidad_inicial: parsed.data.cantidad_inicial,
      fecha_puesta: parsed.data.fecha_puesta,
      dias_plancha: parsed.data.dias_plancha ?? 0,
      estado: parsed.data.estado ?? "abierta",
      comentarios: parsed.data.comentarios ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  const sync = await sincronizarPuestaStock(supabase, id, user.id, finPlanchaAnterior);

  // Si la puesta ha cambiado de almacén o de producto, la combinación de
  // origen también deja de tener esos movimientos: hay que recalcularla.
  const cambioUbicacion =
    !!anterior &&
    (anterior.warehouse_id !== parsed.data.warehouse_id ||
      anterior.product_id !== parsed.data.product_id);
  if (cambioUbicacion) {
    await recalcStorageCostsFrom(
      supabase,
      minDate(finPlanchaAnterior, anterior.fecha_puesta, parsed.data.fecha_puesta)
    );
  }

  // Un fallo al reconciliar no invalida la edición, que ya está guardada: se
  // devuelve como aviso para que el usuario pueda reintentarlo.
  return {
    data: data as PuestaADisposicion,
    aviso: sync.error,
  };
}

export async function deletePuesta(id: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();

  // Los movimientos de stock que generó la puesta desaparecen con sus salidas
  // parciales, así que hay que recalcular los costes desde su inicio.
  const { data: puesta } = await supabase
    .from("puestas_a_disposicion")
    .select("fecha_puesta")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("puestas_a_disposicion")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  if (puesta) await recalcStorageCostsFrom(supabase, puesta.fecha_puesta);
  return {};
}

export async function changePuestaEstado(
  id: string,
  estado: "abierta" | "finalizada" | "cerrada_manual" | "traspasada"
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("puestas_a_disposicion")
    .update({ estado })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// ── Salidas Parciales ────────────────────────────────────────

export async function createSalidaParcial(
  values: SalidaParcialFormValues,
  cantidadPendiente: number,
  forceOverflow = false
): Promise<{ data?: SalidaParcial; error?: string }> {
  const user = await requireAuth();
  const parsed = salidaParcialSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  /** Devolución/anulación de retirada: viene en negativo y devuelve pendiente. */
  const esDevolucion = parsed.data.cantidad < 0;

  // Una devolución nunca "supera lo pendiente": lo aumenta.
  if (!forceOverflow && !esDevolucion && parsed.data.cantidad > cantidadPendiente) {
    return {
      error: `La cantidad (${parsed.data.cantidad}) supera la pendiente (${cantidadPendiente})`,
    };
  }

  const supabase = await createServiceClient();

  // Fetch puesta to determine plancha period and warehouse/product context
  const { data: puesta, error: puestaError } = await supabase
    .from("puestas_a_disposicion")
    .select("fecha_fin_plancha, warehouse_id, product_id, customer_id, numero_contrato, cantidad_inicial, salidas_parciales(cantidad, tipo, fecha_salida), customer:customers(name, codigo)")
    .eq("id", parsed.data.puesta_id)
    .single();

  if (puestaError || !puesta) {
    return { error: "No se pudo cargar la puesta a disposición" };
  }

  // Create the salida_parcial
  const { data, error } = await supabase
    .from("salidas_parciales")
    .insert({
      puesta_id: parsed.data.puesta_id,
      fecha_salida: parsed.data.fecha_salida,
      n_camion: parsed.data.n_camion ?? null,
      matricula: parsed.data.matricula ?? null,
      cantidad: parsed.data.cantidad,
      tipo: "real",
      comentarios: parsed.data.comentarios ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  if (parsed.data.matricula) await upsertMatricula(parsed.data.matricula);

  // La mercancía devuelta vuelve a ser stock del almacén. Se registra como
  // ENTRADA porque outbound_movements exige quantity > 0 y el espejo de la
  // puesta deja fuera las salidas negativas a propósito. Es el mismo patrón
  // que usa una desaplicación.
  if (esDevolucion) {
    const puestaRefDev = puesta.numero_contrato || parsed.data.puesta_id.slice(0, 8).toUpperCase();
    const { error: devError } = await supabase.from("inbound_movements").insert({
      warehouse_id: puesta.warehouse_id,
      product_id: puesta.product_id,
      quantity: Math.abs(parsed.data.cantidad),
      movement_date: parsed.data.fecha_salida,
      free_days: 1,
      supplier_id: null,
      comments: `Devolución de retirada${parsed.data.matricula ? ` — matrícula ${parsed.data.matricula}` : ""} — pta. ${puestaRefDev}`,
      created_by: user.id,
    });
    if (devError) return { error: devError.message };
    await recalcStorageCostsFrom(supabase, parsed.data.fecha_salida);
  }

  const fechaFinStr = puesta.fecha_fin_plancha as string;

  // Rebase: mercancía retirada por encima de lo que quedaba pendiente. No es
  // el reflejo de ninguna salida parcial (esa ya salió del stock con la
  // auto-salida de plancha), así que va sin salida_parcial_id y queda fuera de
  // la reconciliación.
  let huboRebase = false;
  if (parsed.data.fecha_salida > fechaFinStr) {
    const rebaseQty = Math.max(0, parsed.data.cantidad - Math.max(0, cantidadPendiente));
    if (rebaseQty > 0) {
      const customerData = puesta.customer as { name: string; codigo: string | null } | null;
      const customerRef = customerData
        ? (customerData.codigo ? `[${customerData.codigo}] ${customerData.name}` : customerData.name)
        : null;
      const puestaRef = puesta.numero_contrato || parsed.data.puesta_id.slice(0, 8).toUpperCase();

      await supabase.from("outbound_movements").insert({
        warehouse_id: puesta.warehouse_id,
        product_id: puesta.product_id,
        quantity: rebaseQty,
        movement_date: parsed.data.fecha_salida,
        free_days: 0,
        customer_id: puesta.customer_id ?? null,
        comments: `Rebase${customerRef ? ` cliente ${customerRef}` : ""} pta a disposicion ${puestaRef}`,
        from_puesta: true,
        puesta_id: parsed.data.puesta_id,
        created_by: user.id,
      });
      huboRebase = true;
    }
  }

  // Reconcilia el movimiento de stock de esta retirada (solo si cae dentro de
  // plancha) y ajusta la auto-salida de fin de plancha, que ahora tiene menos
  // pendiente que absorber. Recalcula también los costes afectados.
  const sync = await sincronizarPuestaStock(supabase, parsed.data.puesta_id, user.id);
  if (huboRebase && !sync.recalculadoDesde) {
    await recalcStorageCostsFrom(supabase, parsed.data.fecha_salida);
  }

  // Auto-finalizar cuando las salidas reales cubren o superan toda la cantidad inicial
  const salidaList = (puesta.salidas_parciales ?? []) as { cantidad: number; tipo: string }[];
  const realTotal = salidaList
    .filter((s) => s.tipo === "real")
    .reduce((sum, s) => sum + Number(s.cantidad), 0);
  if (realTotal + parsed.data.cantidad >= Number(puesta.cantidad_inicial)) {
    await supabase
      .from("puestas_a_disposicion")
      .update({ estado: "finalizada" })
      .eq("id", parsed.data.puesta_id);
  } else if (esDevolucion) {
    // La devolución ha vuelto a dejar mercancía pendiente: si la puesta se
    // había dado por finalizada, hay que reabrirla para que el cliente pueda
    // retirarla y para que se sigan calculando sus almacenajes.
    await supabase
      .from("puestas_a_disposicion")
      .update({ estado: "abierta" })
      .eq("id", parsed.data.puesta_id)
      .eq("estado", "finalizada");
  }

  return { data: data as SalidaParcial };
}

export async function triggerPlanchaAutoExit(puestaId: string): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createServiceClient();
  return _runPlanchaAutoExit(supabase, puestaId, user.id);
}

/**
 * Lógica central de la auto-salida fin de plancha. Separada de la autenticación
 * para poder llamarla también desde el cron (sin contexto de usuario).
 *
 * Delega en la reconciliación completa: es idempotente, así que sirve tanto
 * para generar la auto-salida por primera vez como para corregirla si los
 * datos de la puesta han cambiado desde entonces.
 */
async function _runPlanchaAutoExit(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  puestaId: string,
  userId: string | null
): Promise<{ error?: string }> {
  const result = await sincronizarPuestaStock(supabase, puestaId, userId);
  return result.error ? { error: result.error } : {};
}

/**
 * Rehace la auto-salida de fin de plancha y los movimientos de stock de la
 * puesta a partir de sus datos actuales. Es el botón "Recalcular plancha" de
 * la ficha, y también se usa después de cualquier cambio que altere el
 * pendiente al vencer la plancha.
 */
export async function recalcularPlanchaAutoExit(
  puestaId: string
): Promise<{ action?: "deleted" | "updated" | "created" | "unchanged"; error?: string }> {
  const user = await requireAuth();
  const supabase = await createServiceClient();

  const result = await sincronizarPuestaStock(supabase, puestaId, user.id);
  if (result.error) return { error: result.error };

  const acciones = {
    eliminar: "deleted",
    actualizar: "updated",
    crear: "created",
    sin_cambios: "unchanged",
  } as const;

  // Aunque la auto-salida no cambie, la reconciliación puede haber ajustado
  // movimientos de stock de retiradas que cruzaban el fin de plancha.
  const { creados, actualizados, eliminados } = result.movimientos;
  if (result.accionPlancha === "sin_cambios" && creados + actualizados + eliminados > 0) {
    return { action: "updated" };
  }

  return { action: acciones[result.accionPlancha] };
}

export async function updateSalidaParcial(
  id: string,
  values: SalidaParcialFormValues
): Promise<{ data?: SalidaParcial; error?: string; aviso?: string }> {
  const user = await requireAuth();
  const parsed = salidaParcialSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("salidas_parciales")
    .update({
      fecha_salida: parsed.data.fecha_salida,
      n_camion: parsed.data.n_camion ?? null,
      matricula: parsed.data.matricula ?? null,
      cantidad: parsed.data.cantidad,
      comentarios: parsed.data.comentarios ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  if (parsed.data.matricula) await upsertMatricula(parsed.data.matricula);

  // Cambiar fecha o cantidad de una retirada mueve su movimiento de stock y
  // altera lo que quedaba pendiente al vencer la plancha.
  const sync = await sincronizarPuestaStock(supabase, parsed.data.puesta_id, user.id);

  return { data: data as SalidaParcial, aviso: sync.error };
}

export async function updatePuestaComentarios(
  id: string,
  comentarios: string | null
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("puestas_a_disposicion")
    .update({ comentarios })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteSalidaParcial(id: string): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createServiceClient();

  // La puesta hay que leerla antes: después del borrado ya no hay forma de
  // saber a cuál pertenecía para reconciliarla.
  const { data: salida } = await supabase
    .from("salidas_parciales")
    .select("puesta_id")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("salidas_parciales")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  // El movimiento de stock asociado cae con ella (ON DELETE CASCADE); la
  // reconciliación rehace la auto-salida de plancha, que ahora tiene más
  // pendiente que absorber, y recalcula los costes.
  if (salida?.puesta_id) {
    await sincronizarPuestaStock(supabase, salida.puesta_id, user.id);
  }
  return {};
}

// ── Desaplicaciones ──────────────────────────────────────────

export async function createDesaplicacion(
  puestaId: string,
  cantidad: number
): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createServiceClient();

  const { data: puesta, error: puestaError } = await supabase
    .from("puestas_a_disposicion")
    .select("fecha_fin_plancha, warehouse_id, product_id, numero_contrato, cantidad_inicial, salidas_parciales(cantidad, tipo)")
    .eq("id", puestaId)
    .single();

  if (puestaError || !puesta) {
    return { error: "No se pudo cargar la puesta a disposición" };
  }

  const today = new Date().toISOString().split("T")[0];
  const puestaRef = puesta.numero_contrato || puestaId.slice(0, 8).toUpperCase();

  // Registrar la desaplicación como salida parcial
  const { error: salidaError } = await supabase.from("salidas_parciales").insert({
    puesta_id: puestaId,
    fecha_salida: today,
    cantidad,
    tipo: "desaplicacion",
    comentarios: `Desaplicación de ${Number(cantidad).toFixed(2)} unidades`,
    created_by: user.id,
  });
  if (salidaError) return { error: salidaError.message };

  // Si ya ha pasado el período de plancha, generar entrada de stock automática
  if (today > puesta.fecha_fin_plancha) {
    const { error: inboundError } = await supabase.from("inbound_movements").insert({
      warehouse_id: puesta.warehouse_id,
      product_id: puesta.product_id,
      quantity: cantidad,
      movement_date: today,
      free_days: 1,
      supplier_id: null,
      comments: `Desaplicacion cliente nº pta ${puestaRef}`,
      created_by: user.id,
    });
    if (inboundError) return { error: inboundError.message };
    // La mercancía vuelve a ser stock del almacén desde hoy.
    await recalcStorageCostsFrom(supabase, today);
  }

  // Auto-finalizar si la cantidad pendiente llega a 0
  const salidaList = (puesta.salidas_parciales ?? []) as { cantidad: number; tipo: string }[];
  const totalPrev = salidaList
    .filter((s) => s.tipo === "real" || s.tipo === "desaplicacion")
    .reduce((sum, s) => sum + Number(s.cantidad), 0);
  if (totalPrev + cantidad >= Number(puesta.cantidad_inicial)) {
    await supabase
      .from("puestas_a_disposicion")
      .update({ estado: "finalizada" })
      .eq("id", puestaId);
  }

  return {};
}

// ── Traspaso de puesta a otro almacén ────────────────────────

export async function traspasarPuesta(
  puestaId: string,
  destinoWarehouseId: string,
): Promise<{ error?: string; nuevaPuestaId?: string }> {
  const user = await requireAuth();
  const supabase = await createServiceClient();
  const today = new Date().toISOString().split("T")[0];

  // 1. Cargar puesta original con sus salidas
  const { data: puesta, error: puestaError } = await supabase
    .from("puestas_a_disposicion")
    .select(
      "id, numero_contrato, customer_id, product_id, warehouse_id, cantidad_inicial, fecha_fin_plancha, estado, comentarios, salidas_parciales(cantidad, tipo)"
    )
    .eq("id", puestaId)
    .single();

  if (puestaError || !puesta) return { error: "No se pudo cargar la puesta a disposición" };
  if (puesta.estado !== "abierta") return { error: "Solo se pueden traspasar puestas en estado 'abierta'" };
  if (puesta.warehouse_id === destinoWarehouseId) return { error: "El almacén destino debe ser diferente al de origen" };

  // 2. Calcular cantidad pendiente
  const salidaList = (puesta.salidas_parciales ?? []) as { cantidad: number; tipo: string }[];
  const totalSalidas = salidaList
    .filter((s) => s.tipo === "real" || s.tipo === "desaplicacion")
    .reduce((sum, s) => sum + Number(s.cantidad), 0);
  const cantidadPendiente = Number(puesta.cantidad_inicial) - totalSalidas;

  if (cantidadPendiente <= 0) return { error: "No hay cantidad pendiente para traspasar" };

  // 3. Nombre del almacén destino (para los comentarios)
  const { data: destWh } = await supabase
    .from("warehouses")
    .select("name")
    .eq("id", destinoWarehouseId)
    .single();
  const destName = destWh?.name ?? destinoWarehouseId;
  const puestaRef = puesta.numero_contrato || puestaId.slice(0, 8).toUpperCase();

  // 4. Crear desaplicación (idéntico a createDesaplicacion)
  const { error: salidaError } = await supabase.from("salidas_parciales").insert({
    puesta_id: puestaId,
    fecha_salida: today,
    cantidad: cantidadPendiente,
    tipo: "desaplicacion",
    comentarios: `Traspaso a almacén ${destName} — ${cantidadPendiente.toFixed(2)} uds`,
    created_by: user.id,
  });
  if (salidaError) return { error: salidaError.message };

  // 5. Si ya ha pasado el período de plancha, generar entrada de stock (igual que Desaplicar)
  if (today > puesta.fecha_fin_plancha) {
    const { error: inboundError } = await supabase.from("inbound_movements").insert({
      warehouse_id: puesta.warehouse_id,
      product_id: puesta.product_id,
      quantity: cantidadPendiente,
      movement_date: today,
      free_days: 1,
      supplier_id: null,
      comments: `Traspaso a ${destName} — pta. ${puestaRef}`,
      created_by: user.id,
    });
    if (inboundError) return { error: inboundError.message };
    await recalcStorageCostsFrom(supabase, today);
  }

  // 6. Marcar puesta original como 'traspasada' + añadir comentario
  const prevComentarios = (puesta.comentarios ?? "").trim();
  const traspasoLine = `[${today}] Traspasada a "${destName}": ${cantidadPendiente.toFixed(2)} uds`;
  const newComentarios = prevComentarios ? `${prevComentarios}\n${traspasoLine}` : traspasoLine;

  const { error: updateError } = await supabase
    .from("puestas_a_disposicion")
    .update({ estado: "traspasada", comentarios: newComentarios, cant_traspasada: cantidadPendiente })
    .eq("id", puestaId);
  if (updateError) return { error: updateError.message };

  // 7. Calcular días de plancha para la nueva puesta
  //    Si fecha_fin_plancha > hoy → días restantes; si no → 0
  let nuevasDiasPlancha = 0;
  if (puesta.fecha_fin_plancha > today) {
    const msPerDay = 1000 * 60 * 60 * 24;
    const fin = new Date(puesta.fecha_fin_plancha + "T00:00:00Z").getTime();
    const hoy = new Date(today + "T00:00:00Z").getTime();
    nuevasDiasPlancha = Math.round((fin - hoy) / msPerDay);
  }

  // 8. Crear nueva puesta en el almacén destino
  const { data: nuevaPuesta, error: nuevaError } = await supabase
    .from("puestas_a_disposicion")
    .insert({
      numero_contrato: puesta.numero_contrato,
      customer_id: puesta.customer_id,
      product_id: puesta.product_id,
      warehouse_id: destinoWarehouseId,
      cantidad_inicial: cantidadPendiente,
      fecha_puesta: today,
      dias_plancha: nuevasDiasPlancha,
      estado: "abierta",
      comentarios: `Traspasada desde pta. ${puestaRef}`,
      created_by: user.id,
    })
    .select()
    .single();

  if (nuevaError) return { error: nuevaError.message };

  return { nuevaPuestaId: nuevaPuesta.id };
}

// ── Facturación mensual ──────────────────────────────────────

export async function markMonthAsInvoiced(
  puestaId: string,
  yearMonth: string
): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createServiceClient();

  const { error } = await supabase
    .from("puesta_facturacion_meses")
    .upsert(
      {
        puesta_id: puestaId,
        year_month: yearMonth,
        invoiced_at: new Date().toISOString(),
        created_by: user.id,
      },
      { onConflict: "puesta_id,year_month" }
    );

  if (error) return { error: error.message };
  return {};
}

export async function unmarkMonthAsInvoiced(
  puestaId: string,
  yearMonth: string
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();

  const { error } = await supabase
    .from("puesta_facturacion_meses")
    .delete()
    .eq("puesta_id", puestaId)
    .eq("year_month", yearMonth);

  if (error) return { error: error.message };
  return {};
}
