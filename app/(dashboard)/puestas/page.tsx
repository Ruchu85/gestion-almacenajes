"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, ClipboardList, Download, ChevronLeft, Search, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PuestaForm } from "@/modules/puestas/components/puesta-form";
import { getPuestaColumns } from "@/modules/puestas/components/puesta-columns";
import { toast } from "@/hooks/use-toast";
import { exportToExcel } from "@/utils/export";
import { formatDate } from "@/utils/format";
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
  const [presetWarehouseId, setPresetWarehouseId] = useState<string>("");
  const [presetWarehouseName, setPresetWarehouseName] = useState<string>("");
  const [presetProductId, setPresetProductId] = useState<string>("");
  const [presetProductName, setPresetProductName] = useState<string>("");
  const [backUrl, setBackUrl] = useState<string>("");

  const [search, setSearch] = useState("");
  const [filterWarehouse, setFilterWarehouse] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterEstado, setFilterEstado] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const supabase = useMemo(() => createClient(), []);
  const warehousesService = useMemo(() => new WarehousesService(supabase), [supabase]);
  const productsService   = useMemo(() => new ProductsService(supabase), [supabase]);
  const customersService  = useMemo(() => new CustomersService(supabase), [supabase]);

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

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const urlParams = new URLSearchParams(search);
    const whId = urlParams.get("warehouse_id");
    const prId = urlParams.get("product_id");
    const back = urlParams.get("back");
    if (whId) setPresetWarehouseId(whId);
    if (prId) setPresetProductId(prId);
    if (back) setBackUrl(decodeURIComponent(back));
    if (whId && prId) { setEditingPuesta(null); setFormOpen(true); }
  }, []);

  useEffect(() => {
    if (presetWarehouseId && warehouses.length > 0) {
      const wh = warehouses.find((w) => w.id === presetWarehouseId);
      if (wh) setPresetWarehouseName(wh.name);
    }
    if (presetProductId && products.length > 0) {
      const pr = products.find((p) => p.id === presetProductId);
      if (pr) setPresetProductName(pr.name);
    }
  }, [warehouses, products, presetWarehouseId, presetProductId]);

  // Unique values for filter dropdowns derived from loaded summaries
  const uniqueWarehouses = useMemo(
    () => Array.from(new Set(summaries.map((s) => s.warehouse_name))).filter(Boolean).sort(),
    [summaries]
  );
  const uniqueProducts = useMemo(
    () => Array.from(new Set(summaries.map((s) => s.product_name))).filter(Boolean).sort(),
    [summaries]
  );
  const uniqueCustomers = useMemo(
    () => Array.from(new Set(summaries.map((s) => s.customer_name))).filter(Boolean).sort(),
    [summaries]
  );

  const filteredSummaries = useMemo(() => {
    let data = summaries;
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        (s) =>
          s.numero_contrato.toLowerCase().includes(q) ||
          s.customer_name.toLowerCase().includes(q) ||
          s.product_name.toLowerCase().includes(q) ||
          s.product_code.toLowerCase().includes(q) ||
          s.warehouse_name.toLowerCase().includes(q)
      );
    }
    if (filterWarehouse !== "all") data = data.filter((s) => s.warehouse_name === filterWarehouse);
    if (filterProduct !== "all") data = data.filter((s) => s.product_name === filterProduct);
    if (filterCustomer !== "all") data = data.filter((s) => s.customer_name === filterCustomer);
    if (filterEstado !== "all") data = data.filter((s) => s.estado === filterEstado);
    if (filterDateFrom) data = data.filter((s) => s.fecha_puesta >= filterDateFrom);
    if (filterDateTo) data = data.filter((s) => s.fecha_puesta <= filterDateTo);
    return data;
  }, [summaries, search, filterWarehouse, filterProduct, filterCustomer, filterEstado, filterDateFrom, filterDateTo]);

  const hasActiveFilters =
    search.trim() !== "" ||
    filterWarehouse !== "all" ||
    filterProduct !== "all" ||
    filterCustomer !== "all" ||
    filterEstado !== "all" ||
    filterDateFrom !== "" ||
    filterDateTo !== "";

  function clearFilters() {
    setSearch("");
    setFilterWarehouse("all");
    setFilterProduct("all");
    setFilterCustomer("all");
    setFilterEstado("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  async function handleCreate(values: PuestaFormValues) {
    setIsSaving(true);
    const result = await createPuesta(values);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al crear", description: result.error });
    } else {
      toast({ title: "Puesta a disposición creada" });
      setFormOpen(false);
      if (backUrl) {
        router.push(backUrl);
        return;
      }
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

  async function handleExportExcel() {
    await exportToExcel(
      filteredSummaries.map((s) => ({
        contrato: s.numero_contrato,
        cliente: s.customer_name,
        producto: `${s.product_code} - ${s.product_name}`,
        almacen: s.warehouse_name,
        fecha_puesta: formatDate(s.fecha_puesta),
        dias_plancha: s.dias_plancha,
        fecha_fin_plancha: formatDate(s.fecha_fin_plancha),
        cantidad_inicial: Number(s.cantidad_inicial),
        cantidad_salida: Number(s.cantidad_salida),
        cantidad_pendiente: Number(s.cantidad_pendiente),
        unidad: s.unit,
        dias_activos: s.dias_activos,
        coste_acumulado: Number(s.coste_acumulado),
        estado: s.estado,
      })),
      [
        { key: "contrato" as const, header: "Contrato" },
        { key: "cliente" as const, header: "Cliente" },
        { key: "producto" as const, header: "Producto" },
        { key: "almacen" as const, header: "Almacén" },
        { key: "fecha_puesta" as const, header: "Fecha Puesta" },
        { key: "dias_plancha" as const, header: "Días Plancha" },
        { key: "fecha_fin_plancha" as const, header: "Fin Plancha" },
        { key: "cantidad_inicial" as const, header: "Cantidad Inicial" },
        { key: "cantidad_salida" as const, header: "Cantidad Salida" },
        { key: "cantidad_pendiente" as const, header: "Cantidad Pendiente" },
        { key: "unidad" as const, header: "Unidad" },
        { key: "dias_activos" as const, header: "Días Activos" },
        { key: "coste_acumulado" as const, header: "Coste Acumulado (€)" },
        { key: "estado" as const, header: "Estado" },
      ],
      { filename: "puestas-a-disposicion", title: "Puestas a Disposición" }
    );
  }

  const columns = getPuestaColumns(handleView, handleEdit, handleDelete, handleChangeEstado);

  return (
    <>
      <PageHeader
        title="Puestas a Disposición"
        description="Gestiona los lotes de mercancía puestos a disposición de clientes"
        actions={
          <>
            {backUrl && (
              <Button variant="outline" onClick={() => router.push(backUrl)}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Volver
              </Button>
            )}
            <Button variant="outline" onClick={handleExportExcel} disabled={filteredSummaries.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Excel
            </Button>
            <Button onClick={() => { setEditingPuesta(null); setFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />Nueva puesta
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por contrato, cliente, producto o almacén..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={filterWarehouse} onValueChange={setFilterWarehouse}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Todos los almacenes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los almacenes</SelectItem>
                  {uniqueWarehouses.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterProduct} onValueChange={setFilterProduct}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Todos los productos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los productos</SelectItem>
                  {uniqueProducts.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todos los clientes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los clientes</SelectItem>
                  {uniqueCustomers.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="abierta">Abierta</SelectItem>
                  <SelectItem value="finalizada">Finalizada</SelectItem>
                  <SelectItem value="cerrada_manual">Cerrada</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Desde</span>
                <Input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-36"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Hasta</span>
                <Input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-36"
                />
              </div>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-1 h-3 w-3" />
                  Limpiar
                </Button>
              )}

              <span className="ml-auto text-sm text-muted-foreground">
                {filteredSummaries.length} de {summaries.length} puestas
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

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
          data={filteredSummaries}
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
        presetWarehouseId={presetWarehouseId || undefined}
        presetWarehouseName={presetWarehouseName || undefined}
        presetProductId={presetProductId || undefined}
        presetProductName={presetProductName || undefined}
      />
    </>
  );
}
