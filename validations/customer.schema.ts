import { z } from "zod";

export const customerSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(200, "Máximo 200 caracteres"),
  tax_id: z
    .string()
    .max(50, "Máximo 50 caracteres")
    .optional()
    .nullable()
    .transform((v) => v || null),
  comments: z
    .string()
    .max(1000, "Máximo 1000 caracteres")
    .optional()
    .nullable()
    .transform((v) => v || null),
  active: z.boolean().default(true),
});

export const customerUpdateSchema = customerSchema.partial();

export type CustomerFormValues = z.infer<typeof customerSchema>;
export type CustomerUpdateValues = z.infer<typeof customerUpdateSchema>;
