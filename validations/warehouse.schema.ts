import { z } from "zod";

export const warehouseSchema = z.object({
  code: z
    .string()
    .min(1, "El código es obligatorio")
    .max(50, "Máximo 50 caracteres")
    .regex(/^[A-Z0-9\-_]+$/i, "Solo letras, números, guiones y guiones bajos"),
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(200, "Máximo 200 caracteres"),
  address: z.string().max(500, "Máximo 500 caracteres").optional().nullable(),
  posicion_cerrada: z.string().optional().nullable(),
  storage_daily_price: z
    .number({
      required_error: "El precio de almacenaje diario es obligatorio",
      invalid_type_error: "Debe ser un número válido",
    })
    .min(0, "El precio no puede ser negativo")
    .max(99999.9999, "Precio demasiado alto")
    .default(0),
  active: z.boolean().default(true),
});

export const warehouseUpdateSchema = warehouseSchema.partial();

export type WarehouseFormValues = z.infer<typeof warehouseSchema>;
export type WarehouseUpdateValues = z.infer<typeof warehouseUpdateSchema>;
