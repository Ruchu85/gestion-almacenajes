"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Truck } from "lucide-react";
import { salidaParcialSchema, type SalidaParcialFormValues } from "@/validations/salida-parcial.schema";
import type { SalidaParcial } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormControl, FormDescription, FormField,
  FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatNumber } from "@/utils/format";

interface SalidaParcialFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: SalidaParcialFormValues) => Promise<void>;
  isLoading?: boolean;
  puestaId: string;
  cantidadPendiente?: number;
  unit?: string;
  defaultValues?: SalidaParcial;
}

export function SalidaParcialForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  puestaId,
  cantidadPendiente,
  unit = "ud",
  defaultValues,
}: SalidaParcialFormProps) {
  const isEditing = !!defaultValues;

  const form = useForm<SalidaParcialFormValues>({
    resolver: zodResolver(salidaParcialSchema),
    defaultValues: {
      puesta_id: puestaId,
      fecha_salida: new Date().toISOString().split("T")[0],
      n_camion: "",
      matricula: "",
      cantidad: 0,
      comentarios: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (defaultValues) {
        form.reset({
          puesta_id: puestaId,
          fecha_salida: defaultValues.fecha_salida,
          n_camion: defaultValues.n_camion ?? "",
          matricula: defaultValues.matricula ?? "",
          cantidad: defaultValues.cantidad,
          comentarios: defaultValues.comentarios ?? "",
        });
      } else {
        form.reset({
          puesta_id: puestaId,
          fecha_salida: new Date().toISOString().split("T")[0],
          n_camion: "",
          matricula: "",
          cantidad: 0,
          comentarios: "",
        });
      }
    }
  }, [open, defaultValues, puestaId, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {isEditing ? "Editar salida" : "Registrar salida de camión"}
          </DialogTitle>
          <DialogDescription>
            {cantidadPendiente !== undefined && (
              <>Cantidad pendiente: <strong>{formatNumber(cantidadPendiente)} {unit}</strong></>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Fecha */}
            <FormField
              control={form.control}
              name="fecha_salida"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de salida *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Camión + Matrícula */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="n_camion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nº camión</FormLabel>
                    <FormControl>
                      <Input placeholder="C-001" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="matricula"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matrícula</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="1234 ABC"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Cantidad */}
            <FormField
              control={form.control}
              name="cantidad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  {cantidadPendiente !== undefined && (
                    <FormDescription>
                      Máximo disponible: {formatNumber(cantidadPendiente)} {unit}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Comentarios */}
            <FormField
              control={form.control}
              name="comentarios"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comentarios</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Observaciones..."
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Guardar cambios" : "Registrar salida"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
