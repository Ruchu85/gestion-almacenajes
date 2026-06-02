"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Plus, Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WarehousesService } from "@/services/warehouses.service";
import type { Warehouse as WarehouseType, WarehousePriceHistory } from "@/types";
import type { WarehouseFormValues } from "@/validations/warehouse.schema";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { WarehouseForm } from "@/modules/warehouses/components/warehouse-form";
import { getWarehouseColumns } from "@/modules/warehouses/components/warehouse-columns";
import { toast } from "@/hooks/use-toast";
import {
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  toggleWarehouseActive,
  getWarehousePriceHistory,
  addWarehousePriceEntry,
} from "./actions";

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseType | null>(null);
  const [priceHistory, setPriceHistory] = useState<WarehousePriceHistory[]>([]);
  const [isPriceHistoryLoading, setIsPriceHistoryLoading] = useState(false);

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
  }, [service]);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  async function handleCreate(values: WarehouseFormValues) {
    setIsSaving(true);
    const result = await createWarehouse(values);
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
    const result = await updateWarehouse(editingWarehouse.id, values);
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
    const result = await deleteWarehouse(id);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al eliminar", description: result.error });
    } else {
      toast({ title: "Almacén eliminado correctamente" });
      await loadWarehouses();
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    const result = await toggleWarehouseActive(id, active);
    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error });
    } else {
      toast({ title: active ? "Almacén activado" : "Almacén desactivado" });
      await loadWarehouses();
    }
  }

  async function handleEdit(warehouse: WarehouseType) {
    setEditingWarehouse(warehouse);
    setPriceHistory([]);
    setFormOpen(true);
    // Cargar historial de precios en paralelo
    setIsPriceHistoryLoading(true);
    const result = await getWarehousePriceHistory(warehouse.id);
    setPriceHistory(result.data ?? []);
    setIsPriceHistoryLoading(false);
  }

  async function handlePriceChange(price: number, effectiveFrom: string) {
    if (!editingWarehouse) return;
    const result = await addWarehousePriceEntry(editingWarehouse.id, price, effectiveFrom);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al cambiar precio", description: result.error });
      return;
    }
    if (result.recalculated) {
      toast({ title: "Precio actualizado y costes recalculados", description: `Los costes desde ${effectiveFrom} hasta hoy han sido recalculados con la nueva tarifa.` });
    } else {
      toast({ title: "Precio programado correctamente", description: `Se aplicará a partir del ${effectiveFrom}.` });
    }
    // Refrescar historial y lista de almacenes
    const histResult = await getWarehousePriceHistory(editingWarehouse.id);
    setPriceHistory(histResult.data ?? []);
    // Actualizar el warehouse editando con el precio más reciente
    const updated = (await service.getById(editingWarehouse.id)).data;
    if (updated) setEditingWarehouse(updated);
    await loadWarehouses();
  }

  function handleOpenCreate() {
    setEditingWarehouse(null);
    setPriceHistory([]);
    setFormOpen(true);
  }

  const columns = getWarehouseColumns(handleEdit, handleDelete, handleToggleActive);

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
          if (!open) {
            setEditingWarehouse(null);
            setPriceHistory([]);
          }
        }}
        onSubmit={editingWarehouse ? handleUpdate : handleCreate}
        isLoading={isSaving}
        defaultValues={editingWarehouse ?? undefined}
        priceHistory={priceHistory}
        isPriceHistoryLoading={isPriceHistoryLoading}
        onPriceChange={handlePriceChange}
      />
    </>
  );
}
