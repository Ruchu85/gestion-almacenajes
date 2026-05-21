"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { supplierSchema, type SupplierFormValues } from "@/validations/supplier.schema";
import type { Supplier } from "@/types";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SupplierFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: SupplierFormValues) => Promise<void>;
  isLoading?: boolean;
  defaultValues?: Supplier;
}

export function SupplierForm({ open, onOpenChange, onSubmit, isLoading = false, defaultValues }: SupplierFormProps) {
  const isEditing = !!defaultValues;
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: "", codigo: "", tax_id: "", comments: "", active: true },
  });

  useEffect(() => {
    if (open) {
      if (defaultValues) {
        form.reset({
          name: defaultValues.name,
          codigo: defaultValues.codigo ?? "",
          tax_id: defaultValues.tax_id ?? "",
          comments: defaultValues.comments ?? "",
          active: defaultValues.active,
        });
      } else {
        form.reset({ name: "", codigo: "", tax_id: "", comments: "", active: true });
      }
    }
  }, [open, defaultValues, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifica los datos del proveedor." : "Completa los datos del nuevo proveedor."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl><Input placeholder="Importaciones García S.L." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="codigo" render={({ field }) => (
                <FormItem>
                  <FormLabel>Código</FormLabel>
                  <FormControl><Input placeholder="PROV-001" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="tax_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>CIF/NIF</FormLabel>
                  <FormControl><Input placeholder="B12345678" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="comments" render={({ field }) => (
              <FormItem>
                <FormLabel>Comentarios</FormLabel>
                <FormControl><Input placeholder="Notas adicionales..." {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="active" render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Activo</FormLabel>
                  <FormDescription>Proveedores inactivos no aparecen en movimientos</FormDescription>
                </div>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Guardar cambios" : "Crear proveedor"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
