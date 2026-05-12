"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Plus, Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WarehousesService } from "@/services/warehouses.service";
import type { Warehouse as WarehouseType } from "@/types";
import type { WarehouseFormValues } from "@/validations/warehouse.schema";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { WarehouseForm } from "@/modules/warehouses/components/warehouse-form";
import { getWarehouseColumns } from "@/modules/warehouses/components/warehouse-columns";
import { toast } from "@/hooks/use-toast";

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] =
    useState<WarehouseType | null>(null);

  const service = useMemo(() => new WarehousesService(createClient()), []);

  const loadWarehouses = useCallback(async () => {
    setIsLoading(true);
    const result = await service.getAll({ sortBy: "name", sortOrder: "asc" });
    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error });
    } else {
      setWarehouses(result.data?.data ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  async function handleCreate(values: WarehouseFormValues) {
    setIsSaving(true);
    const result = await service.create(values);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al crear", description: result.error });
    } else {
      toast({ title: "Almacén creado correctamente" });
      setFormOpen(false);
      await loadWarehouses();
    }
    setIsSaving(false);
  }

  async function handleUpdate(values: WarehouseFormValues) {
    if (!editingWarehouse) return;
    setIsSaving(true);
    const result = await service.update(editingWarehouse.id, values);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al actualizar", description: result.error });
    } else {
      toast({ title: "Almacén actualizado correctamente" });
      setFormOpen(false);
      setEditingWarehouse(null);
      await loadWarehouses();
    }
    setIsSaving(false);
  }

  async function handleDelete(id: string) {
    const result = await service.delete(id);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al eliminar", description: result.error });
    } else {
      toast({ title: "Almacén eliminado correctamente" });
      await loadWarehouses();
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    const result = await service.toggleActive(id, active);
    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error });
    } else {
      toast({ title: active ? "Almacén activado" : "Almacén desactivado" });
      await loadWarehouses();
    }
  }

  function handleEdit(warehouse: WarehouseType) {
    setEditingWarehouse(warehouse);
    setFormOpen(true);
  }

  function handleOpenCreate() {
    setEditingWarehouse(null);
    setFormOpen(true);
  }

  const columns = getWarehouseColumns(
    handleEdit,
    handleDelete,
    handleToggleActive
  );

  return (
    <>
      <PageHeader
        title="Almacenes"
        description="Gestiona los almacenes disponibles en el sistema"
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo almacén
          </Button>
        }
      />

      {!isLoading && warehouses.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="No hay almacenes"
          description="Crea el primer almacén para empezar a gestionar entradas y salidas."
          action={{ label: "Crear almacén", onClick: handleOpenCreate }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={warehouses}
          searchKey="name"
          searchPlaceholder="Buscar almacén..."
          isLoading={isLoading}
        />
      )}

      <WarehouseForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingWarehouse(null);
        }}
        onSubmit={editingWarehouse ? handleUpdate : handleCreate}
        isLoading={isSaving}
        defaultValues={editingWarehouse ?? undefined}
      />
    </>
  );
}
