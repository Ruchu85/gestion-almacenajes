"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, ArrowRightLeft, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatNumber } from "@/utils/format";
import type { Warehouse } from "@/types";

interface TraspassarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (destinoWarehouseId: string) => Promise<void>;
  isLoading?: boolean;
  currentWarehouseId: string;
  currentWarehouseName: string;
  cantidadPendiente: number;
  unit: string;
  fechaFinPlancha: string;   // "YYYY-MM-DD"
  isOutsidePlancha: boolean;
  puestaRef: string;
}

export function TraspassarDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  currentWarehouseId,
  currentWarehouseName,
  cantidadPendiente,
  unit,
  fechaFinPlancha,
  isOutsidePlancha,
  puestaRef,
}: TraspassarDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoadingWh, setIsLoadingWh] = useState(false);
  const [destino, setDestino] = useState("");

  // Calcular días de plancha que tendría la nueva puesta
  const today = new Date().toISOString().split("T")[0];
  const diasPlanchaRestantes = useMemo(() => {
    if (fechaFinPlancha <= today) return 0;
    const msDay = 1000 * 60 * 60 * 24;
    const fin = new Date(fechaFinPlancha + "T00:00:00Z").getTime();
    const hoy = new Date(today + "T00:00:00Z").getTime();
    return Math.round((fin - hoy) / msDay);
  }, [fechaFinPlancha, today]);

  useEffect(() => {
    if (!open) { setDestino(""); return; }
    setIsLoadingWh(true);
    supabase
      .from("warehouses")
      .select("*")
      .eq("active", true)
      .neq("id", currentWarehouseId)
      .order("name")
      .then(({ data }) => {
        setWarehouses((data ?? []) as Warehouse[]);
        setIsLoadingWh(false);
      });
  }, [open, supabase, currentWarehouseId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!destino) return;
    await onSubmit(destino);
    setDestino("");
  }

  const isValid = !!destino && cantidadPendiente > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            Traspasar puesta a disposición
          </DialogTitle>
          <DialogDescription>
            Traspaso de la puesta <strong>{puestaRef}</strong> desde{" "}
            <strong>{currentWarehouseName}</strong> a otro almacén.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Resumen de lo que ocurrirá */}
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5 text-sm">
            <p className="font-medium text-foreground">Se realizarán los siguientes movimientos:</p>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>
                Desaplicación de <strong className="text-foreground">{formatNumber(cantidadPendiente)} {unit}</strong>{" "}
                en el almacén origen.
              </li>
              {isOutsidePlancha && (
                <li>
                  Entrada de stock automática en el almacén origen
                  (plancha 1 día, sin proveedor) — por haber pasado el período de plancha.
                </li>
              )}
              <li>
                Nueva puesta a disposición en el almacén destino con{" "}
                <strong className="text-foreground">{formatNumber(cantidadPendiente)} {unit}</strong>,
                {diasPlanchaRestantes > 0 ? (
                  <> fecha de hoy y <strong className="text-foreground">{diasPlanchaRestantes} día{diasPlanchaRestantes !== 1 ? "s" : ""} de plancha</strong> restantes.</>
                ) : (
                  <> fecha de hoy y <strong className="text-foreground">0 días de plancha</strong> (el período ya venció).</>
                )}
              </li>
            </ul>
          </div>

          {/* Selector de almacén destino */}
          <div className="space-y-1.5">
            <Label htmlFor="destino-warehouse">Almacén destino *</Label>
            {isLoadingWh ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Cargando almacenes...
              </div>
            ) : (
              <Select value={destino} onValueChange={setDestino}>
                <SelectTrigger id="destino-warehouse">
                  <SelectValue placeholder="Seleccionar almacén destino..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      No hay otros almacenes activos
                    </SelectItem>
                  ) : (
                    warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Aviso si hay plancha pasada */}
          {isOutsidePlancha && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                El período de plancha ya venció. Se generará una entrada de stock automática
                de {formatNumber(cantidadPendiente)} {unit} en el almacén origen.
              </span>
            </div>
          )}

          {cantidadPendiente <= 0 && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              No hay cantidad pendiente para traspasar.
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !isValid}
              className="gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-4 w-4" />
              )}
              {isLoading ? "Traspasando..." : "Confirmar traspaso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
