"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Truck, AlertTriangle } from "lucide-react";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatNumber } from "@/utils/format";
import { cn } from "@/lib/utils";

interface SalidaParcialFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: SalidaParcialFormValues, forceOverflow?: boolean) => Promise<void>;
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
  const [pendingOverflowValues, setPendingOverflowValues] = useState<SalidaParcialFormValues | null>(null);

  const form = useForm<SalidaParcialFormValues>({
    resolver: zodResolver(salidaParcialSchema),
    defaultValues: {
      puesta_id: puestaId,
      fecha_salida: new Date().toISOString().split("T")[0],
      n_camion: "",
      matricula: "",
      cantidad: undefined as unknown as number,
      comentarios: "",
    },
  });

  const cantidad = form.watch("cantidad");
  const exceedsPending = cantidadPendiente !== undefined && cantidad > cantidadPendiente;
  const exceso = exceedsPending ? cantidad - cantidadPendiente : 0;

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
          cantidad: undefined as unknown as number,
          comentarios: "",
        });
      }
    }
  }, [open, defaultValues, puestaId, form]);

  async function handleSubmit(values: SalidaParcialFormValues) {
    if (
      !isEditing &&
      cantidadPendiente !== undefined &&
      values.cantidad > cantidadPendiente
    ) {
      setPendingOverflowValues(values);
      return;
    }
    await onSubmit(values, false);
  }

  async function handleConfirmOverflow() {
    if (!pendingOverflowValues) return;
    setPendingOverflowValues(null);
    await onSubmit(pendingOverflowValues, true);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setPendingOverflowValues(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {isEditing ? "Editar salida" : "Registrar salida de camión"}
            </DialogTitle>
            {cantidadPendiente !== undefined && (
              <DialogDescription>
                Cantidad pendiente:{" "}
                <strong className="text-foreground">
                  {formatNumber(cantidadPendiente)} {unit}
                </strong>
              </DialogDescription>
            )}
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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

              {/* Matrícula */}
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
                        placeholder="0,000"
                        className={cn(
                          "transition-all",
                          !field.value && "ring-2 ring-primary border-primary",
                          exceedsPending && "ring-2 ring-destructive border-destructive"
                        )}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                      />
                    </FormControl>
                    {exceedsPending ? (
                      <FormDescription className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Supera la pendiente en{" "}
                        <strong>{formatNumber(exceso)} {unit}</strong>
                      </FormDescription>
                    ) : cantidadPendiente !== undefined ? (
                      <FormDescription>
                        Máximo disponible: {formatNumber(cantidadPendiente)} {unit}
                      </FormDescription>
                    ) : null}
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isLoading}
                >
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

      {/* Confirmation when quantity exceeds pending */}
      <AlertDialog
        open={!!pendingOverflowValues}
        onOpenChange={(o) => { if (!o) setPendingOverflowValues(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Cantidad supera la pendiente
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                La cantidad introducida (
                <strong>{formatNumber(pendingOverflowValues?.cantidad ?? 0)} {unit}</strong>
                ) supera la pendiente en{" "}
                <strong className="text-destructive">
                  {formatNumber((pendingOverflowValues?.cantidad ?? 0) - (cantidadPendiente ?? 0))} {unit}
                </strong>.
              </p>
              <p>
                Si continúas, la cantidad pendiente quedará en <strong className="text-destructive">negativo</strong>{" "}
                y la puesta se marcará como <strong>finalizada</strong>.
              </p>
              <p>¿Deseas continuar?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmOverflow}
            >
              Sí, continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
