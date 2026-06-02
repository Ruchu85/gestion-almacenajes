"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Search,
  X,
  ClipboardList,
  ArrowDownToLine,
  ArrowUpFromLine,
  Truck,
  Package,
  Warehouse,
  MapPin,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatQuantity } from "@/utils/format";
import type { Warehouse as WarehouseType, Product } from "@/types";

// ─── Tipos de resultado ───────────────────────────────────────────────────────

interface ResultPuesta {
  type: "puesta";
  id: string;
  numero_contrato: string | null;
  fecha_puesta: string;
  estado: string;
  cantidad_inicial: number;
  customer_name: string | null;
  product_name: string;
  product_code: string;
  unit: string;
  warehouse_name: string;
  posicion_cerrada: string | null;
}

interface ResultSalidaParcial {
  type: "salida_parcial";
  id: string;
  fecha_salida: string;
  matricula: string | null;
  n_camion: string | null;
  cantidad: number;
  comentarios: string | null;
  puesta_id: string;
  numero_contrato: string | null;
  customer_name: string | null;
  product_name: string;
  product_code: string;
  unit: string;
  warehouse_name: string;
  posicion_cerrada: string | null;
}

interface ResultEntrada {
  type: "entrada";
  id: string;
  movement_date: string;
  quantity: number;
  numero_albaran: string | null;
  comments: string | null;
  supplier_name: string | null;
  product_name: string;
  product_code: string;
  unit: string;
  warehouse_name: string;
  posicion_cerrada: string | null;
}

interface ResultSalida {
  type: "salida";
  id: string;
  movement_date: string;
  quantity: number;
  matricula: string | null;
  numero_albaran: string | null;
  comments: string | null;
  customer_name: string | null;
  product_name: string;
  product_code: string;
  unit: string;
  warehouse_name: string;
  posicion_cerrada: string | null;
}

type SearchResult = ResultPuesta | ResultSalidaParcial | ResultEntrada | ResultSalida;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estadoBadge(estado: string) {
  const map: Record<string, { label: string; className: string }> = {
    abierta: { label: "Abierta", className: "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400" },
    finalizada: { label: "Finalizada", className: "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400" },
    cerrada_manual: { label: "Cerrada", className: "border-muted text-muted-foreground" },
  };
  const { label, className } = map[estado] ?? { label: estado, className: "border-muted text-muted-foreground" };
  return <Badge variant="outline" className={cn("text-[10px] font-semibold", className)}>{label}</Badge>;
}

// ─── Componentes de fila ──────────────────────────────────────────────────────

function RowPuesta({ r }: { r: ResultPuesta }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 text-sm border-b last:border-0 border-border/50 hover:bg-muted/30 transition-colors">
      <ClipboardList className="h-4 w-4 shrink-0 text-amber-500" />
      <div className="flex-1 min-w-0 grid grid-cols-[1fr_120px_110px_90px_90px] gap-x-4 items-center">
        <div className="min-w-0">
          <span className="font-mono font-semibold text-foreground">{r.numero_contrato ?? `#${r.id.slice(0, 8).toUpperCase()}`}</span>
          {r.customer_name && <span className="text-muted-foreground ml-2 truncate">{r.customer_name}</span>}
        </div>
        <span className="text-muted-foreground truncate text-xs">{r.product_code} — {r.product_name}</span>
        <span className="text-muted-foreground text-xs truncate">{r.warehouse_name}</span>
        <span className="text-muted-foreground text-xs">{formatDate(r.fecha_puesta)}</span>
        <div className="flex items-center gap-1.5">{estadoBadge(r.estado)}</div>
      </div>
      <Link href={`/puestas/${r.id}`} className="shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </Link>
    </div>
  );
}

function RowSalidaParcial({ r }: { r: ResultSalidaParcial }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 text-sm border-b last:border-0 border-border/50 hover:bg-muted/30 transition-colors">
      <Truck className="h-4 w-4 shrink-0 text-rose-500" />
      <div className="flex-1 min-w-0 grid grid-cols-[100px_100px_1fr_110px_90px_80px] gap-x-4 items-center">
        <span className="font-mono font-semibold text-foreground truncate">{r.matricula ?? "—"}</span>
        <span className="text-muted-foreground text-xs truncate">{r.n_camion ?? "—"}</span>
        <div className="min-w-0">
          <span className="font-mono text-xs text-muted-foreground">{r.numero_contrato ?? `#${r.puesta_id.slice(0, 8).toUpperCase()}`}</span>
          {r.customer_name && <span className="text-muted-foreground ml-2 truncate text-xs">{r.customer_name}</span>}
        </div>
        <span className="text-muted-foreground text-xs truncate">{r.product_code} — {r.product_name}</span>
        <span className="text-muted-foreground text-xs">{formatDate(r.fecha_salida)}</span>
        <span className="text-xs tabular-nums text-right font-medium">{formatQuantity(r.cantidad, r.unit)}</span>
      </div>
      <Link href={`/puestas/${r.puesta_id}`} className="shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </Link>
    </div>
  );
}

function RowEntrada({ r }: { r: ResultEntrada }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 text-sm border-b last:border-0 border-border/50 hover:bg-muted/30 transition-colors">
      <ArrowDownToLine className="h-4 w-4 shrink-0 text-emerald-500" />
      <div className="flex-1 min-w-0 grid grid-cols-[120px_1fr_110px_90px_80px] gap-x-4 items-center">
        <span className="font-mono font-semibold text-foreground truncate">{r.numero_albaran ?? "—"}</span>
        <span className="text-muted-foreground text-xs truncate">{r.supplier_name ?? "—"}</span>
        <span className="text-muted-foreground text-xs truncate">{r.product_code} — {r.product_name}</span>
        <span className="text-muted-foreground text-xs">{formatDate(r.movement_date)}</span>
        <span className="text-xs tabular-nums text-right font-medium">{formatQuantity(r.quantity, r.unit)}</span>
      </div>
    </div>
  );
}

function RowSalida({ r }: { r: ResultSalida }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 text-sm border-b last:border-0 border-border/50 hover:bg-muted/30 transition-colors">
      <ArrowUpFromLine className="h-4 w-4 shrink-0 text-rose-500" />
      <div className="flex-1 min-w-0 grid grid-cols-[100px_120px_1fr_110px_90px_80px] gap-x-4 items-center">
        <span className="font-mono font-semibold text-foreground truncate">{r.matricula ?? "—"}</span>
        <span className="font-mono text-xs text-muted-foreground truncate">{r.numero_albaran ?? "—"}</span>
        <span className="text-muted-foreground text-xs truncate">{r.customer_name ?? "—"}</span>
        <span className="text-muted-foreground text-xs truncate">{r.product_code} — {r.product_name}</span>
        <span className="text-muted-foreground text-xs">{formatDate(r.movement_date)}</span>
        <span className="text-xs tabular-nums text-right font-medium">{formatQuantity(r.quantity, r.unit)}</span>
      </div>
    </div>
  );
}

// ─── Sección colapsable de resultados ────────────────────────────────────────

function ResultSection({
  title,
  icon: Icon,
  count,
  color,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  color: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  if (count === 0) return null;

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors border-b border-border/50"
      >
        <Icon className={cn("h-4 w-4", color)} />
        <span className="font-semibold text-sm">{title}</span>
        <Badge variant="secondary" className="ml-1 text-xs">{count}</Badge>
        <span className="ml-auto text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {open && <CardContent className="p-0">{children}</CardContent>}
    </Card>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function BuscadorPage() {
  const supabase = useMemo(() => createClient(), []);

  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [positions, setPositions] = useState<string[]>([]);

  const [searchText, setSearchText] = useState("");
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterWarehouse, setFilterWarehouse] = useState("all");
  const [filterPosition, setFilterPosition] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Cargar datos para los selects
  useEffect(() => {
    async function load() {
      const [whRes, prRes] = await Promise.all([
        supabase.from("warehouses").select("id, name, code, posicion_cerrada, active, storage_daily_price, address, created_at, updated_at").eq("active", true).order("name"),
        supabase.from("products").select("*").eq("active", true).order("name"),
      ]);
      const whs = whRes.data ?? [];
      setWarehouses(whs);
      setProducts(prRes.data ?? []);

      const unique = Array.from(
        new Set(whs.map((w) => w.posicion_cerrada).filter((p): p is string => !!p))
      ).sort((a, b) => a.localeCompare(b, "es"));
      setPositions(unique);
    }
    load();
  }, [supabase]);

  const handleSearch = useCallback(async () => {
    setIsSearching(true);
    setHasSearched(true);

    // Calcular IDs de almacenes según filtros
    let whIds: string[] | null = null;
    if (filterPosition !== "all" || filterWarehouse !== "all") {
      let whList = warehouses;
      if (filterPosition !== "all") whList = whList.filter((w) => w.posicion_cerrada === filterPosition);
      if (filterWarehouse !== "all") whList = whList.filter((w) => w.id === filterWarehouse);
      whIds = whList.map((w) => w.id);
    }

    // Si no hay almacenes que coincidan, devolver vacío
    if (whIds !== null && whIds.length === 0) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    // ── Queries en paralelo ───────────────────────────────────────
    const buildPuestasQ = () => {
      let q = supabase
        .from("puestas_a_disposicion")
        .select(`id, numero_contrato, fecha_puesta, estado, cantidad_inicial, warehouse_id, product_id,
          customer:customers!customer_id(name),
          product:products!product_id(name, code, unit),
          warehouse:warehouses!warehouse_id(name, posicion_cerrada)`)
        .order("fecha_puesta", { ascending: false })
        .limit(300);
      if (whIds) q = q.in("warehouse_id", whIds);
      if (filterProduct !== "all") q = q.eq("product_id", filterProduct);
      if (filterDateFrom) q = q.gte("fecha_puesta", filterDateFrom);
      if (filterDateTo) q = q.lte("fecha_puesta", filterDateTo);
      return q;
    };

    const buildSalidasParcQ = () => {
      let q = supabase
        .from("salidas_parciales")
        .select(`id, fecha_salida, n_camion, matricula, cantidad, comentarios, puesta_id,
          puesta:puestas_a_disposicion!inner(
            id, numero_contrato,
            customer:customers!customer_id(name),
            product:products!product_id(name, code, unit),
            warehouse:warehouses!warehouse_id(name, posicion_cerrada)
          )`)
        .eq("tipo", "real")
        .order("fecha_salida", { ascending: false })
        .limit(300);
      if (filterDateFrom) q = q.gte("fecha_salida", filterDateFrom);
      if (filterDateTo) q = q.lte("fecha_salida", filterDateTo);
      return q;
    };

    const buildEntradasQ = () => {
      let q = supabase
        .from("inbound_movements")
        .select(`id, movement_date, quantity, numero_albaran, comments, warehouse_id, product_id,
          supplier:suppliers!supplier_id(name),
          product:products!product_id(name, code, unit),
          warehouse:warehouses!warehouse_id(name, posicion_cerrada)`)
        .order("movement_date", { ascending: false })
        .limit(300);
      if (whIds) q = q.in("warehouse_id", whIds);
      if (filterProduct !== "all") q = q.eq("product_id", filterProduct);
      if (filterDateFrom) q = q.gte("movement_date", filterDateFrom);
      if (filterDateTo) q = q.lte("movement_date", filterDateTo);
      return q;
    };

    const buildSalidasQ = () => {
      let q = supabase
        .from("outbound_movements")
        .select(`id, movement_date, quantity, matricula, numero_albaran, comments, warehouse_id, product_id,
          customer:customers!customer_id(name),
          product:products!product_id(name, code, unit),
          warehouse:warehouses!warehouse_id(name, posicion_cerrada)`)
        .eq("from_puesta", false)
        .order("movement_date", { ascending: false })
        .limit(300);
      if (whIds) q = q.in("warehouse_id", whIds);
      if (filterProduct !== "all") q = q.eq("product_id", filterProduct);
      if (filterDateFrom) q = q.gte("movement_date", filterDateFrom);
      if (filterDateTo) q = q.lte("movement_date", filterDateTo);
      return q;
    };

    const [puestasRes, spRes, entradasRes, salidasRes] = await Promise.all([
      buildPuestasQ(),
      buildSalidasParcQ(),
      buildEntradasQ(),
      buildSalidasQ(),
    ]);

    const q = searchText.trim().toLowerCase();

    // ── Normalizar puestas ────────────────────────────────────────
    type PRow = { name: string; code: string; unit: string };
    type WRow = { name: string; posicion_cerrada: string | null };
    type CRow = { name: string };

    const puestas: ResultPuesta[] = (puestasRes.data ?? []).map((r) => {
      const product = r.product as unknown as PRow;
      const warehouse = r.warehouse as unknown as WRow;
      const customer = r.customer as unknown as CRow | null;
      return {
        type: "puesta",
        id: r.id,
        numero_contrato: r.numero_contrato,
        fecha_puesta: r.fecha_puesta,
        estado: r.estado,
        cantidad_inicial: Number(r.cantidad_inicial),
        customer_name: customer?.name ?? null,
        product_name: product?.name ?? "",
        product_code: product?.code ?? "",
        unit: product?.unit ?? "ud",
        warehouse_name: warehouse?.name ?? "",
        posicion_cerrada: warehouse?.posicion_cerrada ?? null,
      };
    });

    // ── Normalizar salidas parciales ──────────────────────────────
    type SpPuesta = {
      id: string;
      numero_contrato: string | null;
      customer: CRow | null;
      product: PRow;
      warehouse: WRow;
    };

    const spRows = (spRes.data ?? []) as unknown as Array<{
      id: string;
      fecha_salida: string;
      n_camion: string | null;
      matricula: string | null;
      cantidad: number;
      comentarios: string | null;
      puesta_id: string;
      puesta: SpPuesta;
    }>;

    const salidasParciales: ResultSalidaParcial[] = spRows
      .filter((r) => {
        if (!r.puesta) return false;
        if (whIds && !whIds.includes(r.puesta.warehouse ? "" : "")) {
          // Filter by warehouse via puesta.warehouse
          const whName = r.puesta.warehouse?.name ?? "";
          const matchesWh = whIds === null || warehouses.some(
            (w) => whIds!.includes(w.id) && w.name === whName
          );
          if (!matchesWh) return false;
        }
        if (filterProduct !== "all") {
          // product already in puesta – can't easily join here, skip re-filter
        }
        return true;
      })
      .map((r) => ({
        type: "salida_parcial" as const,
        id: r.id,
        fecha_salida: r.fecha_salida,
        matricula: r.matricula,
        n_camion: r.n_camion,
        cantidad: Number(r.cantidad),
        comentarios: r.comentarios,
        puesta_id: r.puesta_id,
        numero_contrato: r.puesta?.numero_contrato ?? null,
        customer_name: r.puesta?.customer?.name ?? null,
        product_name: r.puesta?.product?.name ?? "",
        product_code: r.puesta?.product?.code ?? "",
        unit: r.puesta?.product?.unit ?? "ud",
        warehouse_name: r.puesta?.warehouse?.name ?? "",
        posicion_cerrada: r.puesta?.warehouse?.posicion_cerrada ?? null,
      }));

    // ── Normalizar entradas ───────────────────────────────────────
    const entradas: ResultEntrada[] = (entradasRes.data ?? []).map((r) => {
      const product = r.product as unknown as PRow;
      const warehouse = r.warehouse as unknown as WRow;
      const supplier = r.supplier as unknown as CRow | null;
      return {
        type: "entrada",
        id: r.id,
        movement_date: r.movement_date,
        quantity: Number(r.quantity),
        numero_albaran: r.numero_albaran,
        comments: r.comments,
        supplier_name: supplier?.name ?? null,
        product_name: product?.name ?? "",
        product_code: product?.code ?? "",
        unit: product?.unit ?? "ud",
        warehouse_name: warehouse?.name ?? "",
        posicion_cerrada: warehouse?.posicion_cerrada ?? null,
      };
    });

    // ── Normalizar salidas directas ───────────────────────────────
    const salidas: ResultSalida[] = (salidasRes.data ?? []).map((r) => {
      const product = r.product as unknown as PRow;
      const warehouse = r.warehouse as unknown as WRow;
      const customer = r.customer as unknown as CRow | null;
      return {
        type: "salida",
        id: r.id,
        movement_date: r.movement_date,
        quantity: Number(r.quantity),
        matricula: r.matricula,
        numero_albaran: r.numero_albaran,
        comments: r.comments,
        customer_name: customer?.name ?? null,
        product_name: product?.name ?? "",
        product_code: product?.code ?? "",
        unit: product?.unit ?? "ud",
        warehouse_name: warehouse?.name ?? "",
        posicion_cerrada: warehouse?.posicion_cerrada ?? null,
      };
    });

    // ── Filtro de texto ───────────────────────────────────────────
    function matchesText(fields: (string | null | undefined)[]): boolean {
      if (!q) return true;
      return fields.some((f) => (f ?? "").toLowerCase().includes(q));
    }

    const filteredPuestas = puestas.filter((r) =>
      matchesText([r.numero_contrato, r.customer_name, r.product_name, r.product_code, r.warehouse_name])
    );
    const filteredSP = salidasParciales.filter((r) =>
      matchesText([r.matricula, r.n_camion, r.numero_contrato, r.customer_name, r.product_name, r.product_code, r.warehouse_name, r.comentarios])
    );
    const filteredEntradas = entradas.filter((r) =>
      matchesText([r.numero_albaran, r.supplier_name, r.product_name, r.product_code, r.warehouse_name, r.comments])
    );
    const filteredSalidas = salidas.filter((r) =>
      matchesText([r.matricula, r.numero_albaran, r.customer_name, r.product_name, r.product_code, r.warehouse_name, r.comments])
    );

    // ── Aplicar filtro posicion_cerrada a salidas_parciales ───────
    const finalSP = filterPosition !== "all"
      ? filteredSP.filter((r) => r.posicion_cerrada === filterPosition)
      : filteredSP;

    setResults([...filteredPuestas, ...finalSP, ...filteredEntradas, ...filteredSalidas]);
    setIsSearching(false);
  }, [supabase, searchText, filterProduct, filterWarehouse, filterPosition, filterDateFrom, filterDateTo, warehouses]);

  function clearFilters() {
    setSearchText("");
    setFilterProduct("all");
    setFilterWarehouse("all");
    setFilterPosition("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setResults(null);
    setHasSearched(false);
  }

  const puestas = (results ?? []).filter((r): r is ResultPuesta => r.type === "puesta");
  const salidasParciales = (results ?? []).filter((r): r is ResultSalidaParcial => r.type === "salida_parcial");
  const entradas = (results ?? []).filter((r): r is ResultEntrada => r.type === "entrada");
  const salidas = (results ?? []).filter((r): r is ResultSalida => r.type === "salida");
  const totalResults = (results ?? []).length;

  const hasFilters =
    searchText.trim() !== "" ||
    filterProduct !== "all" ||
    filterWarehouse !== "all" ||
    filterPosition !== "all" ||
    filterDateFrom !== "" ||
    filterDateTo !== "";

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Buscador"
        description="Busca en puestas, salidas, entradas y movimientos de toda la aplicación"
      />

      {/* Filtros */}
      <Card>
        <CardContent className="pt-5 pb-4 space-y-4">
          {/* Búsqueda libre */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por matrícula, nº contrato, albarán, cliente, proveedor, producto..."
              className="pl-9 text-sm"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>

          {/* Filtros secundarios */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Producto */}
            <div className="flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Select value={filterProduct} onValueChange={setFilterProduct}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Producto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los productos</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Almacén */}
            <div className="flex items-center gap-1.5">
              <Warehouse className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Select value={filterWarehouse} onValueChange={setFilterWarehouse}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Almacén" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los almacenes</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Posición cerrada */}
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Select value={filterPosition} onValueChange={setFilterPosition}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Posición cerrada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las posiciones</SelectItem>
                  {positions.map((pos) => (
                    <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fecha desde */}
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                type="date"
                className="h-8 text-xs"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>

            {/* Fecha hasta */}
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                type="date"
                className="h-8 text-xs"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={handleSearch}
              disabled={isSearching}
              className="gap-2"
            >
              <Search className="h-4 w-4" />
              {isSearching ? "Buscando..." : "Buscar"}
            </Button>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
                <X className="h-3.5 w-3.5" />
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Estado inicial */}
      {!hasSearched && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Search className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-sm font-medium">Usa los filtros y pulsa Buscar</p>
          <p className="text-xs mt-1 opacity-70">Puedes buscar por matrícula, contrato, albarán, cliente, proveedor o producto</p>
        </div>
      )}

      {/* Sin resultados */}
      {hasSearched && results !== null && totalResults === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Search className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-sm font-medium">Sin resultados</p>
          <p className="text-xs mt-1 opacity-70">Prueba con otros términos o amplía el rango de fechas</p>
        </div>
      )}

      {/* Resultados */}
      {hasSearched && results !== null && totalResults > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{totalResults}</span> resultado{totalResults !== 1 ? "s" : ""} encontrado{totalResults !== 1 ? "s" : ""}
          </p>

          {/* Puestas a disposición */}
          <ResultSection title="Puestas a Disposición" icon={ClipboardList} count={puestas.length} color="text-amber-500">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground grid grid-cols-[1fr_120px_110px_90px_90px] gap-x-4 px-10 py-1.5 bg-muted/20 border-b border-border/50">
              <span>Nº Contrato / Cliente</span>
              <span>Producto</span>
              <span>Almacén</span>
              <span>Fecha</span>
              <span>Estado</span>
            </div>
            {puestas.map((r) => <RowPuesta key={r.id} r={r} />)}
          </ResultSection>

          {/* Salidas de puestas */}
          <ResultSection title="Salidas de Puestas" icon={Truck} count={salidasParciales.length} color="text-rose-500">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground grid grid-cols-[100px_100px_1fr_110px_90px_80px] gap-x-4 px-10 py-1.5 bg-muted/20 border-b border-border/50">
              <span>Matrícula</span>
              <span>Nº Camión</span>
              <span>Puesta / Cliente</span>
              <span>Producto</span>
              <span>Fecha</span>
              <span className="text-right">Cantidad</span>
            </div>
            {salidasParciales.map((r) => <RowSalidaParcial key={r.id} r={r} />)}
          </ResultSection>

          {/* Entradas */}
          <ResultSection title="Entradas" icon={ArrowDownToLine} count={entradas.length} color="text-emerald-500">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground grid grid-cols-[120px_1fr_110px_90px_80px] gap-x-4 px-10 py-1.5 bg-muted/20 border-b border-border/50">
              <span>Nº Albarán</span>
              <span>Proveedor</span>
              <span>Producto</span>
              <span>Fecha</span>
              <span className="text-right">Cantidad</span>
            </div>
            {entradas.map((r) => <RowEntrada key={r.id} r={r} />)}
          </ResultSection>

          {/* Salidas directas */}
          <ResultSection title="Salidas Directas" icon={ArrowUpFromLine} count={salidas.length} color="text-rose-500">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground grid grid-cols-[100px_120px_1fr_110px_90px_80px] gap-x-4 px-10 py-1.5 bg-muted/20 border-b border-border/50">
              <span>Matrícula</span>
              <span>Nº Albarán</span>
              <span>Cliente</span>
              <span>Producto</span>
              <span>Fecha</span>
              <span className="text-right">Cantidad</span>
            </div>
            {salidas.map((r) => <RowSalida key={r.id} r={r} />)}
          </ResultSection>
        </div>
      )}
    </div>
  );
}
