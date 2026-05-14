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
  ChevronRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  FileText,
  Plus,
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
  products: ProductStock[];
  totalDailyCost: number;
  totalPendingStock: number;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [warehouseGroups, setWarehouseGroups] = useState<WarehouseGroup[]>([]);
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
          "warehouse_id, product_id, quantity, warehouse:warehouses(id, name), product:products(id, name, code, unit, storage_daily_price)"
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

    type StockEntry = ProductStock & { warehouse_id: string; warehouse_name: string };
    const stockMap = new Map<string, StockEntry>();

    for (const row of inboundRes.data ?? []) {
      const w = row.warehouse as { id: string; name: string } | null;
      const p = row.product as { id: string; name: string; code: string; unit: string; storage_daily_price: number } | null;
      if (!w || !p) continue;
      const key = `${row.warehouse_id}||${row.product_id}`;
      if (!stockMap.has(key)) {
        stockMap.set(key, {
          warehouse_id: row.warehouse_id,
          warehouse_name: w.name,
          product_id: row.product_id,
          product_name: p.name,
          product_code: p.code,
          unit: p.unit ?? "ud",
          total_inbound: 0,
          total_outbound: 0,
          pending_stock: 0,
          daily_price: Number(p.storage_daily_price ?? 0),
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

    const groups = new Map<string, WarehouseGroup>();
    for (const item of stockMap.values()) {
      item.pending_stock = Math.max(0, item.total_inbound - item.total_outbound);
      item.daily_cost = item.pending_stock * item.daily_price;
      if (item.pending_stock <= 0) continue;

      if (!groups.has(item.warehouse_id)) {
        groups.set(item.warehouse_id, {
          warehouse_id: item.warehouse_id,
          warehouse_name: item.warehouse_name,
          products: [],
          totalDailyCost: 0,
          totalPendingStock: 0,
        });
      }
      const g = groups.get(item.warehouse_id)!;
      g.products.push(item);
      g.totalDailyCost += item.daily_cost;
      g.totalPendingStock += item.pending_stock;
    }

    const sorted = Array.from(groups.values())
      .sort((a, b) => b.totalPendingStock - a.totalPendingStock)
      .map((g) => ({ ...g, products: g.products.sort((a, b) => b.pending_stock - a.pending_stock) }));

    setWarehouseGroups(sorted);
    // Auto-expand first warehouse
    if (sorted.length > 0) {
      setExpandedWarehouses(new Set([sorted[0].warehouse_id]));
    }
    setIsLoadingStock(false);
  }, [supabase]);

  useEffect(() => {
    loadKpis();
    loadOrganigrama();
  }, [loadKpis, loadOrganigrama]);

  function toggleWarehouse(id: string) {
    setExpandedWarehouses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Resumen general de almacenajes y costes"
      />

      {/* KPIs compactos */}
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

      {/* Organigrama en árbol */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Warehouse className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Organigrama de almacenes</CardTitle>
                <CardDescription>
                  Despliega un almacén para ver sus productos y gestionar movimientos
                </CardDescription>
              </div>
            </div>
            {!isLoadingStock && warehouseGroups.length > 0 && (
              <Badge variant="outline">
                {warehouseGroups.length}{" "}
                {warehouseGroups.length === 1 ? "almacén activo" : "almacenes activos"}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {isLoadingStock ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <div className="ml-8 space-y-2">
                    <Skeleton className="h-12 w-full rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : warehouseGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Warehouse className="h-8 w-8 opacity-40" />
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
              {warehouseGroups.map((group) => {
                const isExpanded = expandedWarehouses.has(group.warehouse_id);
                return (
                  <div key={group.warehouse_id}>
                    {/* ── Nodo Almacén ────────────────────────────── */}
                    <button
                      onClick={() => toggleWarehouse(group.warehouse_id)}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all",
                        isExpanded
                          ? "bg-primary/5 border-primary/30 shadow-sm"
                          : "bg-card hover:bg-muted/40 border-border"
                      )}
                    >
                      <div className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors",
                        isExpanded ? "bg-primary/15 border-primary/30" : "bg-muted border-border"
                      )}>
                        <Warehouse className={cn("h-5 w-5", isExpanded ? "text-primary" : "text-muted-foreground")} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-base truncate">{group.warehouse_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {group.products.length}{" "}
                          {group.products.length === 1 ? "producto" : "productos"} con stock activo
                        </p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-muted-foreground">Stock total</p>
                          <p className="font-semibold tabular-nums">{formatNumber(group.totalPendingStock)} uds</p>
                        </div>
                        <div className="h-8 w-px bg-border hidden md:block" />
                        <div className="text-right hidden md:block">
                          <p className="text-xs text-muted-foreground">Coste/día</p>
                          <p className="font-semibold tabular-nums text-primary">{formatCurrency(group.totalDailyCost)}</p>
                        </div>
                        <ChevronDown className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )} />
                      </div>
                    </button>

                    {/* ── Árbol de Productos ──────────────────────── */}
                    {isExpanded && (
                      <div className="ml-5 mt-1 relative">
                        {/* Línea vertical del árbol */}
                        <div className="absolute left-0 top-0 bottom-3 w-0.5 bg-border/60 rounded-full" />

                        <div className="space-y-1.5 pl-1">
                          {group.products.map((product, idx) => {
                            const isLast = idx === group.products.length - 1;
                            return (
                              <div key={product.product_id} className="relative">
                                {/* Rama horizontal */}
                                <div className={cn(
                                  "absolute left-[-4px] top-1/2 w-5 h-0.5 bg-border/60",
                                  isLast && "hidden"
                                )} />
                                <div className="absolute left-[-4px] top-1/2 w-5 h-0.5 bg-border/60" />

                                <div className="ml-5 rounded-lg border bg-background/80 hover:bg-muted/20 transition-colors">
                                  <div className="flex items-center gap-3 px-4 py-3">
                                    {/* Icono producto */}
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted border">
                                      <Package className="h-4 w-4 text-muted-foreground" />
                                    </div>

                                    {/* Nombre */}
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm leading-tight truncate">
                                        {product.product_name}
                                      </p>
                                      <p className="text-xs text-muted-foreground font-mono">
                                        {product.product_code}
                                      </p>
                                    </div>

                                    {/* Métricas */}
                                    <div className="flex items-center gap-4 shrink-0">
                                      <div className="hidden sm:flex items-center gap-4 text-sm">
                                        <div className="text-right">
                                          <p className="text-xs text-muted-foreground">Entradas</p>
                                          <p className="tabular-nums text-green-600 dark:text-green-400 font-medium">
                                            +{formatQuantity(product.total_inbound, product.unit)}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-xs text-muted-foreground">Salidas</p>
                                          <p className="tabular-nums text-red-600 dark:text-red-400 font-medium">
                                            -{formatQuantity(product.total_outbound, product.unit)}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-xs text-muted-foreground">Pendiente</p>
                                          <p className="tabular-nums font-bold text-amber-600 dark:text-amber-400">
                                            {formatQuantity(product.pending_stock, product.unit)}
                                          </p>
                                        </div>
                                        <div className="text-right hidden lg:block">
                                          <p className="text-xs text-muted-foreground">Coste/día</p>
                                          <p className="tabular-nums font-semibold text-primary">
                                            {formatCurrency(product.daily_cost)}
                                          </p>
                                        </div>
                                      </div>

                                      {/* Menú de acciones */}
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="outline" size="sm" className="gap-1.5">
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
                                            <Link href={`/warehouses/${group.warehouse_id}/${product.product_id}`}>
                                              <CalendarDays className="mr-2 h-4 w-4 text-blue-500" />
                                              Ver calendario de stock
                                            </Link>
                                          </DropdownMenuItem>
                                          <DropdownMenuItem asChild>
                                            <Link href={`/warehouses/${group.warehouse_id}/${product.product_id}?tab=puestas`}>
                                              <FileText className="mr-2 h-4 w-4 text-violet-500" />
                                              Ver puestas activas
                                            </Link>
                                          </DropdownMenuItem>

                                          <DropdownMenuSeparator />

                                          <DropdownMenuItem asChild>
                                            <Link href="/movements/inbound">
                                              <ArrowDownToLine className="mr-2 h-4 w-4 text-green-500" />
                                              Nueva entrada
                                            </Link>
                                          </DropdownMenuItem>
                                          <DropdownMenuItem asChild>
                                            <Link href="/movements/outbound">
                                              <ArrowUpFromLine className="mr-2 h-4 w-4 text-red-500" />
                                              Nueva salida
                                            </Link>
                                          </DropdownMenuItem>
                                          <DropdownMenuItem asChild>
                                            <Link href="/puestas">
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
