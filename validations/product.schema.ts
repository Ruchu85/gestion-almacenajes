import { z } from "zod";

export const productSchema = z.object({
  code: z
    .string()
    .min(1, "El código es obligatorio")
    .max(50, "Máximo 50 caracteres")
    .regex(/^[A-Z0-9\-_]+$/i, "Solo letras, números, guiones y guiones bajos"),
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(200, "Máximo 200 caracteres"),
  storage_daily_price: z
    .number({
      required_error: "El precio diario es obligatorio",
      invalid_type_error: "Debe ser un número válido",
    })
    .min(0, "El precio no puede ser negativo")
    .max(99999.9999, "Precio demasiado alto"),
  unit: z
    .string()
    .min(1, "La unidad es obligatoria")
    .max(50, "Máximo 50 caracteres")
    .default("ud"),
  active: z.boolean().default(true),
});

export const productUpdateSchema = productSchema.partial();

export type ProductFormValues = z.infer<typeof productSchema>;
export type ProductUpdateValues = z.infer<typeof productUpdateSchema>;
