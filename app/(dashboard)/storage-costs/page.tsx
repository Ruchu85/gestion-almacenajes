"use client";

import { useState, useCallback, useEffect } from "react";
import { Calculator, RefreshCw, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StorageCostsService } from "@/services/storage-costs.service";
import type { StorageCostWithRelations } from "@/types";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { getStorageCostColumns } from "@/modules/storage-costs/components/storage-costs-columns";
import { toast } from "@/hooks/use-toast";
import { exportToCSV, exportToExcel } from "@/utils/export";
import { formatDate, formatCurrency } from "@/utils/format";
import { format, subDays } from "date-fns";

export default function StorageCostsPage() {
  const [costs, setCosts] = useState<StorageCostWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcStart, setRecalcStart] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [recalcEnd, setRecalcEnd] = useState(format(new Date(), "yyyy-MM-dd"));

  const service = new StorageCostsService(createClient());
  const columns = getStorageCostColumns();

  const loadCosts = useCallback(async () => {
    setIsLoading(true);
    const result = await service.getAll(
      {},
      { sortBy: "cost_date", sortOrder: "desc", pageSize: 500 }
    );
    if (result.error) {
      toast({ variant: "destructive", title: "Error al cargar", description: result.error });
    } else {
      setCosts(result.data?.data ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { loadCosts(); }, [loadCosts]);

  async function handleRecalculate() {
    if (!recalcStart || !recalcEnd) {
      toast({ variant: "destructive", title: "Selecciona el rango de fechas" });
      return;
    }
    setIsRecalculating(true);
    const result = await service.recalculate(recalcStart, recalcEnd);
    if (result.error) {
      toast({ variant: "destructive", title: "Error en recálculo", description: result.error });
    } else {
      toast({ title: `Recálculo completado — ${result.data} registros procesados` });
      await loadCosts();
    }
    setIsRecalculating(false);
  }

  const totalCost = costs.reduce((acc, c) => acc + Number(c.total_cost), 0);

  function handleExportCSV() {
    exportToCSV(
      costs.map((c) => ({
        fecha: formatDate(c.cost_date),
        almacen: `${c.warehouse.code} - ${c.warehouse.name}`,
        producto: `${c.product.code} - ${c.product.name}`,
        cantidad_pendiente: c.pending_quantity,
        precio_dia: c.daily_price,
        coste_total: c.total_cost,
      })),
      [
        { key: "fecha", header: "Fecha" },
        { key: "almacen", header: "Almacén" },
        { key: "producto", header: "Producto" },
        { key: "cantidad_pendiente", header: "Cantidad Pendiente" },
        { key: "precio_dia", header: "Precio/Día (€)" },
        { key: "coste_total", header: "Coste Total (€)" },
      ],
      { filename: "costes-almacenaje" }
    );
  }

  async function handleExportExcel() {
    await exportToExcel(
      costs.map((c) => ({
        fecha: formatDate(c.cost_date),
        almacen: `${c.warehouse.code} - ${c.warehouse.name}`,
        producto: `${c.product.code} - ${c.product.name}`,
        cantidad_pendiente: Number(c.pending_quantity),
        precio_dia: Number(c.daily_price),
        coste_total: Number(c.total_cost),
      })),
      [
        { key: "fecha", header: "Fecha" },
        { key: "almacen", header: "Almacén" },
        { key: "producto", header: "Producto" },
        { key: "cantidad_pendiente", header: "Cantidad Pendiente" },
        { key: "precio_dia", header: "Precio/Día (€)" },
        { key: "coste_total", header: "Coste Total (€)" },
      ],
      { filename: "costes-almacenaje", title: "Costes de Almacenaje" }
    );
  }

  return (
    <>
      <PageHeader
        title="Costes de almacenaje"
        description="Histórico de costes diarios generados automáticamente"
        actions={
          <>
            <Button variant="outline" onClick={handleExportCSV} disabled={costs.length === 0}>
              <Download className="mr-2 h-4 w-4" />CSV
            </Button>
            <Button variant="outline" onClick={handleExportExcel} disabled={costs.length === 0}>
              <Download className="mr-2 h-4 w-4" />Excel
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total costes cargados</CardTitle>
            <CardDescription>
              Suma de todos los costes en el rango visible
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">
              {formatCurrency(totalCost)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recalcular costes</CardTitle>
            <CardDescription>
              Recalcula los costes para un rango de fechas específico
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <Label>Desde</Label>
                <Input
                  type="date"
                  value={recalcStart}
                  onChange={(e) => setRecalcStart(e.target.value)}
                  className="w-36"
                />
              </div>
              <div className="space-y-1">
                <Label>Hasta</Label>
                <Input
                  type="date"
                  value={recalcEnd}
                  onChange={(e) => setRecalcEnd(e.target.value)}
                  className="w-36"
                />
              </div>
              <Button onClick={handleRecalculate} disabled={isRecalculating}>
                {isRecalculating ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Recalcular
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {!isLoading && costs.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="No hay costes calculados"
          description='Usa el botón "Recalcular" para generar los costes de almacenaje del período deseado.'
        />
      ) : (
        <DataTable
          columns={columns}
          data={costs}
          isLoading={isLoading}
        />
      )}
    </>
  );
}
