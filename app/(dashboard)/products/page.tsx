"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Plus, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProductsService } from "@/services/products.service";
import type { Product } from "@/types";
import type { ProductFormValues } from "@/validations/product.schema";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ProductForm } from "@/modules/products/components/product-form";
import { getProductColumns } from "@/modules/products/components/product-columns";
import { toast } from "@/hooks/use-toast";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductActive,
} from "./actions";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const service = useMemo(() => new ProductsService(createClient()), []);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    const result = await service.getAll({ sortBy: "name", sortOrder: "asc" });
    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error });
    } else {
      setProducts(result.data?.data ?? []);
    }
    setIsLoading(false);
  }, [service]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  async function handleCreate(values: ProductFormValues) {
    setIsSaving(true);
    const result = await createProduct(values);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al crear", description: result.error });
    } else {
      toast({ title: "Producto creado correctamente" });
      setFormOpen(false);
      await loadProducts();
    }
    setIsSaving(false);
  }

  async function handleUpdate(values: ProductFormValues) {
    if (!editingProduct) return;
    setIsSaving(true);
    const result = await updateProduct(editingProduct.id, values);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al actualizar", description: result.error });
    } else {
      toast({ title: "Producto actualizado correctamente" });
      setFormOpen(false);
      setEditingProduct(null);
      await loadProducts();
    }
    setIsSaving(false);
  }

  async function handleDelete(id: string) {
    const result = await deleteProduct(id);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al eliminar", description: result.error });
    } else {
      toast({ title: "Producto eliminado correctamente" });
      await loadProducts();
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    const result = await toggleProductActive(id, active);
    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error });
    } else {
      toast({ title: active ? "Producto activado" : "Producto desactivado" });
      await loadProducts();
    }
  }

  const columns = getProductColumns(
    (p) => { setEditingProduct(p); setFormOpen(true); },
    handleDelete,
    handleToggleActive
  );

  return (
    <>
      <PageHeader
        title="Productos"
        description="Gestiona los productos con sus precios de almacenaje diario"
        actions={
          <Button onClick={() => { setEditingProduct(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo producto
          </Button>
        }
      />

      {!isLoading && products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No hay productos"
          description="Crea productos para gestionar sus costes de almacenaje."
          action={{ label: "Crear producto", onClick: () => setFormOpen(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={products}
          searchKey="name"
          searchPlaceholder="Buscar producto..."
          isLoading={isLoading}
        />
      )}

      <ProductForm
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingProduct(null); }}
        onSubmit={editingProduct ? handleUpdate : handleCreate}
        isLoading={isSaving}
        defaultValues={editingProduct ?? undefined}
      />
    </>
  );
}
