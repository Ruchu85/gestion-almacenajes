import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllBatches } from "@/repositories/fetch-all";
import {
  extractMatriculaFromComment,
  extractTicketFromComment,
} from "@/services/pdf-audit.service";
import type { PdfProposalItem } from "@/validations/pdf-import.schema";

/**
 * Detección de duplicados para las SALIDAS DIRECTAS ("Salida propia") de una
 * importación (PDF o Excel).
 *
 * El flujo de puestas ya comparaba contra `salidas_parciales` (misma puesta,
 * fecha, matrícula y cantidad), pero las salidas directas se guardan en
 * `outbound_movements` y no pasaban por ninguna comprobación: solo se miraba
 * que hubiese stock. Resultado real (11/11/2026): el Ticket 59998 de PÉREZ
 * TORRES / MAIZ se importó dos veces (07/08 y 10/08) porque el informe del
 * puerto es acumulativo, y las dos copias entraron sin aviso.
 *
 * Criterio: mismo almacén, producto, fecha y cantidad, y la MISMA pesada,
 * identificada por el nº de ticket o, si falta, por la matrícula. Sin ticket ni
 * matrícula en alguno de los dos lados no se marca nada: dos camiones distintos
 * pueden pesar lo mismo el mismo día, y un falso aviso (la fila deja de venir
 * preseleccionada) es más molesto que útil.
 *
 * Solo AVISA, igual que en las puestas: la fila baja a "revisar" y no viene
 * marcada, pero el usuario puede grabarla si de verdad es otro camión.
 */

/** Tolerancia al comparar cantidades (la misma que el flujo de puestas). */
const TOLERANCIA_CANTIDAD = 0.01;

/** Texto del aviso. La tabla detecta los duplicados por "Ya existe una salida idéntica". */
export const AVISO_SALIDA_DIRECTA_DUPLICADA =
  "Ya existe una salida idéntica registrada en este almacén (mismo producto, fecha, cantidad y ticket/matrícula). Revisa que no sea la misma pesada importada dos veces.";

export interface SalidaDirectaExistente {
  warehouse_id: string;
  product_id: string;
  movement_date: string;
  quantity: number | string;
  matricula: string | null;
  comments: string | null;
}

interface LineaSalidaDirecta {
  fecha: string;
  cantidad: number;
  matricula: string;
  ticket?: string | null;
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toUpperCase();

/** ¿Es `existente` la misma pesada que `linea`? Función pura, sin BD. */
export function esMismaSalidaDirecta(
  existente: SalidaDirectaExistente,
  linea: LineaSalidaDirecta
): boolean {
  if (existente.movement_date !== linea.fecha) return false;
  if (Math.abs(Number(existente.quantity) - linea.cantidad) >= TOLERANCIA_CANTIDAD) return false;

  const ticketLinea = norm(linea.ticket);
  const ticketExistente = norm(extractTicketFromComment(existente.comments));
  if (ticketLinea && ticketExistente) return ticketLinea === ticketExistente;

  // Sin ticket en alguno de los dos lados: se compara la matrícula. Las
  // importaciones antiguas la dejaron solo dentro del comentario.
  const matLinea = norm(linea.matricula);
  const matExistente = norm(existente.matricula ?? extractMatriculaFromComment(existente.comments));
  if (matLinea && matExistente) return matLinea === matExistente;

  return false;
}

/**
 * Marca como duplicadas las propuestas de salida directa que ya existen en la
 * base de datos. Modifica las propuestas in situ (aviso + `duplicado`).
 */
export async function marcarSalidasDirectasDuplicadas(
  supabase: SupabaseClient,
  proposals: PdfProposalItem[]
): Promise<void> {
  const candidatas = proposals.filter(
    (p) => p.tipo === "normal" && p.resolvedWarehouseId && p.resolvedProductId && p.line.cantidad > 0
  );
  if (candidatas.length === 0) return;

  const warehouseIds = [...new Set(candidatas.map((p) => p.resolvedWarehouseId!))];
  const productIds = [...new Set(candidatas.map((p) => p.resolvedProductId!))];
  const fechas = candidatas.map((p) => p.line.fecha).sort();

  const existentes = await fetchAllBatches<SalidaDirectaExistente>(
    "[outbound_movements] duplicados de salidas directas",
    (from, to) =>
      supabase
        .from("outbound_movements")
        .select("warehouse_id, product_id, movement_date, quantity, matricula, comments")
        .eq("from_puesta", false)
        .in("warehouse_id", warehouseIds)
        .in("product_id", productIds)
        .gte("movement_date", fechas[0])
        .lte("movement_date", fechas[fechas.length - 1])
        .order("movement_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
  );
  if (existentes.length === 0) return;

  for (const proposal of candidatas) {
    const duplicada = existentes.some(
      (e) =>
        e.warehouse_id === proposal.resolvedWarehouseId &&
        e.product_id === proposal.resolvedProductId &&
        esMismaSalidaDirecta(e, proposal.line)
    );
    if (duplicada) {
      proposal.duplicado = true;
      proposal.warnings.push(AVISO_SALIDA_DIRECTA_DUPLICADA);
    }
  }
}
