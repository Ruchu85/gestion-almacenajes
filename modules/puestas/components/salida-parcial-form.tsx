"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Truck, AlertTriangle, ArrowRightLeft, Lock } from "lucide-react";
import { salidaParcialSchema, type SalidaParcialFormValues } from "@/validations/salida-parcial.schema";
import type { SalidaParcial } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
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
import { MatriculaInput } from "@/components/shared/matricula-input";
import { formatDate, formatNumber } from "@/utils/format";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { OpcionesMoverRetirada } from "@/lib/mover-retirada";
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
  fechaMinima?: string;
  matriculas?: string[];
  /**
   * Solo al editar: puestas a las que se puede mover la retirada (mismo
   * cliente, producto y almacén). Con valor, se muestra el selector.
   */
  opcionesPuesta?: OpcionesMoverRetirada | null;
  cargandoOpciones?: boolean;
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
  fechaMinima,
  matriculas = [],
  opcionesPuesta,
  cargandoOpciones = false,
}: SalidaParcialFormProps) {
  const isEditing = !!defaultValues;
  const [pendingOverflowValues, setPendingOverflowValues] = useState<SalidaParcialFormValues | null>(null);

  const form = useForm<SalidaParcialFormValues>({
    resolver: zodResolver(salidaParcialSchema),
    defaultValues: {
      puesta_id: puestaId,
      fecha_salida: new Date().toISOString().split("T")[0],
      n_camion: "",
      matricula: undefined as unknown as string,
      cantidad: undefined as unknown as number,
      comentarios: "",
    },
  });

  const cantidad = form.watch("cantidad");
  const puestaElegida = form.watch("puesta_id");
  const cambiaPuesta = isEditing && !!puestaElegida && puestaElegida !== puestaId;
  const destinoElegido = opcionesPuesta?.opciones.find((o) => o.id === puestaElegida);
  const etiquetaPuesta = (num: string | null, id: string) => num ?? `#${id.slice(0, 8).toUpperCase()}`;
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
          matricula: undefined as unknown as string,
          cantidad: undefined as unknown as number,
          comentarios: "",
        });
      }
    }
  }, [open, defaultValues, puestaId, form]);

  async function handleSubmit(values: SalidaParcialFormValues) {
    // Validate minimum date
    if (fechaMinima && values.fecha_salida < fechaMinima) {
      form.setError("fecha_salida", {
        message: `La fecha no puede ser anterior al inicio de la puesta (${fechaMinima})`,
      });
      return;
    }
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
                      <Input type="date" min={fechaMinima} {...field} />
                    </FormControl>
                    {fechaMinima && (
                      <p className="text-xs text-muted-foreground">
                        Mínimo: {fechaMinima}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Puesta a disposición (solo al editar) */}
              {isEditing && (cargandoOpciones || opcionesPuesta) && (
                <FormField
                  control={form.control}
                  name="puesta_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Puesta a disposición
                      </FormLabel>
                      {cargandoOpciones || !opcionesPuesta ? (
                        <div className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Cargando puestas…
                        </div>
                      ) : (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={!!opcionesPuesta.bloqueo || opcionesPuesta.opciones.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={puestaId}>
                              {opcionesPuesta.actual
                                ? etiquetaPuesta(opcionesPuesta.actual.numero_contrato, opcionesPuesta.actual.id)
                                : etiquetaPuesta(null, puestaId)}{" "}
                              (actual)
                            </SelectItem>
                            {opcionesPuesta.opciones.map((o) => (
                              <SelectItem key={o.id} value={o.id} disabled={!!o.motivo}>
                                <span className="font-mono">{etiquetaPuesta(o.numero_contrato, o.id)}</span>
                                <span className="text-muted-foreground">
                                  {" "}· {formatDate(o.fecha_puesta)} · pte. {formatNumber(o.pendiente)} {unit}
                                </span>
                                {o.motivo && (
                                  <span className="block text-[11px] text-muted-foreground">{o.motivo}</span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {opcionesPuesta?.bloqueo ? (
                        <FormDescription className="flex items-start gap-1.5">
                          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {opcionesPuesta.bloqueo}
                        </FormDescription>
                      ) : opcionesPuesta && opcionesPuesta.opciones.length === 0 ? (
                        <FormDescription>
                          No hay otras puestas abiertas de este cliente, producto y almacén.
                        </FormDescription>
                      ) : null}
                      {cambiaPuesta && destinoElegido && (
                        <div className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200">
                          <p className="font-semibold">
                            La retirada pasará a la puesta{" "}
                            {etiquetaPuesta(destinoElegido.numero_contrato, destinoElegido.id)}.
                          </p>
                          <p className="mt-0.5">
                            Al guardar se recalculan los pendientes, las auto-salidas de fin de
                            plancha y los almacenajes de las dos puestas.
                          </p>
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Matrícula */}
              <FormField
                control={form.control}
                name="matricula"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matrícula *</FormLabel>
                    <FormControl>
                      <MatriculaInput
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        matriculas={matriculas}
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
                      <DecimalInput
                        placeholder="0,000"
                        className={cn(
                          "transition-all",
                          !field.value && "ring-2 ring-primary border-primary",
                          exceedsPending && "ring-2 ring-destructive border-destructive"
                        )}
                        value={field.value ?? null}
                        onChange={(n) => field.onChange(n)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
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
