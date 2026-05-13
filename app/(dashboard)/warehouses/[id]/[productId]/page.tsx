"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Euro,
  Warehouse,
  Package,
  CalendarDays,
  ClipboardList,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatQuantity } from "@/utils/format";
import { toast } from "@/hooks/use-toast";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface DayData {
  inbound: number;
  outbound: number;
  cost: number;
}

interface InboundRow {
  id: string;
  movement_date: string;
  quantity: number;
  comments: string | null;
  supplier: { name: string } | null;
}

interface OutboundRow {
  id: string;
  movement_date: string;
  quantity: number;
  comments: string | null;
  customer: { name: string } | null;
}

interface PuestaRow {
  id: string;
  numero_contrato: string | null;
  fecha_puesta: string;
  cantidad_inicial: number;
  estado: string;
  dias_plancha: number;
  customer: { name: string } | null;
}

export default function WarehouseProductPage() {
  const params = useParams<{ id: string; productId: string }>();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dayData, setDayData] = useState<Record<string, DayData>>({});
  const [monthSummary, setMonthSummary] = useState({ inbound: 0, outbound: 0, cost: 0 });

  const [warehouseName, setWarehouseName] = useState("");
  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [productUnit, setProductUnit] = useState("ud");

  const [allInbound, setAllInbound] = useState<InboundRow[]>([]);
  const [allOutbound, setAllOutbound] = useState<OutboundRow[]>([]);
  const [allPuestas, setAllPuestas] = useState<PuestaRow[]>([]);

  const [isLoadingMeta, setIsLoadingMeta] = useState(true);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  // Load warehouse, product meta + all movements/puestas once
  const loadMeta = useCallback(async () => {
    setIsLoadingMeta(true);
    const [warehouseRes, productRes, inboundRes, outboundRes, puestaRes] = await Promise.all([
      supabase.from("warehouses").select("name").eq("id", params.id).single(),
      supabase.from("products").select("name, code, unit").eq("id", params.productId).single(),
      supabase
        .from("inbound_movements")
        .select("id, movement_date, quantity, comments, supplier:suppliers(name)")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId)
        .order("movement_date", { ascending: false }),
      supabase
        .from("outbound_movements")
        .select("id, movement_date, quantity, comments, customer:customers(name)")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId)
        .order("movement_date", { ascending: false }),
      supabase
        .from("puestas_a_disposicion")
        .select("id, numero_contrato, fecha_puesta, cantidad_inicial, estado, dias_plancha, customer:customers(name)")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId)
        .order("fecha_puesta", { ascending: false }),
    ]);

    if (warehouseRes.error) toast({ variant: "destructive", title: "Error", description: warehouseRes.error.message });
    if (warehouseRes.data) setWarehouseName(warehouseRes.data.name);

    if (productRes.data) {
      setProductName(productRes.data.name);
      setProductCode(productRes.data.code);
      setProductUnit(productRes.data.unit ?? "ud");
    }

    setAllInbound((inboundRes.data ?? []) as InboundRow[]);
    setAllOutbound((outboundRes.data ?? []) as OutboundRow[]);
    setAllPuestas((puestaRes.data ?? []) as PuestaRow[]);

    setIsLoadingMeta(false);
  }, [supabase, params.id, params.productId]);

  // Load calendar data for selected month
  const loadCalendar = useCallback(async () => {
    setIsLoadingCalendar(true);
    const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");

    const [inboundRes, outboundRes, costsRes] = await Promise.all([
      supabase
        .from("inbound_movements")
        .select("movement_date, quantity")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId)
        .gte("movement_date", start)
        .lte("movement_date", end),
      supabase
        .from("outbound_movements")
        .select("movement_date, quantity")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId)
        .gte("movement_date", start)
        .lte("movement_date", end),
      supabase
        .from("storage_costs")
        .select("cost_date, total_cost")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId)
        .gte("cost_date", start)
        .lte("cost_date", end),
    ]);

    const map: Record<string, DayData> = {};

    for (const row of inboundRes.data ?? []) {
      if (!map[row.movement_date]) map[row.movement_date] = { inbound: 0, outbound: 0, cost: 0 };
      map[row.movement_date].inbound += Number(row.quantity);
    }
    for (const row of outboundRes.data ?? []) {
      if (!map[row.movement_date]) map[row.movement_date] = { inbound: 0, outbound: 0, cost: 0 };
      map[row.movement_date].outbound += Number(row.quantity);
    }
    for (const row of costsRes.data ?? []) {
      if (!map[row.cost_date]) map[row.cost_date] = { inbound: 0, outbound: 0, cost: 0 };
      map[row.cost_date].cost += Number(row.total_cost);
    }

    setDayData(map);

    const summary = Object.values(map).reduce(
      (acc, d) => ({
        inbound: acc.inbound + d.inbound,
        outbound: acc.outbound + d.outbound,
        cost: acc.cost + d.cost,
      }),
      { inbound: 0, outbound: 0, cost: 0 }
    );
    setMonthSummary(summary);
    setIsLoadingCalendar(false);
  }, [supabase, params.id, params.productId, currentMonth]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    // Monday-first: (getDay returns 0=Sun, so shift by +6 mod 7)
    const firstDayOffset = (getDay(start) + 6) % 7;
    return { days, firstDayOffset };
  }, [currentMonth]);

  const estadoBadge = (estado: string) => {
    if (estado === "abierta") return <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-950/40 dark:text-green-400">Abierta</Badge>;
    if (estado === "finalizada") return <Badge variant="secondary">Finalizada</Badge>;
    return <Badge variant="outline">Cerrada</Badge>;
  };

  return (
    <>
      <PageHeader
        title={isLoadingMeta ? "Cargando…" : `${productName}`}
        description={
          isLoadingMeta
            ? ""
            : `${productCode} · ${warehouseName}`
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="calendar">
        <TabsList className="mb-4">
          <TabsTrigger value="calendar">
            <CalendarDays className="h-4 w-4 mr-1.5" />
            Calendario
          </TabsTrigger>
          <TabsTrigger value="entradas">
            <ArrowDownToLine className="h-4 w-4 mr-1.5" />
            Entradas
            {allInbound.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {allInbound.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="salidas">
            <ArrowUpFromLine className="h-4 w-4 mr-1.5" />
            Salidas
            {allOutbound.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {allOutbound.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="puestas">
            <ClipboardList className="h-4 w-4 mr-1.5" />
            Puestas
            {allPuestas.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {allPuestas.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── CALENDARIO ─────────────────────────────── */}
        <TabsContent value="calendar" className="space-y-4">
          {/* Month summary */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-950/40">
                    <ArrowDownToLine className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Entradas del mes</p>
                    <p className="text-xl font-bold tabular-nums">
                      {formatQuantity(monthSummary.inbound, productUnit)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-950/40">
                    <ArrowUpFromLine className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Salidas del mes</p>
                    <p className="text-xl font-bold tabular-nums">
                      {formatQuantity(monthSummary.outbound, productUnit)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40">
                    <Euro className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Coste de almacenaje</p>
                    <p className="text-xl font-bold tabular-nums">
                      {formatCurrency(monthSummary.cost)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Calendar grid */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="capitalize">
                  {format(currentMonth, "MMMM yyyy", { locale: es })}
                </CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentMonth(new Date())}
                  >
                    Hoy
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingCalendar ? (
                <Skeleton className="h-96 w-full" />
              ) : (
                <div>
                  {/* Weekday headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {WEEKDAYS.map((day) => (
                      <div
                        key={day}
                        className="py-2 text-center text-xs font-medium text-muted-foreground"
                      >
                        {day}
                      </div>
                    ))}
                  </div>
                  {/* Day cells */}
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: calendarDays.firstDayOffset }).map((_, i) => (
                      <div key={`pad-${i}`} className="h-24 rounded-lg" />
                    ))}
                    {calendarDays.days.map((day) => {
                      const key = format(day, "yyyy-MM-dd");
                      const data = dayData[key];
                      const today = isToday(day);

                      return (
                        <div
                          key={key}
                          className={cn(
                            "h-24 rounded-lg border p-1.5 flex flex-col transition-colors",
                            today && "border-primary/60 bg-primary/5",
                            !data && "bg-muted/20 border-border/50",
                            data && !today && "bg-card"
                          )}
                        >
                          <span
                            className={cn(
                              "text-xs font-medium self-end leading-none",
                              today
                                ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                                : "text-muted-foreground"
                            )}
                          >
                            {format(day, "d")}
                          </span>
                          {data && (
                            <div className="flex flex-col gap-0.5 mt-auto text-[10px] leading-snug">
                              {data.inbound > 0 && (
                                <div className="flex items-center gap-0.5 text-green-600 dark:text-green-400">
                                  <ArrowDownToLine className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate tabular-nums">
                                    +{formatQuantity(data.inbound, productUnit)}
                                  </span>
                                </div>
                              )}
                              {data.outbound > 0 && (
                                <div className="flex items-center gap-0.5 text-red-600 dark:text-red-400">
                                  <ArrowUpFromLine className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate tabular-nums">
                                    -{formatQuantity(data.outbound, productUnit)}
                                  </span>
                                </div>
                              )}
                              {data.cost > 0 && (
                                <div className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400">
                                  <Euro className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate tabular-nums">
                                    {formatCurrency(data.cost)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ENTRADAS ───────────────────────────────── */}
        <TabsContent value="entradas">
          <Card>
            <CardHeader>
              <CardTitle>Entradas de mercancía</CardTitle>
              <CardDescription>
                Todos los movimientos de entrada de {productName} en {warehouseName}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingMeta ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : allInbound.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <div className="text-center">
                    <ArrowDownToLine className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No hay entradas registradas</p>
                  </div>
                </div>
              ) : (
                <div className="relative w-full overflow-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Fecha</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Cantidad</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Proveedor</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Comentarios</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allInbound.map((row) => (
                        <tr key={row.id} className="border-b transition-colors hover:bg-muted/50">
                          <td className="p-4 align-middle font-mono text-sm">{formatDate(row.movement_date)}</td>
                          <td className="p-4 align-middle">
                            <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-950/40 dark:text-green-400 tabular-nums font-semibold">
                              +{formatQuantity(row.quantity, productUnit)}
                            </Badge>
                          </td>
                          <td className="p-4 align-middle text-sm">
                            {row.supplier?.name ?? <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-4 align-middle text-sm text-muted-foreground">
                            {row.comments ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SALIDAS ────────────────────────────────── */}
        <TabsContent value="salidas">
          <Card>
            <CardHeader>
              <CardTitle>Salidas de mercancía</CardTitle>
              <CardDescription>
                Todos los movimientos de salida de {productName} en {warehouseName}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingMeta ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : allOutbound.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <div className="text-center">
                    <ArrowUpFromLine className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No hay salidas registradas</p>
                  </div>
                </div>
              ) : (
                <div className="relative w-full overflow-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Fecha</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Cantidad</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Cliente</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Comentarios</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allOutbound.map((row) => (
                        <tr key={row.id} className="border-b transition-colors hover:bg-muted/50">
                          <td className="p-4 align-middle font-mono text-sm">{formatDate(row.movement_date)}</td>
                          <td className="p-4 align-middle">
                            <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-400 tabular-nums font-semibold">
                              -{formatQuantity(row.quantity, productUnit)}
                            </Badge>
                          </td>
                          <td className="p-4 align-middle text-sm">
                            {row.customer?.name ?? <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-4 align-middle text-sm text-muted-foreground">
                            {row.comments ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PUESTAS A DISPOSICIÓN ──────────────────── */}
        <TabsContent value="puestas">
          <Card>
            <CardHeader>
              <CardTitle>Puestas a disposición</CardTitle>
              <CardDescription>
                Contratos de puesta a disposición de {productName} en {warehouseName}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingMeta ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : allPuestas.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <div className="text-center">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No hay puestas a disposición para esta combinación</p>
                  </div>
                </div>
              ) : (
                <div className="relative w-full overflow-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Contrato</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Cliente</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Fecha puesta</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Cantidad</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Plancha</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Estado</th>
                        <th className="h-10 px-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {allPuestas.map((row) => (
                        <tr key={row.id} className="border-b transition-colors hover:bg-muted/50">
                          <td className="p-4 align-middle font-mono text-sm">
                            {row.numero_contrato ?? <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-4 align-middle text-sm">
                            {row.customer?.name ?? <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-4 align-middle font-mono text-sm">
                            {formatDate(row.fecha_puesta)}
                          </td>
                          <td className="p-4 align-middle tabular-nums font-semibold text-sm">
                            {formatQuantity(row.cantidad_inicial, productUnit)}
                          </td>
                          <td className="p-4 align-middle text-sm text-muted-foreground">
                            {row.dias_plancha} días
                          </td>
                          <td className="p-4 align-middle">{estadoBadge(row.estado)}</td>
                          <td className="p-4 align-middle">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/puestas/${row.id}`}>
                                Ver detalle
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
