"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Plus, ArrowUpFromLine, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { OutboundMovementsService } from "@/services/movements.service";
import { WarehousesService } from "@/services/warehouses.service";
import { ProductsService } from "@/services/products.service";
import { CustomersService } from "@/services/customers.service";
import type {
  OutboundMovementWithRelations,
  Warehouse,
  Product,
  Customer,
} from "@/types";
import type { OutboundFormValues } from "@/validations/outbound.schema";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { OutboundForm } from "@/modules/movements/components/outbound-form";
import { getOutboundColumns } from "@/modules/movements/components/outbound-columns";
import { toast } from "@/hooks/use-toast";
import { exportToCSV } from "@/utils/export";
import { formatDate } from "@/utils/format";

export default function OutboundMovementsPage() {
  const [movements, setMovements] = useState<OutboundMovementWithRelations[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [userId, setUserId] = useState<string>("");

  const supabase = useMemo(() => createClient(), []);
  const movementsService = useMemo(() => new OutboundMovementsService(supabase), [supabase]);
  const warehousesService = useMemo(() => new WarehousesService(supabase), [supabase]);
  const productsService = useMemo(() => new ProductsService(supabase), [supabase]);
  const customersService = useMemo(() => new CustomersService(supabase), [supabase]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [movResult, whResult, prResult, custResult, { data: { user } }] = await Promise.all([
      movementsService.getAll({}, { sortBy: "movement_date", sortOrder: "desc", pageSize: 100 }),
      warehousesService.getActive(),
      productsService.getActive(),
      customersService.getActive(),
      supabase.auth.getUser(),
    ]);

    if (movResult.error) {
      toast({ variant: "destructive", title: "Error al cargar", description: movResult.error });
    } else {
      setMovements(movResult.data?.data ?? []);
    }
    setWarehouses(whResult.data ?? []);
    setProducts(prResult.data ?? []);
    setCustomers(custResult.data ?? []);
    if (user) setUserId(user.id);
    setIsLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCreate(values: OutboundFormValues) {
    setIsSaving(true);
    const result = await movementsService.create(values, userId);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al registrar", description: result.error });
    } else {
      toast({ title: "Salida registrada correctamente" });
      setFormOpen(false);
      await loadData();
    }
    setIsSaving(false);
  }

  async function handleDelete(id: string) {
    const result = await movementsService.delete(id);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al eliminar", description: result.error });
    } else {
      toast({ title: "Salida eliminada" });
      await loadData();
    }
  }

  function handleExportCSV() {
    exportToCSV(
      movements.map((m) => ({
        fecha: formatDate(m.movement_date),
        almacen: `${m.warehouse.code} - ${m.warehouse.name}`,
        producto: `${m.product.code} - ${m.product.name}`,
        cliente: m.customer?.name ?? "",
        cantidad: m.quantity,
        unidad: m.product.unit,
        comentarios: m.comments ?? "",
      })),
      [
        { key: "fecha", header: "Fecha" },
        { key: "almacen", header: "Almacén" },
        { key: "producto", header: "Producto" },
        { key: "cliente", header: "Cliente" },
        { key: "cantidad", header: "Cantidad" },
        { key: "unidad", header: "Unidad" },
        { key: "comentarios", header: "Comentarios" },
      ],
      { filename: "salidas" }
    );
  }

  const columns = getOutboundColumns(handleDelete);

  return (
    <>
      <PageHeader
        title="Salidas de mercancía"
        description="Registro de todas las salidas del almacén"
        actions={
          <>
            <Button variant="outline" onClick={handleExportCSV} disabled={movements.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva salida
            </Button>
          </>
        }
      />

      {!isLoading && movements.length === 0 ? (
        <EmptyState
          icon={ArrowUpFromLine}
          title="No hay salidas registradas"
          description="Las salidas se registran cuando la mercancía sale del almacén."
          action={{ label: "Nueva salida", onClick: () => setFormOpen(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={movements}
          isLoading={isLoading}
        />
      )}

      <OutboundForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreate}
        isLoading={isSaving}
        warehouses={warehouses}
        products={products}
        customers={customers}
      />
    </>
  );
}
