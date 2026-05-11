"use client";

import { useState, useCallback, useEffect } from "react";
import { Plus, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SuppliersService } from "@/services/suppliers.service";
import type { Supplier } from "@/types";
import type { SupplierFormValues } from "@/validations/supplier.schema";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { SupplierForm } from "@/modules/suppliers/components/supplier-form";
import { getSupplierColumns } from "@/modules/suppliers/components/supplier-columns";
import { toast } from "@/hooks/use-toast";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const service = new SuppliersService(createClient());

  const loadSuppliers = useCallback(async () => {
    setIsLoading(true);
    const result = await service.getAll({ sortBy: "name", sortOrder: "asc" });
    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error });
    } else {
      setSuppliers(result.data?.data ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  async function handleCreate(values: SupplierFormValues) {
    setIsSaving(true);
    const result = await service.create(values);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al crear", description: result.error });
    } else {
      toast({ title: "Proveedor creado correctamente" });
      setFormOpen(false);
      await loadSuppliers();
    }
    setIsSaving(false);
  }

  async function handleUpdate(values: SupplierFormValues) {
    if (!editingSupplier) return;
    setIsSaving(true);
    const result = await service.update(editingSupplier.id, values);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al actualizar", description: result.error });
    } else {
      toast({ title: "Proveedor actualizado correctamente" });
      setFormOpen(false);
      setEditingSupplier(null);
      await loadSuppliers();
    }
    setIsSaving(false);
  }

  async function handleDelete(id: string) {
    const result = await service.delete(id);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al eliminar", description: result.error });
    } else {
      toast({ title: "Proveedor eliminado" });
      await loadSuppliers();
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    const result = await service.toggleActive(id, active);
    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error });
    } else {
      await loadSuppliers();
    }
  }

  const columns = getSupplierColumns(
    (s) => { setEditingSupplier(s); setFormOpen(true); },
    handleDelete,
    handleToggleActive
  );

  return (
    <>
      <PageHeader
        title="Proveedores"
        description="Gestiona los proveedores de mercancía"
        actions={
          <Button onClick={() => { setEditingSupplier(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />Nuevo proveedor
          </Button>
        }
      />
      {!isLoading && suppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No hay proveedores"
          description="Crea proveedores para asignarlos a las entradas de mercancía."
          action={{ label: "Crear proveedor", onClick: () => setFormOpen(true) }}
        />
      ) : (
        <DataTable columns={columns} data={suppliers} searchKey="name" searchPlaceholder="Buscar proveedor..." isLoading={isLoading} />
      )}
      <SupplierForm
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingSupplier(null); }}
        onSubmit={editingSupplier ? handleUpdate : handleCreate}
        isLoading={isSaving}
        defaultValues={editingSupplier ?? undefined}
      />
    </>
  );
}
