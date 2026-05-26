"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Euro,
  TrendingUp,
  Warehouse,
  Package,
  CalendarDays,
  ChevronDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  FileText,
  Plus,
  MapPin,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StorageCostsService } from "@/services/storage-costs.service";
import type { DashboardKPIs } from "@/types";
import { StatsCard } from "@/components/shared/stats-card";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatNumber, formatQuantity } from "@/utils/format";

interface ProductStock {
  product_id: string;
  product_name: string;
  product_code: string;
  unit: string;
  total_inbound: number;
  total_outbound: number;
  pending_stock: number;
  daily_price: number;
  daily_cost: number;
}

interface WarehouseGroup {
  warehouse_id: string;
  warehouse_name: string;
  posicion_cerrada: string | null;
  products: ProductStock[];
  totalDailyCost: number;
  totalPendingStock: number;
}

interface PositionGroup {
  posicion_cerrada: string;
  warehouses: WarehouseGroup[];
  totalDailyCost: number;
  totalPendingStock: number;
}

const SIN_POSICION = "(Sin posición cerrada)";

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [positionGroups, setPositionGroups] = useState<PositionGroup[]>([]);
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());
  const [expandedWarehouses, setExpandedWarehouses] = useState<Set<string>>(new Set());
  const [isLoadingKpis, setIsLoadingKpis] = useState(true);
  const [isLoadingStock, setIsLoadingStock] = useState(true);

  const supabase = useMemo(() => createClient(), []);
  const service = useMemo(() => new StorageCostsService(supabase), [supabase]);

  const loadKpis = useCallback(async () => {
    setIsLoadingKpis(true);
    const result = await service.getDashboardKPIs();
    if (result.error) {
      toast({ variant: "destructive", title: "Error al cargar KPIs", description: result.error });
    } else {
      setKpis(result.data);
    }
    setIsLoadingKpis(false);
  }, [service]);

  const loadOrganigrama = useCallback(async () => {
    setIsLoadingStock(true);

    const [inboundRes, outboundRes] = await Promise.all([
      supabase
        .from("inbound_movements")
        .select(
          "warehouse_id, product_id, quantity, warehouse:warehouses(id, name, posicion_cerrada, active, storage_daily_price), product:products(id, name, code, unit)"
        ),
      supabase
        .from("outbound_movements")
        .select("warehouse_id, product_id, quantity"),
    ]);

    if (inboundRes.error) {
      toast({ variant: "destructive", title: "Error al cargar stock", description: inboundRes.error.message });
      setIsLoadingStock(false);
      return;
    }

    type StockEntry = ProductStock & { warehouse_id: string; warehouse_name: string; posicion_cerrada: string | null };
    const stockMap = new Map<string, StockEntry>();

    for (const row of inboundRes.data ?? []) {
      const w = row.warehouse as { id: string; name: string; posicion_cerrada: string | null; active: boolean; storage_daily_price: number } | null;
      const p = row.product as { id: string; name: string; code: string; unit: string } | null;
      if (!w || !p) continue;
      if (!w.active) continue;
      const key = `${row.warehouse_id}||${row.product_id}`;
      if (!stockMap.has(key)) {
        stockMap.set(key, {
          warehouse_id: row.warehouse_id,
          warehouse_name: w.name,
          posicion_cerrada: w.posicion_cerrada ?? null,
          product_id: row.product_id,
          product_name: p.name,
          product_code: p.code,
          unit: p.unit ?? "ud",
          total_inbound: 0,
          total_outbound: 0,
          pending_stock: 0,
          daily_price: Number(w.storage_daily_price ?? 0),
          daily_cost: 0,
        });
      }
      stockMap.get(key)!.total_inbound += Number(row.quantity);
    }

    for (const row of outboundRes.data ?? []) {
      const key = `${row.warehouse_id}||${row.product_id}`;
      if (stockMap.has(key)) {
        stockMap.get(key)!.total_outbound += Number(row.quantity);
      }
    }

    const warehouseMap = new Map<string, WarehouseGroup>();
    for (const item of stockMap.values()) {
      item.pending_stock = Math.max(0, item.total_inbound - item.total_outbound);
      item.daily_cost = item.pending_stock * item.daily_price;
      if (item.pending_stock <= 0) continue;

      if (!warehouseMap.has(item.warehouse_id)) {
        warehouseMap.set(item.warehouse_id, {
          warehouse_id: item.warehouse_id,
          warehouse_name: item.warehouse_name,
          posicion_cerrada: item.posicion_cerrada,
          products: [],
          totalDailyCost: 0,
          totalPendingStock: 0,
        });
      }
      const wg = warehouseMap.get(item.warehouse_id)!;
      wg.products.push(item);
      wg.totalDailyCost += item.daily_cost;
      wg.totalPendingStock += item.pending_stock;
    }

    const positionMap = new Map<string, PositionGroup>();
    for (const wg of warehouseMap.values()) {
      wg.products.sort((a, b) => b.pending_stock - a.pending_stock);
      const posKey = wg.posicion_cerrada ?? SIN_POSICION;
      if (!positionMap.has(posKey)) {
        positionMap.set(posKey, {
          posicion_cerrada: posKey,
          warehouses: [],
          totalDailyCost: 0,
          totalPendingStock: 0,
        });
      }
      const pg = positionMap.get(posKey)!;
      pg.warehouses.push(wg);
      pg.totalDailyCost += wg.totalDailyCost;
      pg.totalPendingStock += wg.totalPendingStock;
    }

    const sorted = Array.from(positionMap.values()).sort((a, b) => {
      if (a.posicion_cerrada === SIN_POSICION) return 1;
      if (b.posicion_cerrada === SIN_POSICION) return -1;
      return a.posicion_cerrada.localeCompare(b.posicion_cerrada, "es");
    });

    for (const pg of sorted) {
      pg.warehouses.sort((a, b) => b.totalPendingStock - a.totalPendingStock);
    }

    setPositionGroups(sorted);
    if (sorted.length > 0) {
      setExpandedPositions(new Set([sorted[0].posicion_cerrada]));
      if (sorted[0].warehouses.length > 0) {
        setExpandedWarehouses(new Set([sorted[0].warehouses[0].warehouse_id]));
      }
    }
    setIsLoadingStock(false);
  }, [supabase]);

  useEffect(() => {
    loadKpis();
    loadOrganigrama();
  }, [loadKpis, loadOrganigrama]);

  function togglePosition(key: string) {
    setExpandedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleWarehouse(id: string) {
    setExpandedWarehouses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalWarehouses = positionGroups.reduce((sum, pg) => sum + pg.warehouses.length, 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Resumen general de almacenajes y costes"
      />

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Coste hoy"
          value={formatCurrency(kpis?.total_cost_today ?? 0)}
          description="Generado hoy"
          icon={Euro}
          variant="default"
          isLoading={isLoadingKpis}
        />
        <StatsCard
          title="Coste del mes"
          value={formatCurrency(kpis?.total_cost_month ?? 0)}
          description="Mes en curso"
          icon={TrendingUp}
          variant="success"
          isLoading={isLoadingKpis}
        />
        <StatsCard
          title="Stock pendiente"
          value={formatNumber(kpis?.pending_stock_units ?? 0)}
          description="Unidades en almacén"
          icon={Package}
          variant="warning"
          isLoading={isLoadingKpis}
        />
        <StatsCard
          title="Almacenes activos"
          value={formatNumber(kpis?.active_warehouses ?? 0)}
          description="Instalaciones operativas"
          icon={Warehouse}
          isLoading={isLoadingKpis}
        />
      </div>

      {/* Organigrama en árbol 3 niveles */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4 bg-gradient-to-r from-violet-500/5 via-transparent to-transparent rounded-t-xl border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-sm">
                <Warehouse className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">Organigrama de almacenes</CardTitle>
                <CardDescription>
                  Posición cerrada → Almacén → Productos
                </CardDescription>
              </div>
            </div>
            {!isLoadingStock && totalWarehouses > 0 && (
              <Badge variant="outline" className="border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400">
                {totalWarehouses}{" "}
                {totalWarehouses === 1 ? "almacén activo" : "almacenes activos"}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {isLoadingStock ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <div className="ml-8 space-y-2">
                    <Skeleton className="h-12 w-full rounded-lg" />
                    <div className="ml-8">
                      <Skeleton className="h-10 w-full rounded-md" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : positionGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30">
                <Warehouse className="h-8 w-8 text-violet-400 dark:text-violet-500" />
              </div>
              <div className="text-center">
                <p className="font-medium">No hay stock activo en ningún almacén</p>
                <p className="text-sm mt-1 opacity-70">
                  Registra entradas de mercancía para que aparezcan aquí
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {positionGroups.map((pg) => {
                const isPosExpanded = expandedPositions.has(pg.posicion_cerrada);
                return (
                  <div key={pg.posicion_cerrada}>
                    {/* ── Nodo Posición Cerrada ────────────────────── */}
                    <button
                      onClick={() => togglePosition(pg.posicion_cerrada)}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-200",
                        isPosExpanded
                          ? "bg-gradient-to-r from-violet-50 to-violet-50/30 dark:from-violet-950/30 dark:to-violet-950/10 border-violet-300 dark:border-violet-700 shadow-sm"
                          : "bg-card hover:bg-gradient-to-r hover:from-violet-50/50 hover:to-transparent dark:hover:from-violet-950/20 dark:hover:to-transparent border-border hover:border-violet-200 dark:hover:border-violet-800 hover:shadow-sm"
                      )}
                    >
                      <div className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                        isPosExpanded
                          ? "bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm"
                          : "bg-muted border border-border group-hover:bg-violet-100"
                      )}>
                        <MapPin className={cn("h-5 w-5", isPosExpanded ? "text-white" : "text-muted-foreground")} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={cn("font-semibold text-base truncate", isPosExpanded && "text-violet-700 dark:text-violet-300")}>
                          {pg.posicion_cerrada}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {pg.warehouses.length}{" "}
                          {pg.warehouses.length === 1 ? "almacén" : "almacenes"}
                          {" · "}
                          {pg.warehouses.reduce((s, w) => s + w.products.length, 0)}{" "}
                          {pg.warehouses.reduce((s, w) => s + w.products.length, 0) === 1 ? "producto" : "productos"}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-muted-foreground">Stock total</p>
                          <p className="font-semibold tabular-nums">{formatNumber(pg.totalPendingStock)} uds</p>
                        </div>
                        <div className="h-8 w-px bg-border hidden md:block" />
                        <div className="text-right hidden md:block">
                          <p className="text-xs text-muted-foreground">Coste/día</p>
                          <p className="font-bold tabular-nums text-violet-600 dark:text-violet-400">{formatCurrency(pg.totalDailyCost)}</p>
                        </div>
                        <div className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200",
                          isPosExpanded ? "bg-violet-100 dark:bg-violet-900/40" : "bg-muted"
                        )}>
                          <ChevronDown className={cn(
                            "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                            isPosExpanded && "rotate-180 text-violet-600 dark:text-violet-400"
                          )} />
                        </div>
                      </div>
                    </button>

                    {/* ── Nivel 2: Almacenes ───────────────────────── */}
                    {isPosExpanded && (
                      <div className="ml-5 mt-1 relative">
                        <div className="absolute left-0 top-0 bottom-3 w-0.5 bg-gradient-to-b from-violet-300 to-transparent dark:from-violet-700 rounded-full" />
                        <div className="space-y-1.5 pl-1">
                          {pg.warehouses.map((group) => {
                            const isExpanded = expandedWarehouses.has(group.warehouse_id);
                            return (
                              <div key={group.warehouse_id} className="relative">
                                <div className="absolute left-[-4px] top-[22px] w-5 h-0.5 bg-violet-200 dark:bg-violet-800" />
                                <div className="ml-5">
                                  {/* ── Nodo Almacén ─────────────────── */}
                                  <button
                                    onClick={() => toggleWarehouse(group.warehouse_id)}
                                    className={cn(
                                      "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-200",
                                      isExpanded
                                        ? "bg-gradient-to-r from-blue-50 to-blue-50/30 dark:from-blue-950/30 dark:to-blue-950/10 border-blue-300 dark:border-blue-700 shadow-sm"
                                        : "bg-card hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-transparent dark:hover:from-blue-950/20 dark:hover:to-transparent border-border hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-sm"
                                    )}
                                  >
                                    <div className={cn(
                                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                                      isExpanded
                                        ? "bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm"
                                        : "bg-muted border border-border"
                                    )}>
                                      <Warehouse className={cn("h-4 w-4", isExpanded ? "text-white" : "text-muted-foreground")} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <p className={cn("font-semibold text-sm truncate", isExpanded && "text-blue-700 dark:text-blue-300")}>
                                        {group.warehouse_name}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {group.products.length}{" "}
                                        {group.products.length === 1 ? "producto" : "productos"} con stock activo
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                      <div className="text-right hidden sm:block">
                                        <p className="text-xs text-muted-foreground">Stock</p>
                                        <p className="font-semibold tabular-nums text-sm">{formatNumber(group.totalPendingStock)} uds</p>
                                      </div>
                                      <div className="h-6 w-px bg-border hidden md:block" />
                                      <div className="text-right hidden md:block">
                                        <p className="text-xs text-muted-foreground">Coste/día</p>
                                        <p className="font-bold tabular-nums text-sm text-blue-600 dark:text-blue-400">{formatCurrency(group.totalDailyCost)}</p>
                                      </div>
                                      <div className={cn(
                                        "flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200",
                                        isExpanded ? "bg-blue-100 dark:bg-blue-900/40" : "bg-muted"
                                      )}>
                                        <ChevronDown className={cn(
                                          "h-3 w-3 text-muted-foreground transition-transform duration-200",
                                          isExpanded && "rotate-180 text-blue-600 dark:text-blue-400"
                                        )} />
                                      </div>
                                    </div>
                                  </button>

                                  {/* ── Nivel 3: Productos ─────────────── */}
                                  {isExpanded && (
                                    <div className="ml-5 mt-1 relative">
                                      <div className="absolute left-0 top-0 bottom-3 w-0.5 bg-gradient-to-b from-blue-300 to-transparent dark:from-blue-700 rounded-full" />
                                      <div className="space-y-1.5 pl-1">
                                        {group.products.map((product) => (
                                          <div key={product.product_id} className="relative">
                                            <div className="absolute left-[-4px] top-1/2 w-5 h-0.5 bg-blue-200 dark:bg-blue-800" />
                                            <div className="ml-5 rounded-lg border bg-card hover:bg-gradient-to-r hover:from-cyan-50/60 hover:to-transparent dark:hover:from-cyan-950/20 dark:hover:to-transparent hover:border-cyan-200 dark:hover:border-cyan-800 transition-all duration-150 group">
                                              <div className="flex items-center gap-3 px-4 py-3">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-cyan-100 to-blue-100 dark:from-cyan-900/30 dark:to-blue-900/30 border border-cyan-200 dark:border-cyan-800 group-hover:from-cyan-200 group-hover:to-blue-200 dark:group-hover:from-cyan-900/50 transition-all duration-150">
                                                  <Package className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                  <p className="font-medium text-sm leading-tight truncate">
                                                    {product.product_name}
                                                  </p>
                                                  <p className="text-xs text-muted-foreground font-mono">
                                                    {product.product_code}
                                                  </p>
                                                </div>

                                                <div className="flex items-center gap-4 shrink-0">
                                                  <div className="hidden sm:flex items-center gap-3 text-sm">
                                                    <div className="text-right">
                                                      <p className="text-xs text-muted-foreground">Entradas</p>
                                                      <p className="tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                                                        +{formatQuantity(product.total_inbound, product.unit)}
                                                      </p>
                                                    </div>
                                                    <div className="text-right">
                                                      <p className="text-xs text-muted-foreground">Salidas</p>
                                                      <p className="tabular-nums text-rose-600 dark:text-rose-400 font-semibold">
                                                        -{formatQuantity(product.total_outbound, product.unit)}
                                                      </p>
                                                    </div>
                                                    <div className="text-right">
                                                      <p className="text-xs text-muted-foreground">Pendiente</p>
                                                      <Badge
                                                        variant="outline"
                                                        className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300 font-bold tabular-nums"
                                                      >
                                                        {formatQuantity(product.pending_stock, product.unit)}
                                                      </Badge>
                                                    </div>
                                                    <div className="text-right hidden lg:block">
                                                      <p className="text-xs text-muted-foreground">Coste/día</p>
                                                      <p className="tabular-nums font-bold text-blue-600 dark:text-blue-400">
                                                        {formatCurrency(product.daily_cost)}
                                                      </p>
                                                    </div>
                                                  </div>

                                                  <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                      <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="gap-1.5 border-violet-200 hover:border-violet-400 hover:bg-violet-50 dark:border-violet-800 dark:hover:border-violet-600 dark:hover:bg-violet-950/50 text-violet-600 dark:text-violet-400 transition-colors"
                                                      >
                                                        <Plus className="h-3.5 w-3.5" />
                                                        Acciones
                                                        <ChevronDown className="h-3 w-3 opacity-60" />
                                                      </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-58">
                                                      <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                                                        {product.product_name}
                                                      </DropdownMenuLabel>
                                                      <DropdownMenuSeparator />

                                                      <DropdownMenuItem asChild>
                                                        <Link href={`/warehouses/${group.warehouse_id}/${product.product_id}`} className="cursor-pointer">
                                                          <CalendarDays className="mr-2 h-4 w-4 text-blue-500" />
                                                          Ver calendario de stock
                                                        </Link>
                                                      </DropdownMenuItem>
                                                      <DropdownMenuItem asChild>
                                                        <Link href={`/warehouses/${group.warehouse_id}/${product.product_id}?tab=puestas`} className="cursor-pointer">
                                                          <FileText className="mr-2 h-4 w-4 text-violet-500" />
                                                          Ver puestas activas
                                                        </Link>
                                                      </DropdownMenuItem>

                                                      <DropdownMenuSeparator />

                                                      <DropdownMenuItem asChild>
                                                        <Link href={`/movements/inbound?warehouse_id=${group.warehouse_id}&product_id=${product.product_id}&back=%2Fdashboard`} className="cursor-pointer">
                                                          <ArrowDownToLine className="mr-2 h-4 w-4 text-emerald-500" />
                                                          Nueva entrada
                                                        </Link>
                                                      </DropdownMenuItem>
                                                      <DropdownMenuItem asChild>
                                                        <Link href={`/movements/outbound?warehouse_id=${group.warehouse_id}&product_id=${product.product_id}&back=%2Fdashboard`} className="cursor-pointer">
                                                          <ArrowUpFromLine className="mr-2 h-4 w-4 text-rose-500" />
                                                          Nueva salida
                                                        </Link>
                                                      </DropdownMenuItem>
                                                      <DropdownMenuItem asChild>
                                                        <Link href={`/puestas?warehouse_id=${group.warehouse_id}&product_id=${product.product_id}&back=%2Fdashboard`} className="cursor-pointer">
                                                          <ClipboardList className="mr-2 h-4 w-4 text-amber-500" />
                                                          Nueva puesta a disposición
                                                        </Link>
                                                      </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                  </DropdownMenu>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
