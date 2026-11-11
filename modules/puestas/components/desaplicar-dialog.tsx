"use client";

import { useState } from "react";
import { Loader2, Undo2, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatNumber } from "@/utils/format";

interface DesaplicarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (cantidad: number, fecha: string) => Promise<void>;
  isLoading?: boolean;
  /** Pendiente ACTUAL de la puesta (todas las retiradas a fecha de hoy). */
  maxCantidad: number;
  unit: string;
  puestaRef: string;
  /** Fecha de puesta: no se puede desaplicar antes. */
  fechaPuesta: string;
  /** Último día de plancha: decide si se genera entrada de stock. */
  fechaFinPlancha: string;
  /** Hoy (YYYY-MM-DD): fecha por defecto y máxima. */
  today: string;
}

export function DesaplicarDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  maxCantidad,
  unit,
  puestaRef,
  fechaPuesta,
  fechaFinPlancha,
  today,
}: DesaplicarDialogProps) {
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [fecha, setFecha] = useState<string>(today);

  const cantidadNum = cantidad ?? 0;
  // Tolerancia de media milésima: evita que el ruido de coma flotante de
  // maxCantidad (calculado en el padre restando cantidades) rechace el
  // propio valor que se muestra como máximo (p.ej. 2,92 > 2,9199999999999999).
  const cantidadValida = cantidadNum > 0 && cantidadNum <= maxCantidad + 0.0005;
  const fechaError = !fecha
    ? "Indica la fecha de la desaplicación"
    : fecha > today
      ? "La fecha no puede ser posterior a hoy"
      : fecha < fechaPuesta
        ? `La fecha no puede ser anterior a la fecha de puesta (${formatDate(fechaPuesta)})`
        : null;
  const isValid = cantidadValida && !fechaError;
  const isOutsidePlancha = !!fecha && fecha > fechaFinPlancha;

  function reset() {
    setCantidad(null);
    setFecha(today);
  }

  function handleClose(open: boolean) {
    onOpenChange(open);
    if (!open) reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    await onSubmit(cantidadNum, fecha);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-4 w-4" />
            Desaplicar cantidad
          </DialogTitle>
          <DialogDescription>
            La cantidad desaplicada se descuenta de la puesta y no genera coste de almacenaje.
            Máximo (pendiente de retirar a día de hoy):{" "}
            <strong>
              {formatNumber(maxCantidad)} {unit}
            </strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="desaplicar-fecha">Fecha de la desaplicación</Label>
            <Input
              id="desaplicar-fecha"
              type="date"
              value={fecha}
              min={fechaPuesta}
              max={today}
              onChange={(e) => setFecha(e.target.value)}
            />
            {fechaError ? (
              <p className="text-xs text-destructive">{fechaError}</p>
            ) : (
              fecha < today && (
                <p className="text-xs text-muted-foreground">
                  Fecha pasada: se recalcularán los almacenajes desde el {formatDate(fecha)}.
                </p>
              )
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desaplicar-cantidad">
              Cantidad a desaplicar ({unit})
            </Label>
            <DecimalInput
              id="desaplicar-cantidad"
              placeholder="0,000"
              value={cantidad}
              onChange={(n) => setCantidad(n)}
              autoFocus
            />
            {cantidadNum > maxCantidad + 0.0005 && cantidadNum > 0 && (
              <p className="text-xs text-destructive">
                La cantidad no puede superar {formatNumber(maxCantidad)} {unit}
              </p>
            )}
          </div>

          {!isOutsidePlancha && isValid && (
            <div className="flex gap-2.5 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-800/40 dark:bg-sky-900/20 dark:text-sky-300">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                La fecha cae dentro del período de plancha (hasta el{" "}
                {formatDate(fechaFinPlancha)}): la mercancía no llegó a salir del
                almacén, así que no se crea entrada de stock y la salida
                automática de fin de plancha se reduce en esta cantidad.
              </p>
            </div>
          )}

          {isOutsidePlancha && isValid && (
            <div className="flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                El período de plancha ha finalizado. Se creará automáticamente
                una <strong>entrada de stock</strong> por esta cantidad con fecha{" "}
                <strong>{formatDate(fecha)}</strong> (plancha 1 día, sin proveedor) con el comentario:{" "}
                <em>&ldquo;Desaplicacion cliente nº pta {puestaRef}&rdquo;</em>
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !isValid}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Desaplicar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
