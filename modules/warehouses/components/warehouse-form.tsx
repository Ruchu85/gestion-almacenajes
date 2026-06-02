"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { warehouseSchema, type WarehouseFormValues } from "@/validations/warehouse.schema";
import type { Warehouse } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
}

export function WarehouseForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  defaultValues,
}: WarehouseFormProps) {
  const isEditing = !!defaultValues;

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
    }
  }, [open, defaultValues, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
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

            <FormField
              control={form.control}
              name="storage_daily_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Precio de almacenaje diario (€) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="0.0001"
                      placeholder="0.0000"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Coste por unidad de mercancía almacenada por día en este almacén
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                        {PROVINCIAS_ESPANA.map((p) => (
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
