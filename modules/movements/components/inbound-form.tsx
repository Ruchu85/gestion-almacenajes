"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Info, Search, ChevronsUpDown, Check, X } from "lucide-react";
import { inboundSchema, type InboundFormValues } from "@/validations/inbound.schema";
import type { Warehouse, Product, Supplier } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { getCostStartDate } from "@/utils/calculations";
import { formatDate } from "@/utils/format";
import { cn } from "@/lib/utils";

interface InboundFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InboundFormValues) => Promise<void>;
  isLoading?: boolean;
  warehouses: Warehouse[];
  products: Product[];
  suppliers: Supplier[];
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

export function InboundForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  warehouses,
  products,
  suppliers,
  presetWarehouseId,
  presetWarehouseName,
  presetProductId,
  presetProductName,
}: InboundFormProps) {
  const form = useForm<InboundFormValues>({
    resolver: zodResolver(inboundSchema),
    defaultValues: {
      warehouse_id: "",
      product_id: "",
      supplier_id: null,
      quantity: 0,
      movement_date: new Date().toISOString().split("T")[0],
      free_days: 0,
      comments: "",
    },
  });

  const [costStartDate, setCostStartDate] = useState<string | null>(null);
  const [supplierPopoverOpen, setSupplierPopoverOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");

  const movementDate = form.watch("movement_date");
  const freeDays = form.watch("free_days");

  useEffect(() => {
    if (movementDate && freeDays >= 0) {
      try {
        const date = getCostStartDate(movementDate, freeDays);
        setCostStartDate(formatDate(date));
      } catch {
        setCostStartDate(null);
      }
    }
  }, [movementDate, freeDays]);

  useEffect(() => {
    if (open) {
      setSupplierSearch("");
      if (presetWarehouseId) form.setValue("warehouse_id", presetWarehouseId);
      if (presetProductId) form.setValue("product_id", presetProductId);
    } else {
      form.reset({
        warehouse_id: presetWarehouseId ?? "",
        product_id: presetProductId ?? "",
        supplier_id: null,
        quantity: 0,
        movement_date: new Date().toISOString().split("T")[0],
        free_days: 0,
        comments: "",
      });
    }
  }, [open, form, presetWarehouseId, presetProductId]);

  const activeSuppliers = suppliers.filter((s) => s.active);
  const filteredSuppliers = activeSuppliers.filter((s) =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.codigo && s.codigo.toLowerCase().includes(supplierSearch.toLowerCase()))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Nueva entrada de mercancía</DialogTitle>
          <DialogDescription>
            Registra la entrada de mercancía al almacén con sus días de plancha.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {presetWarehouseId ? (
                <LockedField label="Almacén *" value={presetWarehouseName ?? presetWarehouseId} />
              ) : (
                <FormField
                  control={form.control}
                  name="warehouse_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Almacén *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar almacén" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {warehouses.map((w) => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.code} — {w.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {presetProductId ? (
                <LockedField label="Producto *" value={presetProductName ?? presetProductId} />
              ) : (
                <FormField
                  control={form.control}
                  name="product_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Producto *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar producto" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.code} — {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Proveedor — Combobox buscable */}
            <FormField
              control={form.control}
              name="supplier_id"
              render={({ field }) => {
                const selected = activeSuppliers.find((s) => s.id === field.value);
                return (
                  <FormItem>
                    <FormLabel>Proveedor</FormLabel>
                    <div className="flex gap-2">
                      <Popover open={supplierPopoverOpen} onOpenChange={setSupplierPopoverOpen}>
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
                                  : "Sin proveedor asignado"}
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
                                placeholder="Buscar proveedor por nombre o código..."
                                value={supplierSearch}
                                onChange={(e) => setSupplierSearch(e.target.value)}
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
                                  setSupplierPopoverOpen(false);
                                  setSupplierSearch("");
                                }}
                              >
                                Sin proveedor
                              </button>
                              {filteredSuppliers.length === 0 ? (
                                <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                              ) : (
                                filteredSuppliers.map((s) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent flex items-center gap-2"
                                    onClick={() => {
                                      field.onChange(s.id);
                                      setSupplierPopoverOpen(false);
                                      setSupplierSearch("");
                                    }}
                                  >
                                    <Check className={cn("h-3.5 w-3.5 shrink-0", field.value === s.id ? "opacity-100" : "opacity-0")} />
                                    <span className="flex-1 truncate">
                                      {s.codigo && <span className="font-mono text-xs text-muted-foreground mr-1.5">[{s.codigo}]</span>}
                                      {s.name}
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        min="0.001"
                        placeholder="0.000"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="movement_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de entrada *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="free_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    Días de plancha
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Días desde la entrada SIN generar coste de almacenaje.
                        A partir del día siguiente se factura el almacenaje diario.
                      </TooltipContent>
                    </Tooltip>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max="365"
                      step="1"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  {costStartDate && (
                    <FormDescription>
                      Los costes empezarán a generarse el <strong>{costStartDate}</strong>
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="comments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comentarios</FormLabel>
                  <FormControl>
                    <Input placeholder="Albarán nº 12345, referencia..." {...field} value={field.value ?? ""} />
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
                Registrar entrada
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
