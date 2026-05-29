"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Info, Search, ChevronsUpDown, Check, X } from "lucide-react";
import { puestaSchema, type PuestaFormValues } from "@/validations/puesta.schema";
import type { PuestaADisposicion, Warehouse, Product, Customer } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormControl, FormDescription, FormField,
  FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/utils/format";
import { addDays, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface PuestaFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PuestaFormValues) => Promise<void>;
  isLoading?: boolean;
  defaultValues?: PuestaADisposicion;
  warehouses: Warehouse[];
  products: Product[];
  customers: Customer[];
  presetWarehouseId?: string;
  presetWarehouseName?: string;
  presetProductId?: string;
  presetProductName?: string;
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-medium mb-1.5">{label}</p>
      <div className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-muted/60 px-3 text-sm">
        <span className="truncate text-foreground">{value}</span>
        <span className="text-[10px] text-muted-foreground ml-2 shrink-0 uppercase tracking-wide">Fijado</span>
      </div>
    </div>
  );
}

export function PuestaForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  defaultValues,
  warehouses,
  products,
  customers,
  presetWarehouseId,
  presetWarehouseName,
  presetProductId,
  presetProductName,
}: PuestaFormProps) {
  const isEditing = !!defaultValues;
  const [finPlancha, setFinPlancha] = useState<string | null>(null);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

  const form = useForm<PuestaFormValues>({
    resolver: zodResolver(puestaSchema),
    defaultValues: {
      numero_contrato: "",
      customer_id: null,
      product_id: "",
      warehouse_id: "",
      cantidad_inicial: undefined as unknown as number,
      fecha_puesta: new Date().toISOString().split("T")[0],
      dias_plancha: undefined as unknown as number,
      estado: "abierta",
      comentarios: "",
    },
  });

  const fechaPuesta = form.watch("fecha_puesta");
  const diasPlancha = form.watch("dias_plancha");

  useEffect(() => {
    if (fechaPuesta && diasPlancha !== undefined && diasPlancha >= 0) {
      try {
        const d = addDays(parseISO(fechaPuesta), diasPlancha);
        setFinPlancha(d.toISOString().split("T")[0]);
      } catch {
        setFinPlancha(null);
      }
    } else {
      setFinPlancha(null);
    }
  }, [fechaPuesta, diasPlancha]);

  useEffect(() => {
    if (open) {
      setCustomerSearch("");
      if (defaultValues) {
        form.reset({
          numero_contrato: defaultValues.numero_contrato ?? "",
          customer_id: defaultValues.customer_id ?? null,
          product_id: defaultValues.product_id,
          warehouse_id: defaultValues.warehouse_id,
          cantidad_inicial: defaultValues.cantidad_inicial,
          fecha_puesta: defaultValues.fecha_puesta,
          dias_plancha: defaultValues.dias_plancha,
          estado: defaultValues.estado,
          comentarios: defaultValues.comentarios ?? "",
        });
      } else {
        form.reset({
          numero_contrato: "",
          customer_id: null,
          product_id: presetProductId ?? "",
          warehouse_id: presetWarehouseId ?? "",
          cantidad_inicial: undefined as unknown as number,
          fecha_puesta: new Date().toISOString().split("T")[0],
          dias_plancha: undefined as unknown as number,
          estado: "abierta",
          comentarios: "",
        });
      }
    }
  }, [open, defaultValues, form, presetWarehouseId, presetProductId]);

  const activeCustomers = customers.filter((c) => c.active);
  const filteredCustomers = activeCustomers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.codigo && c.codigo.toLowerCase().includes(customerSearch.toLowerCase()))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar puesta a disposición" : "Nueva puesta a disposición"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifica los datos del contrato de disposición."
              : "Registra un nuevo lote de mercancía puesto a disposición del cliente."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Número de contrato */}
            <FormField
              control={form.control}
              name="numero_contrato"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de contrato / referencia</FormLabel>
                  <FormControl>
                    <Input placeholder="D02503627_40-1" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Cliente — Combobox buscable */}
            <FormField
              control={form.control}
              name="customer_id"
              render={({ field }) => {
                const selected = activeCustomers.find((c) => c.id === field.value);
                return (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <div className="flex gap-2">
                      <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              type="button"
                              className={cn(
                                "flex-1 justify-between font-normal",
                                !selected && "text-muted-foreground"
                              )}
                            >
                              <span className="truncate">
                                {selected
                                  ? `${selected.codigo ? `[${selected.codigo}] ` : ""}${selected.name}`
                                  : "Seleccionar cliente (opcional)"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[420px] p-0" align="start">
                          <div className="p-2 border-b">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                className="pl-8 h-8 text-sm"
                                placeholder="Buscar cliente por nombre o código..."
                                value={customerSearch}
                                onChange={(e) => setCustomerSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                          </div>
                          <ScrollArea className="max-h-56">
                            <div className="p-1">
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent text-muted-foreground"
                                onClick={() => {
                                  field.onChange(null);
                                  setCustomerPopoverOpen(false);
                                  setCustomerSearch("");
                                }}
                              >
                                Sin cliente asignado
                              </button>
                              {filteredCustomers.length === 0 ? (
                                <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                              ) : (
                                filteredCustomers.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent flex items-center gap-2"
                                    onClick={() => {
                                      field.onChange(c.id);
                                      setCustomerPopoverOpen(false);
                                      setCustomerSearch("");
                                    }}
                                  >
                                    <Check className={cn("h-3.5 w-3.5 shrink-0", field.value === c.id ? "opacity-100" : "opacity-0")} />
                                    <span className="flex-1 truncate">
                                      {c.codigo && <span className="font-mono text-xs text-muted-foreground mr-1.5">[{c.codigo}]</span>}
                                      {c.name}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>
                      {field.value && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => field.onChange(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* Producto + Almacén */}
            <div className="grid grid-cols-2 gap-4">
              {presetProductId && !defaultValues ? (
                <LockedField label="Producto *" value={presetProductName ?? presetProductId} />
              ) : (
                <FormField
                  control={form.control}
                  name="product_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Producto *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {products.filter((p) => p.active).map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {presetWarehouseId && !defaultValues ? (
                <LockedField label="Almacén *" value={presetWarehouseName ?? presetWarehouseId} />
              ) : (
                <FormField
                  control={form.control}
                  name="warehouse_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Almacén *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {warehouses.filter((w) => w.active).map((w) => (
                            <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Cantidad + Fecha */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cantidad_inicial"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad inicial *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        placeholder="Ej: 100.000"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fecha_puesta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de puesta *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Días de plancha */}
            <FormField
              control={form.control}
              name="dias_plancha"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    Días de plancha *
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Días desde la fecha de puesta sin generar coste de almacenaje. El coste
                        empieza el día siguiente al vencimiento del período de plancha.
                      </TooltipContent>
                    </Tooltip>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max="365"
                      step="1"
                      placeholder="Ej: 7"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === "" ? undefined : parseInt(e.target.value)
                        )
                      }
                    />
                  </FormControl>
                  {finPlancha && (
                    <FormDescription>
                      Fin de plancha: <strong>{formatDate(finPlancha)}</strong> — el coste empieza el{" "}
                      <strong>
                        {formatDate(
                          addDays(parseISO(finPlancha), 1).toISOString().split("T")[0]
                        )}
                      </strong>
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Estado (solo en edición) */}
            {isEditing && (
              <FormField
                control={form.control}
                name="estado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="abierta">Abierta</SelectItem>
                        <SelectItem value="finalizada">Finalizada</SelectItem>
                        <SelectItem value="cerrada_manual">Cerrada manualmente</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Comentarios */}
            <FormField
              control={form.control}
              name="comentarios"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comentarios</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Observaciones adicionales..."
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
                {isEditing ? "Guardar cambios" : "Crear puesta"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
