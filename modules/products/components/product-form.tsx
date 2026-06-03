"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, X } from "lucide-react";
import { productSchema, type ProductFormValues } from "@/validations/product.schema";
import type { Product } from "@/types";
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
import { cn } from "@/lib/utils";

const PRODUCT_ICONS = [
  "🌾", "🌽", "🌻", "🫛", "🌿", "🌱",
  "🫘", "🌰", "🍃", "🎋", "🌴", "🌵",
  "🍊", "🍋", "🫐", "🍇", "🍅", "🥬",
];

interface ProductFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  isLoading?: boolean;
  defaultValues?: Product;
}

export function ProductForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  defaultValues,
}: ProductFormProps) {
  const isEditing = !!defaultValues;

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { code: "", name: "", unit: "ud", active: true, icon: null, bg_image_url: null },
  });

  const bgUrl = form.watch("bg_image_url");

  useEffect(() => {
    if (open) {
      if (defaultValues) {
        form.reset({
          code: defaultValues.code,
          name: defaultValues.name,
          unit: defaultValues.unit,
          active: defaultValues.active,
          icon: defaultValues.icon ?? null,
          bg_image_url: defaultValues.bg_image_url ?? null,
        });
      } else {
        form.reset({ code: "", name: "", unit: "ud", active: true, icon: null, bg_image_url: null });
      }
    }
  }, [open, defaultValues, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifica los datos del producto." : "Completa los datos del nuevo producto."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="PROD-001"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        disabled={isEditing}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidad *</FormLabel>
                    <FormControl>
                      <Input placeholder="ud, tn, caja..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl>
                    <Input placeholder="Trigo Granel" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Icono ── */}
            <FormField
              control={form.control}
              name="icon"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between mb-1.5">
                    <FormLabel className="mb-0">Icono del producto</FormLabel>
                    {field.value && (
                      <button
                        type="button"
                        onClick={() => field.onChange(null)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-3 w-3" />
                        Quitar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-9 gap-1.5">
                    {PRODUCT_ICONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => field.onChange(field.value === emoji ? null : emoji)}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-md border text-lg transition-all select-none",
                          field.value === emoji
                            ? "border-violet-500 bg-violet-100 dark:bg-violet-900/40 ring-1 ring-violet-500"
                            : "border-border bg-muted/40 hover:border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                        )}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <FormDescription className="mt-1.5">
                    Se muestra en la fila del producto en el dashboard.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Imagen de fondo ── */}
            <FormField
              control={form.control}
              name="bg_image_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Imagen de fondo (dashboard)</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        placeholder="/products/trigo.jpg  ó  https://..."
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    {field.value && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => field.onChange(null)}
                        className="shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {bgUrl && (
                    <div className="mt-2 h-16 w-full rounded-md overflow-hidden border bg-muted">
                      <img
                        src={bgUrl}
                        alt="preview fondo"
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.opacity = "0.3";
                        }}
                      />
                    </div>
                  )}
                  <FormDescription>
                    Aparece de fondo en la zona central de la fila. Usa{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">
                      /products/nombre.jpg
                    </code>{" "}
                    para imágenes propias subidas al proyecto.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Activo</FormLabel>
                    <FormDescription>
                      Los productos inactivos no aparecen en los movimientos
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Guardar cambios" : "Crear producto"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
