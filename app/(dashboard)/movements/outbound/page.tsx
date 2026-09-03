"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
// El icono Warehouse se aliasa: el nombre choca con el tipo Warehouse de @/types.
import {
  Plus, ArrowUpFromLine, Download, ChevronLeft, X,
  Warehouse as WarehouseIcon, Package as PackageIcon, Users as UsersIcon, Calendar as CalendarIcon,
} from "lucide-react";
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
import { FiltersCard, FilterField } from "@/components/shared/filters-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OutboundForm } from "@/modules/movements/components/outbound-form";
import { getOutboundColumns } from "@/modules/movements/components/outbound-columns";
import { toast } from "@/hooks/use-toast";
import { exportToCSV, exportToExcel } from "@/utils/export";
import { formatDate } from "@/utils/format";
import { getMatriculas, upsertMatricula } from "@/lib/actions/matriculas";

export default function OutboundMovementsPage() {
  const router = useRouter();
  const [movements, setMovements] = useState<OutboundMovementWithRelations[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [matriculas, setMatriculas] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [presetWarehouseId, setPresetWarehouseId] = useState<string>("");
  const [presetWarehouseName, setPresetWarehouseName] = useState<string>("");
  const [presetProductId, setPresetProductId] = useState<string>("");
  const [presetProductName, setPresetProductName] = useState<string>("");
  const [backUrl, setBackUrl] = useState<string>("");

  const [search, setSearch] = useState("");
  const [filterWarehouse, setFilterWarehouse] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const supabase = useMemo(() => createClient(), []);
  const movementsService = useMemo(() => new OutboundMovementsService(supabase), [supabase]);
  const warehousesService = useMemo(() => new WarehousesService(supabase), [supabase]);
  const productsService = useMemo(() => new ProductsService(supabase), [supabase]);
  const customersService = useMemo(() => new CustomersService(supabase), [supabase]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [movResult, whResult, prResult, custResult, { data: { user } }, mats] = await Promise.all([
      movementsService.getAll({}, { sortBy: "movement_date", sortOrder: "desc", pageSize: 500 }),
      warehousesService.getActive(),
      productsService.getActive(),
      customersService.getActive(),
      supabase.auth.getUser(),
      getMatriculas(),
    ]);

    if (movResult.error) {
      toast({ variant: "destructive", title: "Error al cargar", description: movResult.error });
    } else {
      setMovements(movResult.data?.data ?? []);
    }
    setWarehouses(whResult.data ?? []);
    setProducts(prResult.data ?? []);
    setCustomers(custResult.data ?? []);
    setMatriculas(mats);
    if (user) setUserId(user.id);
    setIsLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const urlParams = new URLSearchParams(search);
    const whId = urlParams.get("warehouse_id");
    const prId = urlParams.get("product_id");
    const back = urlParams.get("back");
    if (whId) setPresetWarehouseId(whId);
    if (prId) setPresetProductId(prId);
    // `URLSearchParams.get()` ya devuelve el valor decodificado: aplicarle
    // encima decodeURIComponent lo decodificaba DOS veces, y con un `back` que
    // lleva su propia query string (`/warehouses/x/y?tab=puestas&...`) eso
    // convertía los %3F/%26 internos en `?` y `&` reales, partiendo la URL.
    if (back) setBackUrl(back);
    if (whId && prId) setFormOpen(true);
  }, []);

  useEffect(() => {
    if (presetWarehouseId && warehouses.length > 0) {
      const wh = warehouses.find((w) => w.id === presetWarehouseId);
      if (wh) setPresetWarehouseName(`${wh.code} — ${wh.name}`);
    }
    if (presetProductId && products.length > 0) {
      const pr = products.find((p) => p.id === presetProductId);
      if (pr) setPresetProductName(`${pr.code} — ${pr.name}`);
    }
  }, [warehouses, products, presetWarehouseId, presetProductId]);

  const filteredMovements = useMemo(() => {
    let data = movements;
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        (m) =>
          m.warehouse.name.toLowerCase().includes(q) ||
          m.warehouse.code.toLowerCase().includes(q) ||
          m.product.name.toLowerCase().includes(q) ||
          m.product.code.toLowerCase().includes(q) ||
          (m.customer?.name ?? "").toLowerCase().includes(q) ||
          (m.comments ?? "").toLowerCase().includes(q) ||
          (m.matricula ?? m.salida_parcial?.matricula ?? "").toLowerCase().includes(q) ||
          (m.puesta?.numero_contrato ?? "").toLowerCase().includes(q)
      );
    }
    if (filterWarehouse !== "all") data = data.filter((m) => m.warehouse_id === filterWarehouse);
    if (filterProduct !== "all") data = data.filter((m) => m.product_id === filterProduct);
    if (filterCustomer !== "all") data = data.filter((m) => m.customer_id === filterCustomer);
    if (filterDateFrom) data = data.filter((m) => m.movement_date >= filterDateFrom);
    if (filterDateTo) data = data.filter((m) => m.movement_date <= filterDateTo);
    return data;
  }, [movements, search, filterWarehouse, filterProduct, filterCustomer, filterDateFrom, filterDateTo]);

  const hasActiveFilters =
    search.trim() !== "" ||
    filterWarehouse !== "all" ||
    filterProduct !== "all" ||
    filterCustomer !== "all" ||
    filterDateFrom !== "" ||
    filterDateTo !== "";

  function clearFilters() {
    setSearch("");
    setFilterWarehouse("all");
    setFilterProduct("all");
    setFilterCustomer("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  async function handleCreate(values: OutboundFormValues) {
    setIsSaving(true);
    const result = await movementsService.create(values, userId);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al registrar", description: result.error });
    } else {
      if (values.matricula) {
        await upsertMatricula(values.matricula);
        setMatriculas((prev) =>
          prev.includes(values.matricula!) ? prev : [...prev, values.matricula!].sort()
        );
      }
      toast({ title: "Salida registrada correctamente" });
      setFormOpen(false);
      if (backUrl) {
        router.push(backUrl);
        return;
      }
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

  const exportRows = () =>
    filteredMovements.map((m) => ({
      fecha: formatDate(m.movement_date),
      almacen: `${m.warehouse.code} - ${m.warehouse.name}`,
      producto: `${m.product.code} - ${m.product.name}`,
      cliente: m.customer?.name ?? "",
      cantidad: Number(m.quantity),
      unidad: m.product.unit,
      matricula: m.matricula ?? m.salida_parcial?.matricula ?? "",
      pta_disposicion: m.puesta?.numero_contrato ?? "",
      comentarios: m.comments ?? "",
    }));

  const exportColumns = [
    { key: "fecha" as const, header: "Fecha" },
    { key: "almacen" as const, header: "Almacén" },
    { key: "producto" as const, header: "Producto" },
    { key: "cliente" as const, header: "Cliente" },
    { key: "cantidad" as const, header: "Cantidad" },
    { key: "unidad" as const, header: "Unidad" },
    { key: "matricula" as const, header: "Matrícula" },
    { key: "pta_disposicion" as const, header: "Nº pta. a disposición" },
    { key: "comentarios" as const, header: "Comentarios" },
  ];

  function handleExportCSV() {
    exportToCSV(exportRows(), exportColumns, { filename: "salidas" });
  }

  async function handleExportExcel() {
    await exportToExcel(exportRows(), exportColumns, {
      filename: "salidas",
      title: "Salidas de Mercancía",
    });
  }

  const columns = getOutboundColumns(handleDelete);

  return (
    <>
      <PageHeader
        title="Salidas de mercancía"
        description="Registro de todas las salidas del almacén"
        actions={
          <>
            {backUrl && (
              <Button variant="outline" onClick={() => router.push(backUrl)}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Volver
              </Button>
            )}
            <Button variant="outline" onClick={handleExportCSV} disabled={filteredMovements.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" onClick={handleExportExcel} disabled={filteredMovements.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Excel
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva salida
            </Button>
          </>
        }
      />

      <FiltersCard
        searchPlaceholder="Buscar por almacén, producto, cliente, matrícula, nº de puesta o comentarios..."
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
            {filteredMovements.length} de {movements.length} salidas
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

        <FilterField icon={UsersIcon}>
          <Select value={filterCustomer} onValueChange={setFilterCustomer}>
            <SelectTrigger>
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los clientes</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
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
          data={filteredMovements}
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
        matriculas={matriculas}
        presetWarehouseId={presetWarehouseId || undefined}
        presetWarehouseName={presetWarehouseName || undefined}
        presetProductId={presetProductId || undefined}
        presetProductName={presetProductName || undefined}
      />
    </>
  );
}
