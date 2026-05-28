"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { outboundSchema, type OutboundFormValues } from "@/validations/outbound.schema";
import type { Warehouse, Product } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MatriculaInput } from "@/components/shared/matricula-input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface OutboundFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: OutboundFormValues) => Promise<void>;
  isLoading?: boolean;
  warehouses: Warehouse[];
  products: Product[];
  /** customers kept in signature for backwards compat but not rendered */
  customers?: unknown[];
  matriculas?: string[];
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

export function OutboundForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  warehouses,
  products,
  matriculas = [],
  presetWarehouseId,
  presetWarehouseName,
  presetProductId,
  presetProductName,
}: OutboundFormProps) {
  const form = useForm<OutboundFormValues>({
    resolver: zodResolver(outboundSchema),
    defaultValues: {
      warehouse_id: presetWarehouseId ?? "",
      product_id: presetProductId ?? "",
      customer_id: null,
      quantity: undefined as unknown as number,
      movement_date: new Date().toISOString().split("T")[0],
      free_days: 0,
      comments: "",
      matricula: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (presetWarehouseId) form.setValue("warehouse_id", presetWarehouseId);
      if (presetProductId) form.setValue("product_id", presetProductId);
    } else {
      form.reset({
        warehouse_id: presetWarehouseId ?? "",
        product_id: presetProductId ?? "",
        customer_id: null,
        quantity: undefined as unknown as number,
        movement_date: new Date().toISOString().split("T")[0],
        free_days: 0,
        comments: "",
        matricula: "",
      });
    }
  }, [open, form, presetWarehouseId, presetProductId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nueva salida de mercancía</DialogTitle>
          <DialogDescription>
            Registra la salida de mercancía del almacén. Se validará el stock disponible.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Almacén + Producto */}
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
                          <SelectTrigger><SelectValue placeholder="Seleccionar almacén" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {warehouses.map((w) => (
                            <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
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
                          <SelectTrigger><SelectValue placeholder="Seleccionar producto" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
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
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        min="0.001"
                        placeholder="Introduce la cantidad"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? undefined : parseFloat(e.target.value)
                          )
                        }
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
                    <FormLabel>Fecha de salida *</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Matrícula */}
            <FormField
              control={form.control}
              name="matricula"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Matrícula</FormLabel>
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

            {/* Comentarios */}
            <FormField
              control={form.control}
              name="comments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comentarios</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Albarán nº 12345, destino..."
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
                Registrar salida
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
