"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Euro,
  TrendingUp,
  Warehouse,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StorageCostsService } from "@/services/storage-costs.service";
import type { DashboardKPIs, StockSummaryItem } from "@/types";
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

function TblRoot({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={`w-full caption-bottom text-sm ${className ?? ""}`} {...props} />
    </div>
  );
}
function TblHeader({ ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}
function TblBody({ ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}
function TblRow({ ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className="border-b transition-colors hover:bg-muted/50" {...props} />;
}
function TblHead({ ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground" {...props} />;
}
function TblCell({ ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className="p-4 align-middle" {...props} />;
}

interface WarehouseGroup {
  warehouse_id: string;
  warehouse_name: string;
  products: StockSummaryItem[];
  totalDailyCost: number;
  totalPendingStock: number;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [stockSummary, setStockSummary] = useState<StockSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const service = useMemo(() => new StorageCostsService(createClient()), []);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    const [kpisResult, stockResult] = await Promise.all([
      service.getDashboardKPIs(),
      service.getStockSummary(),
    ]);

    if (kpisResult.error) {
      toast({ variant: "destructive", title: "Error al cargar KPIs", description: kpisResult.error });
    } else {
      setKpis(kpisResult.data);
    }

    if (!stockResult.error) setStockSummary(stockResult.data ?? []);
    setIsLoading(false);
  }, [service]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const warehouseGroups = useMemo<WarehouseGroup[]>(() => {
    const groups = new Map<string, WarehouseGroup>();
    for (const item of stockSummary) {
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
      g.totalDailyCost += Number(item.daily_cost);
      g.totalPendingStock += Number(item.pending_stock);
    }
    return Array.from(groups.values()).sort((a, b) => b.totalDailyCost - a.totalDailyCost);
  }, [stockSummary]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Resumen general de almacenajes y costes"
      />

      {/* KPI Cards — row 1 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Coste hoy"
          value={formatCurrency(kpis?.total_cost_today ?? 0)}
          description="Coste generado hoy"
          icon={Euro}
          variant="default"
          isLoading={isLoading}
        />
        <StatsCard
          title="Coste del mes"
          value={formatCurrency(kpis?.total_cost_month ?? 0)}
          description="Mes en curso"
          icon={TrendingUp}
          variant="success"
          isLoading={isLoading}
        />
        <StatsCard
          title="Almacenes activos"
          value={formatNumber(kpis?.active_warehouses ?? 0)}
          description="Instalaciones operativas"
          icon={Warehouse}
          isLoading={isLoading}
        />
        <StatsCard
          title="Stock pendiente"
          value={formatNumber(kpis?.pending_stock_units ?? 0)}
          description="Unidades en almacén"
          icon={Package}
          variant="warning"
          isLoading={isLoading}
        />
      </div>

      {/* KPI Cards — row 2 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Coste anual"
          value={formatCurrency(kpis?.total_cost_year ?? 0)}
          description="Año en curso acumulado"
          icon={Euro}
          isLoading={isLoading}
        />
        <StatsCard
          title="Productos activos"
          value={formatNumber(kpis?.active_products ?? 0)}
          description="Con tarifa de almacenaje"
          icon={Package}
          isLoading={isLoading}
        />
        <StatsCard
          title="Entradas del mes"
          value={formatNumber(kpis?.inbound_month ?? 0)}
          description="Movimientos de entrada"
          icon={ArrowDownToLine}
          isLoading={isLoading}
        />
        <StatsCard
          title="Salidas del mes"
          value={formatNumber(kpis?.outbound_month ?? 0)}
          description="Movimientos de salida"
          icon={ArrowUpFromLine}
          isLoading={isLoading}
        />
      </div>

      {/* Warehouse Organigrama */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <Warehouse className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle>Organigrama de almacenes</CardTitle>
              <CardDescription className="mt-0.5">
                Stock activo y coste diario por almacén y producto
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : warehouseGroups.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Warehouse className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No hay stock activo en ningún almacén</p>
              </div>
            </div>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {warehouseGroups.map((group) => (
                <AccordionItem
                  key={group.warehouse_id}
                  value={group.warehouse_id}
                  className="border rounded-lg px-4 data-[state=open]:bg-muted/30"
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3 text-left flex-1 mr-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <Warehouse className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{group.warehouse_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {group.products.length}{" "}
                          {group.products.length === 1 ? "producto" : "productos"} con stock activo
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mr-2 shrink-0">
                        <Badge variant="outline" className="font-mono text-xs hidden sm:flex">
                          {formatNumber(group.totalPendingStock)} uds
                        </Badge>
                        <Badge className="font-mono text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                          {formatCurrency(group.totalDailyCost)}/día
                        </Badge>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="rounded-md border divide-y bg-background">
                      {group.products.map((product) => (
                        <div
                          key={product.product_id}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted">
                            <Package className="h-3.5 w-3.5 text-muted-foreground" />
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
                            <div className="text-right hidden sm:block">
                              <p className="text-xs text-muted-foreground">Pendiente</p>
                              <p className="text-sm font-semibold tabular-nums">
                                {formatQuantity(product.pending_stock, product.unit)}
                              </p>
                            </div>
                            <div className="text-right hidden md:block">
                              <p className="text-xs text-muted-foreground">Coste/día</p>
                              <p className="text-sm font-semibold tabular-nums text-primary">
                                {formatCurrency(product.daily_cost)}
                              </p>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                              <Link
                                href={`/warehouses/${group.warehouse_id}/${product.product_id}`}
                              >
                                <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                                Ver
                                <ChevronRight className="h-3.5 w-3.5 ml-0.5 opacity-60" />
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

      {/* Stock Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen de stock actual</CardTitle>
          <CardDescription>
            Stock pendiente por almacén y producto que genera coste
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : stockSummary.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <p className="text-sm">No hay stock activo en almacén</p>
            </div>
          ) : (
            <TblRoot>
              <TblHeader>
                <TblRow>
                  <TblHead>Almacén</TblHead>
                  <TblHead>Producto</TblHead>
                  <TblHead>Entradas</TblHead>
                  <TblHead>Salidas</TblHead>
                  <TblHead>Pendiente</TblHead>
                  <TblHead>Precio/día</TblHead>
                  <TblHead>Coste/día</TblHead>
                </TblRow>
              </TblHeader>
              <TblBody>
                {stockSummary.map((item, i) => (
                  <TblRow key={i}>
                    <TblCell>
                      <span className="text-xs font-mono text-muted-foreground">
                        {item.warehouse_name}
                      </span>
                    </TblCell>
                    <TblCell>
                      <div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.product_code}
                        </span>
                        <p className="text-sm font-medium">{item.product_name}</p>
                      </div>
                    </TblCell>
                    <TblCell>
                      <span className="tabular-nums text-sm">
                        {formatQuantity(item.total_inbound, item.unit)}
                      </span>
                    </TblCell>
                    <TblCell>
                      <span className="tabular-nums text-sm">
                        {formatQuantity(item.total_outbound, item.unit)}
                      </span>
                    </TblCell>
                    <TblCell>
                      <Badge variant="warning" className="tabular-nums font-semibold">
                        {formatQuantity(item.pending_stock, item.unit)}
                      </Badge>
                    </TblCell>
                    <TblCell>
                      <span className="tabular-nums text-sm text-muted-foreground">
                        {formatCurrency(item.daily_price)}
                      </span>
                    </TblCell>
                    <TblCell>
                      <span className="tabular-nums font-semibold text-primary">
                        {formatCurrency(item.daily_cost)}
                      </span>
                    </TblCell>
                  </TblRow>
                ))}
              </TblBody>
            </TblRoot>
          )}
        </CardContent>
      </Card>
    </>
  );
}
