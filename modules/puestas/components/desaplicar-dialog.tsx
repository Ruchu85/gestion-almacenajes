"use client";

import { useState } from "react";
import { Loader2, Undo2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatNumber } from "@/utils/format";

interface DesaplicarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (cantidad: number) => Promise<void>;
  isLoading?: boolean;
  maxCantidad: number;
  unit: string;
  isOutsidePlancha: boolean;
  puestaRef: string;
}

export function DesaplicarDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  maxCantidad,
  unit,
  isOutsidePlancha,
  puestaRef,
}: DesaplicarDialogProps) {
  const [cantidad, setCantidad] = useState<number | null>(null);

  const cantidadNum = cantidad ?? 0;
  const isValid = cantidadNum > 0 && cantidadNum <= maxCantidad;

  function handleClose(open: boolean) {
    onOpenChange(open);
    if (!open) setCantidad(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    await onSubmit(cantidadNum);
    setCantidad(null);
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
            Máximo:{" "}
            <strong>
              {formatNumber(maxCantidad)} {unit}
            </strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            {cantidadNum > maxCantidad && cantidadNum > 0 && (
              <p className="text-xs text-destructive">
                La cantidad no puede superar {formatNumber(maxCantidad)} {unit}
              </p>
            )}
          </div>

          {isOutsidePlancha && isValid && (
            <div className="flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                El período de plancha ha finalizado. Se creará automáticamente
                una <strong>entrada de stock</strong> por esta cantidad
                (plancha 1 día, sin proveedor) con el comentario:{" "}
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
