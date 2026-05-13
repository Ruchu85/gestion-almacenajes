"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Euro,
  TrendingUp,
  Warehouse,
  Package,
  CalendarDays,
  ChevronRight,
  AlertCircle,
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatNumber, formatQuantity } from "@/utils/format";

// ────────────────────────────────────────────────────────
// Tipos locales para el organigrama
// ────────────────────────────────────────────────────────
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
  const [isLoadingKpis, setIsLoadingKpis] = useState(true);
  const [isLoadingStock, setIsLoadingStock] = useState(true);

  const supabase = useMemo(() => createClient(), []);
  const service = useMemo(() => new StorageCostsService(supabase), [supabase]);

  // Carga KPIs
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

  // Carga el organigrama directamente desde las tablas (evita problemas con el RPC get_stock_summary)
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

    // Agregar entradas por (warehouse, product)
    type StockKey = string;
    const stockMap = new Map<StockKey, ProductStock & { warehouse_id: string; warehouse_name: string }>();

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

    // Agregar salidas
    for (const row of outboundRes.data ?? []) {
      const key = `${row.warehouse_id}||${row.product_id}`;
      if (stockMap.has(key)) {
        stockMap.get(key)!.total_outbound += Number(row.quantity);
      }
    }

    // Construir grupos por almacén (solo con stock pendiente > 0)
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
      .map((g) => ({
        ...g,
        products: g.products.sort((a, b) => b.pending_stock - a.pending_stock),
      }));

    setWarehouseGroups(sorted);
    setIsLoadingStock(false);
  }, [supabase]);

  useEffect(() => {
    loadKpis();
    loadOrganigrama();
  }, [loadKpis, loadOrganigrama]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Resumen general de almacenajes y costes"
      />

      {/* KPIs compactos — fila única */}
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

      {/* Organigrama — bloque principal */}
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Warehouse className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Organigrama de almacenes</CardTitle>
                <CardDescription>
                  Despliega un almacén para ver sus productos y acceder al calendario de stock
                </CardDescription>
              </div>
            </div>
            {!isLoadingStock && warehouseGroups.length > 0 && (
              <Badge variant="outline" className="shrink-0">
                {warehouseGroups.length}{" "}
                {warehouseGroups.length === 1 ? "almacén activo" : "almacenes activos"}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {isLoadingStock ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
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
            <Accordion type="multiple" defaultValue={[warehouseGroups[0]?.warehouse_id]} className="space-y-2">
              {warehouseGroups.map((group) => (
                <AccordionItem
                  key={group.warehouse_id}
                  value={group.warehouse_id}
                  className="border rounded-xl overflow-hidden data-[state=open]:border-primary/30"
                >
                  <AccordionTrigger className="hover:no-underline px-5 py-4 hover:bg-muted/30 data-[state=open]:bg-muted/20">
                    <div className="flex items-center gap-4 text-left flex-1 mr-4">
                      {/* Icono almacén */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                        <Warehouse className="h-5 w-5 text-primary" />
                      </div>

                      {/* Nombre y conteo */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-base leading-tight truncate">
                          {group.warehouse_name}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {group.products.length}{" "}
                          {group.products.length === 1 ? "producto" : "productos"} con stock
                        </p>
                      </div>

                      {/* Métricas */}
                      <div className="flex items-center gap-2 mr-2 shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-muted-foreground">Stock total</p>
                          <p className="font-semibold tabular-nums text-sm">
                            {formatNumber(group.totalPendingStock)} uds
                          </p>
                        </div>
                        <div className="h-8 w-px bg-border hidden sm:block" />
                        <div className="text-right hidden md:block">
                          <p className="text-xs text-muted-foreground">Coste/día</p>
                          <p className="font-semibold tabular-nums text-sm text-primary">
                            {formatCurrency(group.totalDailyCost)}
                          </p>
                        </div>
                        <Badge
                          className="ml-1 shrink-0 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10 font-mono text-xs md:hidden"
                        >
                          {formatCurrency(group.totalDailyCost)}/día
                        </Badge>
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="px-5 pb-4 pt-0">
                    <div className="rounded-lg border divide-y bg-background/60">
                      {group.products.map((product) => (
                        <div
                          key={product.product_id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                        >
                          {/* Icono producto */}
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted border">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>

                          {/* Nombre y código */}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm leading-tight truncate">
                              {product.product_name}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">
                              {product.product_code}
                            </p>
                          </div>

                          {/* Métricas del producto */}
                          <div className="flex items-center gap-5 shrink-0">
                            <div className="text-right hidden sm:block">
                              <p className="text-xs text-muted-foreground">Entradas</p>
                              <p className="text-sm tabular-nums">
                                {formatQuantity(product.total_inbound, product.unit)}
                              </p>
                            </div>
                            <div className="text-right hidden sm:block">
                              <p className="text-xs text-muted-foreground">Salidas</p>
                              <p className="text-sm tabular-nums">
                                {formatQuantity(product.total_outbound, product.unit)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Pendiente</p>
                              <p className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">
                                {formatQuantity(product.pending_stock, product.unit)}
                              </p>
                            </div>
                            <div className="text-right hidden md:block">
                              <p className="text-xs text-muted-foreground">Coste/día</p>
                              <p className="text-sm font-semibold tabular-nums text-primary">
                                {formatCurrency(product.daily_cost)}
                              </p>
                            </div>

                            {/* Botón acceder */}
                            <Button variant="outline" size="sm" asChild className="shrink-0">
                              <Link
                                href={`/warehouses/${group.warehouse_id}/${product.product_id}`}
                              >
                                <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                                <span className="hidden sm:inline">Ver calendario</span>
                                <span className="sm:hidden">Ver</span>
                                <ChevronRight className="h-3.5 w-3.5 ml-0.5 opacity-50" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </>
  );
}
