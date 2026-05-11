"use client";

import { useState, useCallback, useEffect } from "react";
import { Plus, ArrowDownToLine, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InboundMovementsService } from "@/services/movements.service";
import { WarehousesService } from "@/services/warehouses.service";
import { ProductsService } from "@/services/products.service";
import { SuppliersService } from "@/services/suppliers.service";
import type {
  InboundMovementWithRelations,
  Warehouse,
  Product,
  Supplier,
} from "@/types";
import type { InboundFormValues } from "@/validations/inbound.schema";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { InboundForm } from "@/modules/movements/components/inbound-form";
import { getInboundColumns } from "@/modules/movements/components/inbound-columns";
import { toast } from "@/hooks/use-toast";
import { exportToCSV, exportToExcel } from "@/utils/export";
import { formatDate, formatQuantity } from "@/utils/format";

export default function InboundMovementsPage() {
  const [movements, setMovements] = useState<InboundMovementWithRelations[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [userId, setUserId] = useState<string>("");

  const supabase = createClient();
  const movementsService = new InboundMovementsService(supabase);
  const warehousesService = new WarehousesService(supabase);
  const productsService = new ProductsService(supabase);
  const suppliersService = new SuppliersService(supabase);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [movResult, whResult, prResult, supResult, { data: { user } }] = await Promise.all([
      movementsService.getAll({}, { sortBy: "movement_date", sortOrder: "desc", pageSize: 100 }),
      warehousesService.getActive(),
      productsService.getActive(),
      suppliersService.getActive(),
      supabase.auth.getUser(),
    ]);

    if (movResult.error) {
      toast({ variant: "destructive", title: "Error al cargar", description: movResult.error });
    } else {
      setMovements(movResult.data?.data ?? []);
    }
    setWarehouses(whResult.data ?? []);
    setProducts(prResult.data ?? []);
    setSuppliers(supResult.data ?? []);
    if (user) setUserId(user.id);
    setIsLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCreate(values: InboundFormValues) {
    setIsSaving(true);
    const result = await movementsService.create(values, userId);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al registrar", description: result.error });
    } else {
      toast({ title: "Entrada registrada correctamente" });
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
      toast({ title: "Entrada eliminada" });
      await loadData();
    }
  }

  function handleExportCSV() {
    exportToCSV(
      movements.map((m) => ({
        fecha: formatDate(m.movement_date),
        almacen: `${m.warehouse.code} - ${m.warehouse.name}`,
        producto: `${m.product.code} - ${m.product.name}`,
        proveedor: m.supplier?.name ?? "",
        cantidad: m.quantity,
        unidad: m.product.unit,
        dias_plancha: m.free_days,
        comentarios: m.comments ?? "",
      })),
      [
        { key: "fecha", header: "Fecha" },
        { key: "almacen", header: "Almacén" },
        { key: "producto", header: "Producto" },
        { key: "proveedor", header: "Proveedor" },
        { key: "cantidad", header: "Cantidad" },
        { key: "unidad", header: "Unidad" },
        { key: "dias_plancha", header: "Días Plancha" },
        { key: "comentarios", header: "Comentarios" },
      ],
      { filename: "entradas" }
    );
  }

  const columns = getInboundColumns(handleDelete);

  return (
    <>
      <PageHeader
        title="Entradas de mercancía"
        description="Registro de todas las entradas al almacén"
        actions={
          <>
            <Button variant="outline" onClick={handleExportCSV} disabled={movements.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva entrada
            </Button>
          </>
        }
      />

      {!isLoading && movements.length === 0 ? (
        <EmptyState
          icon={ArrowDownToLine}
          title="No hay entradas registradas"
          description="Registra la primera entrada de mercancía al almacén."
          action={{ label: "Nueva entrada", onClick: () => setFormOpen(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={movements}
          isLoading={isLoading}
        />
      )}

      <InboundForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreate}
        isLoading={isSaving}
        warehouses={warehouses}
        products={products}
        suppliers={suppliers}
      />
    </>
  );
}
