"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WarehousesService } from "@/services/warehouses.service";
import { ProductsService } from "@/services/products.service";
import { CustomersService } from "@/services/customers.service";
import type {
  PuestaSummary, PuestaADisposicion,
  Warehouse, Product, Customer,
} from "@/types";
import type { PuestaFormValues } from "@/validations/puesta.schema";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { PuestaForm } from "@/modules/puestas/components/puesta-form";
import { getPuestaColumns } from "@/modules/puestas/components/puesta-columns";
import { toast } from "@/hooks/use-toast";
import {
  createPuesta,
  updatePuesta,
  deletePuesta,
  changePuestaEstado,
} from "./actions";

export default function PuestasPage() {
  const router = useRouter();

  const [summaries, setSummaries] = useState<PuestaSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPuesta, setEditingPuesta] = useState<PuestaADisposicion | null>(null);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const supabase = useMemo(() => createClient(), []);
  const warehousesService = useMemo(() => new WarehousesService(supabase), [supabase]);
  const productsService   = useMemo(() => new ProductsService(supabase), [supabase]);
  const customersService  = useMemo(() => new CustomersService(supabase), [supabase]);

  // Load select options once
  useEffect(() => {
    async function loadOptions() {
      const [wRes, pRes, cRes] = await Promise.all([
        warehousesService.getActive(),
        productsService.getActive(),
        customersService.getActive(),
      ]);
      setWarehouses(wRes.data ?? []);
      setProducts(pRes.data ?? []);
      setCustomers(cRes.data ?? []);
    }
    loadOptions();
  }, [warehousesService, productsService, customersService]);

  const loadSummaries = useCallback(async () => {
    setIsLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase.rpc("get_all_puestas_summary", {
      p_fecha: today,
    });
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      setSummaries((data ?? []) as PuestaSummary[]);
    }
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => { loadSummaries(); }, [loadSummaries]);

  async function handleCreate(values: PuestaFormValues) {
    setIsSaving(true);
    const result = await createPuesta(values);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al crear", description: result.error });
    } else {
      toast({ title: "Puesta a disposición creada" });
      setFormOpen(false);
      await loadSummaries();
    }
    setIsSaving(false);
  }

  async function handleUpdate(values: PuestaFormValues) {
    if (!editingPuesta) return;
    setIsSaving(true);
    const result = await updatePuesta(editingPuesta.id, values);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al actualizar", description: result.error });
    } else {
      toast({ title: "Puesta actualizada correctamente" });
      setFormOpen(false);
      setEditingPuesta(null);
      await loadSummaries();
    }
    setIsSaving(false);
  }

  async function handleDelete(id: string) {
    const result = await deletePuesta(id);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al eliminar", description: result.error });
    } else {
      toast({ title: "Puesta eliminada" });
      await loadSummaries();
    }
  }

  async function handleChangeEstado(
    id: string,
    estado: "abierta" | "finalizada" | "cerrada_manual"
  ) {
    const result = await changePuestaEstado(id, estado);
    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error });
    } else {
      const labels: Record<string, string> = {
        abierta: "Puesta reabierta",
        finalizada: "Puesta marcada como finalizada",
        cerrada_manual: "Puesta cerrada manualmente",
      };
      toast({ title: labels[estado] ?? "Estado actualizado" });
      await loadSummaries();
    }
  }

  function handleView(puesta: PuestaSummary) {
    router.push(`/puestas/${puesta.puesta_id}`);
  }

  async function handleEdit(puesta: PuestaSummary) {
    // Fetch full record to get FK ids for the form selects
    const { data, error } = await supabase
      .from("puestas_a_disposicion")
      .select("*")
      .eq("id", puesta.puesta_id)
      .single();
    if (error || !data) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo cargar la puesta" });
      return;
    }
    setEditingPuesta(data as PuestaADisposicion);
    setFormOpen(true);
  }

  const columns = getPuestaColumns(handleView, handleEdit, handleDelete, handleChangeEstado);

  return (
    <>
      <PageHeader
        title="Puestas a Disposición"
        description="Gestiona los lotes de mercancía puestos a disposición de clientes"
        actions={
          <Button onClick={() => { setEditingPuesta(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />Nueva puesta
          </Button>
        }
      />

      {!isLoading && summaries.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No hay puestas a disposición"
          description="Crea una puesta a disposición para registrar la entrega de mercancía a un cliente."
          action={{ label: "Nueva puesta", onClick: () => setFormOpen(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={summaries}
          searchKey="numero_contrato"
          searchPlaceholder="Buscar por contrato o cliente..."
          isLoading={isLoading}
        />
      )}

      <PuestaForm
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingPuesta(null); }}
        onSubmit={editingPuesta ? handleUpdate : handleCreate}
        isLoading={isSaving}
        defaultValues={editingPuesta ?? undefined}
        warehouses={warehouses}
        products={products}
        customers={customers}
      />
    </>
  );
}
