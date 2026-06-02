"use server";

import { createServiceClient, createClient } from "@/lib/supabase/server";
import { puestaSchema, type PuestaFormValues } from "@/validations/puesta.schema";
import { salidaParcialSchema, type SalidaParcialFormValues } from "@/validations/salida-parcial.schema";
import type { PuestaADisposicion, SalidaParcial } from "@/types";
import { redirect } from "next/navigation";
import { upsertMatricula } from "@/lib/actions/matriculas";

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

export async function updatePuesta(
  id: string,
  values: PuestaFormValues
): Promise<{ data?: PuestaADisposicion; error?: string }> {
  await requireAuth();
  const parsed = puestaSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createServiceClient();
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
  return { data: data as PuestaADisposicion };
}

export async function deletePuesta(id: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("puestas_a_disposicion")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
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

  if (!forceOverflow && parsed.data.cantidad > cantidadPendiente) {
    return {
      error: `La cantidad (${parsed.data.cantidad}) supera la pendiente (${cantidadPendiente})`,
    };
  }

  const supabase = await createServiceClient();

  // Fetch puesta to determine plancha period and warehouse/product context
  const { data: puesta, error: puestaError } = await supabase
    .from("puestas_a_disposicion")
    .select("fecha_puesta, dias_plancha, warehouse_id, product_id, customer_id, numero_contrato, cantidad_inicial, salidas_parciales(cantidad, tipo), customer:customers(name, codigo)")
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

  // Determine plancha boundary
  const fechaPuesta = new Date(puesta.fecha_puesta + "T00:00:00");
  const fechaFinPlancha = new Date(fechaPuesta);
  fechaFinPlancha.setDate(fechaFinPlancha.getDate() + (Number(puesta.dias_plancha) ?? 0));
  const fechaFinStr = fechaFinPlancha.toISOString().split("T")[0];

  if (parsed.data.fecha_salida <= fechaFinStr) {
    // Within plancha: create outbound for the real salida
    await supabase.from("outbound_movements").insert({
      warehouse_id: puesta.warehouse_id,
      product_id: puesta.product_id,
      quantity: parsed.data.cantidad,
      movement_date: parsed.data.fecha_salida,
      free_days: 0,
      customer_id: puesta.customer_id ?? null,
      comments: `Retirada puesta a disposición${parsed.data.n_camion ? ` (camión: ${parsed.data.n_camion})` : ""}`,
      from_puesta: true,
      created_by: user.id,
    });

    // ── Recalcular la salida automática de fin de plancha si ya existía ──
    // La salida_parcial nueva ya está en BD, así que la suma incluye la nueva cantidad.
    const { data: planchaExit } = await supabase
      .from("salidas_parciales")
      .select("id, cantidad")
      .eq("puesta_id", parsed.data.puesta_id)
      .eq("tipo", "plancha")
      .maybeSingle();

    if (planchaExit) {
      const { data: realUpToPlancha } = await supabase
        .from("salidas_parciales")
        .select("cantidad")
        .eq("puesta_id", parsed.data.puesta_id)
        .eq("tipo", "real")
        .lte("fecha_salida", fechaFinStr);

      const totalRealUpToPlancha = (realUpToPlancha ?? [])
        .reduce((sum, s) => sum + Number(s.cantidad), 0);
      const newPendingAtPlancha = Math.max(
        0,
        Number(puesta.cantidad_inicial) - totalRealUpToPlancha
      );

      if (newPendingAtPlancha <= 0) {
        // Toda la mercancía ya fue retirada antes del fin de plancha → eliminar auto-salida
        await supabase.from("salidas_parciales").delete().eq("id", planchaExit.id);
        await supabase
          .from("outbound_movements")
          .delete()
          .eq("warehouse_id", puesta.warehouse_id)
          .eq("product_id", puesta.product_id)
          .eq("movement_date", fechaFinStr)
          .eq("from_puesta", true);
      } else if (newPendingAtPlancha !== Number(planchaExit.cantidad)) {
        // Quedan unidades pero menos de las originales → actualizar cantidad
        await supabase
          .from("salidas_parciales")
          .update({ cantidad: newPendingAtPlancha })
          .eq("id", planchaExit.id);
        await supabase
          .from("outbound_movements")
          .update({ quantity: newPendingAtPlancha })
          .eq("warehouse_id", puesta.warehouse_id)
          .eq("product_id", puesta.product_id)
          .eq("movement_date", fechaFinStr)
          .eq("from_puesta", true);
      }
    }
  } else {
    // Outside plancha: the plancha auto-exit already generated an outbound for the
    // full pending quantity. Only create an additional outbound for any excess (rebase).
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
        created_by: user.id,
      });
    }
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
  }

  return { data: data as SalidaParcial };
}

export async function triggerPlanchaAutoExit(puestaId: string): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createServiceClient();

  // Fetch puesta with all salidas_parciales
  const { data: puesta, error: puestaError } = await supabase
    .from("puestas_a_disposicion")
    .select("*, salidas_parciales(cantidad, tipo)")
    .eq("id", puestaId)
    .single();

  if (puestaError || !puesta) {
    return { error: puestaError?.message ?? "Puesta no encontrada" };
  }

  const salidaParciales = puesta.salidas_parciales as { cantidad: number; tipo: string }[];

  // Idempotency: if auto-exit already done, skip
  if (salidaParciales.some((s) => s.tipo === "plancha")) return {};

  // Calculate remaining pending (only real salidas reduce pending at this point)
  const totalReal = salidaParciales
    .filter((s) => s.tipo === "real")
    .reduce((sum, s) => sum + Number(s.cantidad), 0);
  const pending = Number(puesta.cantidad_inicial) - totalReal;
  if (pending <= 0) return {};

  // Determine fecha_fin_plancha
  const fechaPuesta = new Date(puesta.fecha_puesta + "T00:00:00");
  const fechaFinPlancha = new Date(fechaPuesta);
  fechaFinPlancha.setDate(fechaFinPlancha.getDate() + (Number(puesta.dias_plancha) ?? 0));
  const fechaFinStr = fechaFinPlancha.toISOString().split("T")[0];

  // Create the plancha auto-exit salida_parcial
  const { error: salidaError } = await supabase.from("salidas_parciales").insert({
    puesta_id: puestaId,
    fecha_salida: fechaFinStr,
    cantidad: pending,
    tipo: "plancha",
    comentarios: "Salida automática fin de plancha",
    created_by: user.id,
  });
  if (salidaError) return { error: salidaError.message };

  // Create the corresponding outbound_movement
  const { error: outboundError } = await supabase.from("outbound_movements").insert({
    warehouse_id: puesta.warehouse_id,
    product_id: puesta.product_id,
    quantity: pending,
    movement_date: fechaFinStr,
    free_days: 0,
    customer_id: puesta.customer_id ?? null,
    comments: `Auto-salida fin de plancha${puesta.numero_contrato ? ` (${puesta.numero_contrato})` : ""}`,
    from_puesta: true,
    created_by: user.id,
  });
  if (outboundError) return { error: outboundError.message };

  return {};
}

export async function recalcularPlanchaAutoExit(
  puestaId: string
): Promise<{ action?: "deleted" | "updated" | "unchanged"; error?: string }> {
  await requireAuth();
  const supabase = await createServiceClient();

  const { data: puesta, error: puestaErr } = await supabase
    .from("puestas_a_disposicion")
    .select("fecha_puesta, dias_plancha, warehouse_id, product_id, cantidad_inicial")
    .eq("id", puestaId)
    .single();

  if (puestaErr || !puesta) return { error: "No se pudo cargar la puesta" };

  const fechaFinPlancha = new Date(puesta.fecha_puesta + "T00:00:00");
  fechaFinPlancha.setDate(fechaFinPlancha.getDate() + Number(puesta.dias_plancha ?? 0));
  const fechaFinStr = fechaFinPlancha.toISOString().split("T")[0];

  const { data: planchaExit } = await supabase
    .from("salidas_parciales")
    .select("id, cantidad")
    .eq("puesta_id", puestaId)
    .eq("tipo", "plancha")
    .maybeSingle();

  if (!planchaExit) return { action: "unchanged" };

  const { data: realSalidas } = await supabase
    .from("salidas_parciales")
    .select("cantidad")
    .eq("puesta_id", puestaId)
    .eq("tipo", "real")
    .lte("fecha_salida", fechaFinStr);

  const totalReal = (realSalidas ?? []).reduce((sum, s) => sum + Number(s.cantidad), 0);
  const newPending = Math.max(0, Number(puesta.cantidad_inicial) - totalReal);

  if (newPending <= 0) {
    await supabase.from("salidas_parciales").delete().eq("id", planchaExit.id);
    await supabase
      .from("outbound_movements")
      .delete()
      .eq("warehouse_id", puesta.warehouse_id)
      .eq("product_id", puesta.product_id)
      .eq("movement_date", fechaFinStr)
      .eq("from_puesta", true);
    return { action: "deleted" };
  }

  if (newPending === Number(planchaExit.cantidad)) return { action: "unchanged" };

  await supabase.from("salidas_parciales").update({ cantidad: newPending }).eq("id", planchaExit.id);
  await supabase
    .from("outbound_movements")
    .update({ quantity: newPending })
    .eq("warehouse_id", puesta.warehouse_id)
    .eq("product_id", puesta.product_id)
    .eq("movement_date", fechaFinStr)
    .eq("from_puesta", true);

  return { action: "updated" };
}

export async function updateSalidaParcial(
  id: string,
  values: SalidaParcialFormValues
): Promise<{ data?: SalidaParcial; error?: string }> {
  await requireAuth();
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

  return { data: data as SalidaParcial };
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
  await requireAuth();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("salidas_parciales")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
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

  // 5. Generar entrada de stock en almacén ORIGEN para incrementar cant_invendida.
  //    A diferencia de Desaplicar (que solo lo hace si ha pasado la plancha),
  //    el traspaso siempre libera la mercancía de la puesta al stock del almacén origen.
  const { error: inboundOrigenError } = await supabase.from("inbound_movements").insert({
    warehouse_id: puesta.warehouse_id,
    product_id: puesta.product_id,
    quantity: cantidadPendiente,
    movement_date: today,
    free_days: 1,
    supplier_id: null,
    comments: `Traspaso a ${destName} — pta. ${puestaRef}`,
    created_by: user.id,
  });
  if (inboundOrigenError) return { error: inboundOrigenError.message };

  // 6. Marcar puesta original como 'traspasada' + añadir comentario
  const prevComentarios = (puesta.comentarios ?? "").trim();
  const traspasoLine = `[${today}] Traspasada a "${destName}": ${cantidadPendiente.toFixed(2)} uds`;
  const newComentarios = prevComentarios ? `${prevComentarios}\n${traspasoLine}` : traspasoLine;

  const { error: updateError } = await supabase
    .from("puestas_a_disposicion")
    .update({ estado: "traspasada", comentarios: newComentarios })
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

  // 9. Crear entrada de stock en el almacén DESTINO
  //    Necesaria para que cant_invendida no quede negativa:
  //    la nueva puesta incrementa totalPuestaQty_destino, esta entrada
  //    incrementa total_inbound_destino en la misma cantidad → efecto neto 0
  //    (frente al efecto -cantidadPendiente que habría sin esta entrada).
  const origenWh = await supabase
    .from("warehouses")
    .select("name")
    .eq("id", puesta.warehouse_id)
    .single();
  const origenName = origenWh.data?.name ?? "almacén origen";

  const { error: inboundDestError } = await supabase.from("inbound_movements").insert({
    warehouse_id: destinoWarehouseId,
    product_id: puesta.product_id,
    quantity: cantidadPendiente,
    movement_date: today,
    free_days: nuevasDiasPlancha,
    supplier_id: null,
    comments: `Traspaso desde ${origenName} — pta. ${puestaRef}`,
    created_by: user.id,
  });
  if (inboundDestError) return { error: inboundDestError.message };

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
