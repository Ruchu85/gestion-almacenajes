"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CustomersService } from "@/services/customers.service";
import type { Customer } from "@/types";
import type { CustomerFormValues } from "@/validations/customer.schema";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { CustomerForm } from "@/modules/customers/components/customer-form";
import { getCustomerColumns } from "@/modules/customers/components/customer-columns";
import { toast } from "@/hooks/use-toast";
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  toggleCustomerActive,
} from "./actions";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const service = useMemo(() => new CustomersService(createClient()), []);

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    const result = await service.getAll({ sortBy: "name", sortOrder: "asc" });
    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error });
    } else {
      setCustomers(result.data?.data ?? []);
    }
    setIsLoading(false);
  }, [service]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  async function handleCreate(values: CustomerFormValues) {
    setIsSaving(true);
    const result = await createCustomer(values);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al crear", description: result.error });
    } else {
      toast({ title: "Cliente creado correctamente" });
      setFormOpen(false);
      await loadCustomers();
    }
    setIsSaving(false);
  }

  async function handleUpdate(values: CustomerFormValues) {
    if (!editingCustomer) return;
    setIsSaving(true);
    const result = await updateCustomer(editingCustomer.id, values);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al actualizar", description: result.error });
    } else {
      toast({ title: "Cliente actualizado correctamente" });
      setFormOpen(false);
      setEditingCustomer(null);
      await loadCustomers();
    }
    setIsSaving(false);
  }

  async function handleDelete(id: string) {
    const result = await deleteCustomer(id);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al eliminar", description: result.error });
    } else {
      toast({ title: "Cliente eliminado" });
      await loadCustomers();
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    const result = await toggleCustomerActive(id, active);
    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error });
    } else {
      toast({ title: active ? "Cliente activado" : "Cliente desactivado" });
      await loadCustomers();
    }
  }

  const columns = getCustomerColumns(
    (c) => { setEditingCustomer(c); setFormOpen(true); },
    handleDelete,
    handleToggleActive
  );

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Gestiona los clientes a los que se despacha mercancía"
        actions={
          <Button onClick={() => { setEditingCustomer(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />Nuevo cliente
          </Button>
        }
      />
      {!isLoading && customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay clientes"
          description="Crea clientes para asignarlos a las salidas de mercancía."
          action={{ label: "Crear cliente", onClick: () => setFormOpen(true) }}
        />
      ) : (
        <DataTable columns={columns} data={customers} searchKey="name" searchPlaceholder="Buscar cliente..." isLoading={isLoading} />
      )}
      <CustomerForm
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingCustomer(null); }}
        onSubmit={editingCustomer ? handleUpdate : handleCreate}
        isLoading={isSaving}
        defaultValues={editingCustomer ?? undefined}
      />
    </>
  );
}
