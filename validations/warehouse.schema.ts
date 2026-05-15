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
  active: z.boolean().default(true),
});

export const warehouseUpdateSchema = warehouseSchema.partial();

export type WarehouseFormValues = z.infer<typeof warehouseSchema>;
export type WarehouseUpdateValues = z.infer<typeof warehouseUpdateSchema>;
