"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Euro,
} from "lucide-react";
import { DecimalInput } from "@/components/ui/decimal-input";
import { warehouseSchema, type WarehouseFormValues } from "@/validations/warehouse.schema";
import type { Warehouse, WarehousePriceHistory } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/utils/format";
import { cn } from "@/lib/utils";

const PROVINCIAS_ESPANA = [
  "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila",
  "Badajoz", "Baleares", "Barcelona", "Burgos",
  "Cáceres", "Cádiz", "Cantabria", "Castellón", "Ciudad Real", "Córdoba", "A Coruña", "Cuenca",
  "Girona", "Granada", "Guadalajara", "Gipuzkoa",
  "Huelva", "Huesca",
  "Jaén",
  "La Rioja", "Las Palmas", "León", "Lleida", "Lugo",
  "Madrid", "Málaga", "Murcia",
  "Navarra",
  "Ourense",
  "Palencia", "Pontevedra",
  "Salamanca", "Santa Cruz de Tenerife", "Segovia", "Sevilla", "Soria",
  "Tarragona", "Teruel", "Toledo",
  "Valencia", "Valladolid", "Bizkaia",
  "Zamora", "Zaragoza",
  "Ceuta", "Melilla",
  // Puertos / posiciones específicas
  "Avilés", "Gijón", "Marín", "Villagarcía",
];

interface WarehouseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: WarehouseFormValues) => Promise<void>;
  isLoading?: boolean;
  defaultValues?: Warehouse;
  // Price history (only relevant in edit mode)
  priceHistory?: WarehousePriceHistory[];
  isPriceHistoryLoading?: boolean;
  onPriceChange?: (price: number, effectiveFrom: string) => Promise<void>;
}

export function WarehouseForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  defaultValues,
  priceHistory = [],
  isPriceHistoryLoading = false,
  onPriceChange,
}: WarehouseFormProps) {
  const isEditing = !!defaultValues;
  const today = new Date().toISOString().split("T")[0];

  const [showPriceSection, setShowPriceSection] = useState(false);
  const [newPrice, setNewPrice] = useState<number | null>(null);
  const [newPriceDate, setNewPriceDate] = useState(today);
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [priceError, setPriceError] = useState("");

  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      code: "",
      name: "",
      address: "",
      posicion_cerrada: null,
      storage_daily_price: 0,
      active: true,
    },
  });

  useEffect(() => {
    if (open) {
      if (defaultValues) {
        form.reset({
          code: defaultValues.code,
          name: defaultValues.name,
          address: defaultValues.address ?? "",
          posicion_cerrada: defaultValues.posicion_cerrada ?? null,
          storage_daily_price: Number(defaultValues.storage_daily_price ?? 0),
          active: defaultValues.active,
        });
      } else {
        form.reset({ code: "", name: "", address: "", posicion_cerrada: null, storage_daily_price: 0, active: true });
      }
      setShowPriceSection(false);
      setNewPrice(null);
      setNewPriceDate(today);
      setPriceError("");
    }
  }, [open, defaultValues, form, today]);

  async function handleSavePrice() {
    const price = newPrice ?? NaN;
    if (isNaN(price) || price < 0) {
      setPriceError("Introduce un precio válido (≥ 0)");
      return;
    }
    if (!newPriceDate) {
      setPriceError("La fecha de aplicación es obligatoria");
      return;
    }
    setPriceError("");
    setIsSavingPrice(true);
    await onPriceChange?.(price, newPriceDate);
    setIsSavingPrice(false);
    setNewPrice(null);
    setNewPriceDate(today);
    setShowPriceSection(false);
  }

  const currentPrice = defaultValues?.storage_daily_price ?? 0;
  const isPastDate = newPriceDate && newPriceDate <= today && newPrice !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-[540px]", isEditing && showPriceSection && "sm:max-w-[600px]")}>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar almacén" : "Nuevo almacén"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifica los datos del almacén seleccionado."
              : "Completa los datos para crear un nuevo almacén."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ALM-01"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      disabled={isEditing}
                    />
                  </FormControl>
                  <FormDescription>
                    Identificador único del almacén (no modificable tras creación)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl>
                    <Input placeholder="Almacén Central Madrid" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Precio: campo editable en CREATE, display + historial en EDIT */}
            {!isEditing ? (
              <FormField
                control={form.control}
                name="storage_daily_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio de almacenaje diario (€) *</FormLabel>
                    <FormControl>
                      <DecimalInput
                        placeholder="0,0000"
                        value={field.value ?? null}
                        onChange={(n) => field.onChange(n)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormDescription>
                      Coste por unidad de mercancía almacenada por día
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                {/* Precio actual + botón */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Euro className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Precio de almacenaje</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums">
                      {currentPrice.toLocaleString("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} €/ud/día
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => setShowPriceSection((v) => !v)}
                    >
                      <TrendingUp className="h-3 w-3" />
                      Cambiar precio
                      {showPriceSection ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>

                {/* Sección expandible de historial + nuevo precio */}
                {showPriceSection && (
                  <div className="border-t border-border/60 pt-3 space-y-3">
                    {/* Historial */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Historial de precios</p>
                      {isPriceHistoryLoading ? (
                        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Cargando...
                        </div>
                      ) : priceHistory.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-1">Sin registros de historial</p>
                      ) : (
                        <div className="rounded-md border border-border/50 overflow-hidden">
                          <div className="grid grid-cols-[1fr_120px] text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40 px-3 py-1.5">
                            <span>Fecha de aplicación</span>
                            <span className="text-right">Precio</span>
                          </div>
                          {priceHistory.map((entry, idx) => (
                            <div
                              key={entry.id}
                              className={cn(
                                "grid grid-cols-[1fr_120px] px-3 py-1.5 text-xs",
                                idx === 0 ? "bg-blue-50/40 dark:bg-blue-950/20 font-medium" : "bg-transparent",
                                idx < priceHistory.length - 1 && "border-b border-border/30"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span>{formatDate(entry.effective_from)}</span>
                                {idx === 0 && (
                                  <Badge variant="outline" className="text-[9px] h-4 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
                                    Vigente
                                  </Badge>
                                )}
                              </div>
                              <span className="tabular-nums text-right">
                                {Number(entry.price).toLocaleString("es-ES", { minimumFractionDigits: 4 })} €
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Formulario nuevo precio */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nuevo precio</p>
                      <div className="grid grid-cols-[1fr_160px] gap-2">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Precio (€/ud/día)</label>
                          <DecimalInput
                            placeholder="0,0000"
                            className="h-8 text-sm"
                            value={newPrice}
                            onChange={(n) => setNewPrice(n)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Fecha de aplicación</label>
                          <Input
                            type="date"
                            className="h-8 text-sm"
                            value={newPriceDate}
                            onChange={(e) => setNewPriceDate(e.target.value)}
                          />
                        </div>
                      </div>

                      {isPastDate && newPrice && (
                        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>
                            La fecha es pasada o presente. Se recalcularán los costes de almacenaje
                            desde <strong>{formatDate(newPriceDate)}</strong> hasta hoy.
                          </span>
                        </div>
                      )}

                      {priceError && (
                        <p className="text-xs text-destructive">{priceError}</p>
                      )}

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={isSavingPrice || !newPrice || !newPriceDate}
                          onClick={handleSavePrice}
                        >
                          {isSavingPrice && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          {isSavingPrice
                            ? isPastDate ? "Recalculando costes..." : "Guardando..."
                            : "Guardar nuevo precio"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="posicion_cerrada"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Posición Cerrada</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(val === "__none__" ? null : val)}
                      value={field.value ?? "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar provincia" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-64">
                        <SelectItem value="__none__">
                          <span className="text-muted-foreground">— Sin asignar —</span>
                        </SelectItem>
                        {[...PROVINCIAS_ESPANA].sort((a, b) => a.localeCompare(b, "es")).map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Calle Industrial 15..."
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Activo</FormLabel>
                    <FormDescription>
                      Los almacenes inactivos no aparecen en los movimientos ni en el dashboard
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
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
                {isEditing ? "Guardar cambios" : "Crear almacén"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
