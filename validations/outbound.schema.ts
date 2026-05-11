import { z } from "zod";

export const outboundSchema = z.object({
  warehouse_id: z
    .string()
    .uuid("Selecciona un almacén válido")
    .min(1, "El almacén es obligatorio"),
  product_id: z
    .string()
    .uuid("Selecciona un producto válido")
    .min(1, "El producto es obligatorio"),
  customer_id: z
    .string()
    .uuid("Selecciona un cliente válido")
    .optional()
    .nullable()
    .transform((v) => v || null),
  quantity: z
    .number({
      required_error: "La cantidad es obligatoria",
      invalid_type_error: "Debe ser un número válido",
    })
    .positive("La cantidad debe ser mayor que 0")
    .max(9999999.999, "Cantidad demasiado grande"),
  movement_date: z
    .string()
    .min(1, "La fecha es obligatoria")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  free_days: z
    .number({
      required_error: "Los días de plancha son obligatorios",
      invalid_type_error: "Debe ser un número entero",
    })
    .int("Debe ser un número entero")
    .min(0, "No puede ser negativo")
    .max(365, "Máximo 365 días")
    .default(0),
  comments: z
    .string()
    .max(1000, "Máximo 1000 caracteres")
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export const outboundUpdateSchema = outboundSchema.partial();

export type OutboundFormValues = z.infer<typeof outboundSchema>;
export type OutboundUpdateValues = z.infer<typeof outboundUpdateSchema>;
