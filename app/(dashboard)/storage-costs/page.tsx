"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
// El icono Warehouse se aliasa: el nombre choca con el tipo Warehouse de @/types.
import {
  Calculator, RefreshCw, Download, RotateCcw, Info, X,
  Warehouse as WarehouseIcon, Package as PackageIcon, Calendar as CalendarIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StorageCostsService } from "@/services/storage-costs.service";
import { WarehousesService } from "@/services/warehouses.service";
import { ProductsService } from "@/services/products.service";
import { recalculateStorageCosts, recalculateAllStorageCosts } from "./actions";
import type { StorageCostWithRelations, Warehouse, Product } from "@/types";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { FiltersCard, FilterField } from "@/components/shared/filters-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { getStorageCostColumns } from "@/modules/storage-costs/components/storage-costs-columns";
import { toast } from "@/hooks/use-toast";
import { exportToCSV } from "@/utils/export";
import { formatDate, formatCurrency } from "@/utils/format";
import { format, subDays, startOfMonth } from "date-fns";
import { ExcelIcon } from "@/components/shared/excel-icon";
import { exportStyledExcel, commonUnit } from "@/utils/export-styled-excel";

export default function StorageCostsPage() {
  const [costs, setCosts] = useState<StorageCostWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isRecalculatingAll, setIsRecalculatingAll] = useState(false);
  const [recalcStart, setRecalcStart] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [recalcEnd, setRecalcEnd] = useState(format(new Date(), "yyyy-MM-dd"));

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Los costes son una fila por almacén/producto/día: el histórico completo
  // crece muy deprisa, así que almacén, producto y fechas se filtran en la BD
  // (por defecto, el mes en curso). La búsqueda libre filtra sobre lo cargado.
  const defaultDateFrom = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const defaultDateTo = format(new Date(), "yyyy-MM-dd");
  const [search, setSearch] = useState("");
  const [filterWarehouse, setFilterWarehouse] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState(defaultDateFrom);
  const [filterDateTo, setFilterDateTo] = useState(defaultDateTo);

  const supabase = useMemo(() => createClient(), []);
  const service = useMemo(() => new StorageCostsService(supabase), [supabase]);
  const warehousesService = useMemo(() => new WarehousesService(supabase), [supabase]);
  const productsService = useMemo(() => new ProductsService(supabase), [supabase]);
  const columns = getStorageCostColumns();

  useEffect(() => {
    Promise.all([warehousesService.getActive(), productsService.getActive()]).then(
      ([whResult, prResult]) => {
        setWarehouses(whResult.data ?? []);
        setProducts(prResult.data ?? []);
      }
    );
  }, [warehousesService, productsService]);

  const loadCosts = useCallback(async () => {
    setIsLoading(true);
    const result = await service.getAllFiltered({
      warehouseId: filterWarehouse !== "all" ? filterWarehouse : undefined,
      productId: filterProduct !== "all" ? filterProduct : undefined,
      dateFrom: filterDateFrom || undefined,
      dateTo: filterDateTo || undefined,
    });
    if (result.error) {
      toast({ variant: "destructive", title: "Error al cargar", description: result.error });
    } else {
      setCosts(result.data ?? []);
    }
    setIsLoading(false);
  }, [service, filterWarehouse, filterProduct, filterDateFrom, filterDateTo]);

  useEffect(() => { loadCosts(); }, [loadCosts]);

  const filteredCosts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return costs;
    return costs.filter(
      (c) =>
        c.warehouse.name.toLowerCase().includes(q) ||
        c.warehouse.code.toLowerCase().includes(q) ||
        c.product.name.toLowerCase().includes(q) ||
        c.product.code.toLowerCase().includes(q)
    );
  }, [costs, search]);

  const hasActiveFilters =
    search.trim() !== "" ||
    filterWarehouse !== "all" ||
    filterProduct !== "all" ||
    filterDateFrom !== defaultDateFrom ||
    filterDateTo !== defaultDateTo;

  function clearFilters() {
    setSearch("");
    setFilterWarehouse("all");
    setFilterProduct("all");
    setFilterDateFrom(defaultDateFrom);
    setFilterDateTo(defaultDateTo);
  }

  async function handleRecalculate() {
    if (!recalcStart || !recalcEnd) {
      toast({ variant: "destructive", title: "Selecciona el rango de fechas" });
      return;
    }
    setIsRecalculating(true);
    const result = await recalculateStorageCosts(recalcStart, recalcEnd);
    if (result.error) {
      toast({ variant: "destructive", title: "Error en recálculo", description: result.error });
    } else {
      toast({ title: `Recálculo completado — ${result.data} registros procesados` });
      await loadCosts();
    }
    setIsRecalculating(false);
  }

  async function handleRecalculateAll() {
    setIsRecalculatingAll(true);
    const result = await recalculateAllStorageCosts();
    if (result.error) {
      toast({ variant: "destructive", title: "Error en recálculo global", description: result.error });
    } else {
      toast({ title: `Recálculo completo — ${result.data} registros generados` });
      await loadCosts();
    }
    setIsRecalculatingAll(false);
  }

  const totalCost = filteredCosts.reduce((acc, c) => acc + Number(c.total_cost), 0);

  function handleExportCSV() {
    exportToCSV(
      filteredCosts.map((c) => ({
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
    await exportStyledExcel({
      filename: `costes-almacenaje_${new Date().toISOString().slice(0, 10)}`,
      sheets: [
        {
          name: "Costes",
          title: "Costes de Almacenaje",
          accent: "2563EB",
          unit: commonUnit(filteredCosts.map((c) => ({ unit: c.product.unit }))),
          rows: filteredCosts,
          columns: [
            { header: "Fecha", type: "date", value: (c) => c.cost_date },
            { header: "Almacén", value: (c) => `${c.warehouse.code} - ${c.warehouse.name}` },
            { header: "Producto", value: (c) => `${c.product.code} - ${c.product.name}` },
            { header: "Cantidad pendiente", type: "quantity", value: (c) => Number(c.pending_quantity) },
            { header: "Unidad", value: (c) => c.product.unit },
            { header: "Precio/día", type: "price", value: (c) => Number(c.daily_price) },
            { header: "Coste total", type: "currency", total: true, value: (c) => Number(c.total_cost) },
          ],
        },
      ],
    });
  }

  return (
    <>
      <PageHeader
        title="Costes de almacenaje"
        description="Histórico de costes diarios generados automáticamente"
        actions={
          <>
            <Button variant="outline" onClick={handleExportCSV} disabled={filteredCosts.length === 0}>
              <Download className="mr-2 h-4 w-4" />CSV
            </Button>
            <Button variant="outline" onClick={handleExportExcel} disabled={filteredCosts.length === 0}>
              <ExcelIcon className="mr-2 h-5 w-5" />Excel
            </Button>
          </>
        }
      />

      {/* Aviso: cuando se borran movimientos hay que recalcular */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Si has eliminado o modificado entradas o salidas, haz clic en{" "}
          <strong>Recalcular todo el histórico</strong> para actualizar los costes a los
          movimientos actuales. Los datos mostrados corresponden al último cálculo realizado.
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total costes</CardTitle>
            <CardDescription>
              Suma de los costes que cumplen los filtros
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
              Elimina y regenera los costes del rango seleccionado desde los movimientos actuales
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
              <Button onClick={handleRecalculate} disabled={isRecalculating || isRecalculatingAll}>
                {isRecalculating ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Recalcular rango
              </Button>
            </div>
            <div className="border-t pt-3">
              <Button
                variant="outline"
                className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40"
                onClick={handleRecalculateAll}
                disabled={isRecalculating || isRecalculatingAll}
              >
                {isRecalculatingAll ? (
                  <RotateCcw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Recalcular todo el histórico
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5">
                Borra todos los costes y los regenera desde el primer movimiento hasta hoy
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <FiltersCard
        searchPlaceholder="Buscar por almacén o producto..."
        searchValue={search}
        onSearchChange={setSearch}
        actions={
          hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
              <X className="h-3.5 w-3.5" />
              Limpiar
            </Button>
          )
        }
        summary={
          <span className="text-sm text-muted-foreground">
            {filteredCosts.length} registros
          </span>
        }
      >
        <FilterField icon={WarehouseIcon}>
          <Select value={filterWarehouse} onValueChange={setFilterWarehouse}>
            <SelectTrigger>
              <SelectValue placeholder="Almacén" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los almacenes</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField icon={PackageIcon}>
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger>
              <SelectValue placeholder="Producto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los productos</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField icon={CalendarIcon}>
          <Input
            type="date"
            aria-label="Fecha desde"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
        </FilterField>

        <FilterField icon={CalendarIcon}>
          <Input
            type="date"
            aria-label="Fecha hasta"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
        </FilterField>
      </FiltersCard>

      {!isLoading && filteredCosts.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title={hasActiveFilters ? "No hay costes con estos filtros" : "No hay costes calculados"}
          description={
            hasActiveFilters
              ? "Amplía el rango de fechas o quita algún filtro."
              : 'Usa el botón "Recalcular" para generar los costes de almacenaje del período deseado.'
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredCosts}
          isLoading={isLoading}
        />
      )}
    </>
  );
}
