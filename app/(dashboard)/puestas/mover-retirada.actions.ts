"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  ejecutarMoverRetirada,
  obtenerOpcionesMoverRetirada,
  type OpcionesMoverRetirada,
  type ResultadoMoverRetirada,
} from "@/lib/mover-retirada";


async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

/** Puestas a las que se puede mover una retirada (para el diálogo de edición). */
export async function getOpcionesMoverRetirada(salidaId: string): Promise<OpcionesMoverRetirada> {
  await requireAuth();
  return obtenerOpcionesMoverRetirada(await createServiceClient(), salidaId);
}

/** Mueve la retirada a otra puesta del mismo cliente, producto y almacén. */
export async function moverRetiradaAPuesta(
  salidaId: string,
  destinoId: string
): Promise<ResultadoMoverRetirada> {
  const user = await requireAuth();
  return ejecutarMoverRetirada(await createServiceClient(), salidaId, destinoId, user.id);
}
