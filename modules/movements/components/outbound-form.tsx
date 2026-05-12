"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Info } from "lucide-react";
import { outboundSchema, type OutboundFormValues } from "@/validations/outbound.schema";
import type { Warehouse, Product, Customer } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getCostStartDate } from "@/utils/calculations";
import { formatDate } from "@/utils/format";

interface OutboundFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: OutboundFormValues) => Promise<void>;
  isLoading?: boolean;
  warehouses: Warehouse[];
  products: Product[];
  customers: Customer[];
}

export function OutboundForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  warehouses,
  products,
  customers,
}: OutboundFormProps) {
  const form = useForm<OutboundFormValues>({
    resolver: zodResolver(outboundSchema),
    defaultValues: {
      warehouse_id: "",
      product_id: "",
      customer_id: null,
      quantity: 0,
      movement_date: new Date().toISOString().split("T")[0],
      free_days: 0,
      comments: "",
    },
  });

  const [costStartDate, setCostStartDate] = useState<string | null>(null);
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
    if (!open) {
      form.reset({
        warehouse_id: "",
        product_id: "",
        customer_id: null,
        quantity: 0,
        movement_date: new Date().toISOString().split("T")[0],
        free_days: 0,
        comments: "",
      });
      setCostStartDate(null);
    }
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Nueva salida de mercancía</DialogTitle>
          <DialogDescription>
            Registra la salida de mercancía del almacén. Se validará el stock disponible.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <FormField
              control={form.control}
              name="customer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                    value={field.value ?? "none"}
                  >
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Sin cliente asignado" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Sin cliente</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
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
                    <FormLabel>Fecha de salida *</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
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
                        Días desde la salida SIN descontar del stock para el coste.
                        La mercancía deja de generar coste a partir del día siguiente al vencimiento.
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
                      La mercancía dejará de computar en el stock el <strong>{costStartDate}</strong>
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
                    <Input placeholder="Albarán nº 12345, destino..." {...field} value={field.value ?? ""} />
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
