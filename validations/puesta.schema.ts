import { z } from "zod";

export const puestaSchema = z.object({
  numero_contrato: z
    .string()
    .max(100, "Máximo 100 caracteres")
    .optional()
    .nullable(),
  customer_id: z.string().uuid("Cliente inválido").optional().nullable(),
  product_id: z.string().uuid("Producto inválido").min(1, "El producto es obligatorio"),
  warehouse_id: z.string().uuid("Almacén inválido").min(1, "El almacén es obligatorio"),
  cantidad_inicial: z
    .number({ invalid_type_error: "Debe ser un número" })
    .positive("La cantidad debe ser mayor que 0")
    .max(999999, "Máximo 999.999"),
  fecha_puesta: z.string().min(1, "La fecha es obligatoria"),
  dias_plancha: z
    .number({
      required_error: "Los días de plancha son obligatorios",
      invalid_type_error: "Debe ser un número entero",
    })
    .int("Debe ser un número entero")
    .min(0, "Mínimo 0 días")
    .max(365, "Máximo 365 días"),
  estado: z
    .enum(["abierta", "finalizada", "cerrada_manual", "traspasada"])
    .default("abierta"),
  comentarios: z.string().max(2000, "Máximo 2000 caracteres").optional().nullable(),
});

export const puestaUpdateSchema = puestaSchema.partial();

export type PuestaFormValues = z.infer<typeof puestaSchema>;
export type PuestaUpdateValues = z.infer<typeof puestaUpdateSchema>;
