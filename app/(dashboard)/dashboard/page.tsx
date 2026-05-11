"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Euro,
  TrendingUp,
  Warehouse,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { StorageCostsService } from "@/services/storage-costs.service";
import type { DashboardKPIs, MonthlyCostEvolution, StockSummaryItem } from "@/types";
import { StatsCard } from "@/components/shared/stats-card";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatNumber, formatQuantity } from "@/utils/format";

// Inline Table primitives (avoiding circular import with data-table.tsx)
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

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${months[parseInt(month) - 1]} ${year.slice(2)}`;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [evolution, setEvolution] = useState<MonthlyCostEvolution[]>([]);
  const [stockSummary, setStockSummary] = useState<StockSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const service = new StorageCostsService(createClient());

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    const [kpisResult, evolutionResult, stockResult] = await Promise.all([
      service.getDashboardKPIs(),
      service.getMonthlyCostEvolution(12),
      service.getStockSummary(),
    ]);

    if (kpisResult.error) {
      toast({ variant: "destructive", title: "Error al cargar KPIs", description: kpisResult.error });
    } else {
      setKpis(kpisResult.data);
    }

    if (!evolutionResult.error) setEvolution(evolutionResult.data ?? []);
    if (!stockResult.error) setStockSummary(stockResult.data ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const chartData = evolution.map((item) => ({
    month: formatMonth(item.month),
    coste: Number(item.total_cost),
  }));

  const stockChartData = stockSummary
    .slice(0, 10)
    .map((item) => ({
      producto: item.product_code,
      pendiente: Number(item.pending_stock),
      coste_dia: Number(item.daily_cost),
    }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Resumen general de almacenajes y costes"
      />

      {/* KPI Cards */}
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

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Evolución de costes (12 meses)</CardTitle>
            <CardDescription>Coste total de almacenaje por mes</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : chartData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Sin datos de costes calculados</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorCoste" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Coste"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="coste"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#colorCoste)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock por producto (Top 10)</CardTitle>
            <CardDescription>Unidades pendientes y coste diario</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : stockChartData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Sin stock activo en almacén</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stockChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="producto"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="pendiente" name="Stock" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="coste_dia" name="€/día" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

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
                      <div>
                        <span className="text-xs font-mono text-muted-foreground">{item.warehouse_name}</span>
                      </div>
                    </TblCell>
                    <TblCell>
                      <div>
                        <span className="font-mono text-xs text-muted-foreground">{item.product_code}</span>
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
