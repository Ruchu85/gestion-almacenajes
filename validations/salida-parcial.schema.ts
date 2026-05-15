import { z } from "zod";

export const salidaParcialSchema = z.object({
  puesta_id: z.string().uuid("Puesta inválida").min(1, "La puesta es obligatoria"),
  fecha_salida: z.string().min(1, "La fecha es obligatoria"),
  n_camion: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  matricula: z.string().min(1, "La matrícula es obligatoria").max(50, "Máximo 50 caracteres"),
  cantidad: z
    .number({ invalid_type_error: "Debe ser un número" })
    .positive("La cantidad debe ser mayor que 0")
    .max(999999, "Máximo 999.999"),
  comentarios: z.string().max(2000, "Máximo 2000 caracteres").optional().nullable(),
});

export const salidaParcialUpdateSchema = salidaParcialSchema.partial();

export type SalidaParcialFormValues = z.infer<typeof salidaParcialSchema>;
export type SalidaParcialUpdateValues = z.infer<typeof salidaParcialUpdateSchema>;
