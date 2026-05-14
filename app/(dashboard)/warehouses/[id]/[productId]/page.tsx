"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Euro,
  Package,
  CalendarDays,
  ClipboardList,
  Check,
  Loader2,
  Receipt,
} from "lucide-react";
import { format, parseISO, eachMonthOfInterval, startOfMonth, endOfMonth, isAfter } from "date-fns";
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
import { upsertMonthlyInvoice } from "./actions";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

interface DayEntry {
  dateStr: string;
  inbound: number;
  outbound: number;
  cost: number;
}

interface MonthGroup {
  yearMonth: string;    // "YYYY-MM"
  label: string;        // "Mayo 2026"
  days: DayEntry[];
  totalInbound: number;
  totalOutbound: number;
  totalCost: number;
  invoiceAmount: number | null;
  invoiceRef: string | null;
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

// ────────────────────────────────────────────────────────────────
// InvoiceRow — inline editable row for each month
// ────────────────────────────────────────────────────────────────
function InvoiceRow({
  warehouseId,
  productId,
  yearMonth,
  calculatedCost,
  initialAmount,
  initialRef,
}: {
  warehouseId: string;
  productId: string;
  yearMonth: string;
  calculatedCost: number;
  initialAmount: number | null;
  initialRef: string | null;
}) {
  const [amount, setAmount] = useState(initialAmount !== null ? String(initialAmount) : "");
  const [ref, setRef] = useState(initialRef ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(newAmount: string, newRef: string) {
    const parsed = newAmount.trim() !== "" ? parseFloat(newAmount.replace(",", ".")) : null;
    setSaving(true);
    setSaved(false);
    const result = await upsertMonthlyInvoice(warehouseId, productId, yearMonth, parsed, newRef.trim() || null, null);
    setSaving(false);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al guardar", description: result.error });
    } else {
      setSaved(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaved(false), 2000);
    }
  }

  function scheduleAutoSave(newAmount: string, newRef: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(newAmount, newRef), 1200);
  }

  const diff = amount.trim() !== ""
    ? parseFloat(amount.replace(",", ".")) - calculatedCost
    : null;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-3 mt-3 border-t border-dashed">
      <Receipt className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
      <span className="text-sm font-medium text-muted-foreground shrink-0">Factura recibida:</span>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Importe factura */}
        <div className="relative">
          <Euro className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              scheduleAutoSave(e.target.value, ref);
            }}
            onBlur={() => {
              if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
              save(amount, ref);
            }}
            className="pl-8 pr-3 py-1.5 text-sm border rounded-md w-32 tabular-nums bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Referencia */}
        <input
          type="text"
          placeholder="Nº factura / referencia"
          value={ref}
          onChange={(e) => {
            setRef(e.target.value);
            scheduleAutoSave(amount, e.target.value);
          }}
          onBlur={() => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            save(amount, ref);
          }}
          className="px-3 py-1.5 text-sm border rounded-md w-44 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />

        {/* Estado guardado */}
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {saved && !saving && <Check className="h-3.5 w-3.5 text-green-500" />}

        {/* Diferencia con el coste calculado */}
        {diff !== null && !isNaN(diff) && (
          <Badge
            variant="outline"
            className={cn(
              "text-xs tabular-nums",
              Math.abs(diff) < 0.01
                ? "border-green-400 text-green-600"
                : diff > 0
                ? "border-amber-400 text-amber-600"
                : "border-red-400 text-red-600"
            )}
          >
            {diff >= 0 ? "+" : ""}
            {formatCurrency(diff)} vs calculado
          </Badge>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────
export default function WarehouseProductPage() {
  const params = useParams<{ id: string; productId: string }>();

  const [activeTab, setActiveTab] = useState("calendar");
  const [warehouseName, setWarehouseName] = useState("");
  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [productUnit, setProductUnit] = useState("ud");

  const [monthGroups, setMonthGroups] = useState<MonthGroup[]>([]);
  const [allInbound, setAllInbound] = useState<InboundRow[]>([]);
  const [allOutbound, setAllOutbound] = useState<OutboundRow[]>([]);
  const [allPuestas, setAllPuestas] = useState<PuestaRow[]>([]);

  const [isLoadingMeta, setIsLoadingMeta] = useState(true);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  // Read ?tab= from URL on mount
  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const urlParams = new URLSearchParams(search);
    const tab = urlParams.get("tab");
    if (tab && ["calendar", "entradas", "salidas", "puestas"].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  // ── Load meta + tabs data ─────────────────────────────────────
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

  // ── Load vertical calendar data (all history) ─────────────────
  const loadCalendar = useCallback(async () => {
    setIsLoadingCalendar(true);

    const [inboundRes, outboundRes, costsRes, invoicesRes] = await Promise.all([
      supabase
        .from("inbound_movements")
        .select("movement_date, quantity")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId)
        .order("movement_date", { ascending: true }),
      supabase
        .from("outbound_movements")
        .select("movement_date, quantity")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId)
        .order("movement_date", { ascending: true }),
      supabase
        .from("storage_costs")
        .select("cost_date, total_cost")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId)
        .order("cost_date", { ascending: true }),
      supabase
        .from("monthly_invoices")
        .select("year_month, invoice_amount, invoice_ref")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId),
    ]);

    // Build day-level map
    const dayMap = new Map<string, DayEntry>();
    function getDay(dateStr: string) {
      if (!dayMap.has(dateStr)) dayMap.set(dateStr, { dateStr, inbound: 0, outbound: 0, cost: 0 });
      return dayMap.get(dateStr)!;
    }

    for (const row of inboundRes.data ?? [])  getDay(row.movement_date).inbound  += Number(row.quantity);
    for (const row of outboundRes.data ?? []) getDay(row.movement_date).outbound += Number(row.quantity);
    for (const row of costsRes.data ?? [])    getDay(row.cost_date).cost         += Number(row.total_cost);

    // Build invoice map
    const invoiceMap = new Map<string, { amount: number | null; ref: string | null }>();
    for (const row of invoicesRes.data ?? []) {
      invoiceMap.set(row.year_month, {
        amount: row.invoice_amount ?? null,
        ref: row.invoice_ref ?? null,
      });
    }

    if (dayMap.size === 0) {
      setMonthGroups([]);
      setIsLoadingCalendar(false);
      return;
    }

    // Determine range: from first day with data to today
    const allDates = Array.from(dayMap.keys()).sort();
    const firstDate = parseISO(allDates[0]);
    const today = new Date();

    // Generate all months in range (most recent first)
    const months = eachMonthOfInterval({ start: startOfMonth(firstDate), end: startOfMonth(today) }).reverse();

    const groups: MonthGroup[] = months.map((monthStart) => {
      const ym = format(monthStart, "yyyy-MM");
      const monthEnd = endOfMonth(monthStart);
      const label = format(monthStart, "MMMM yyyy", { locale: es });

      // Collect days in this month that have activity
      const days: DayEntry[] = [];
      let totalInbound = 0, totalOutbound = 0, totalCost = 0;

      for (const [dateStr, entry] of dayMap.entries()) {
        const d = parseISO(dateStr);
        if (d >= monthStart && d <= monthEnd) {
          days.push(entry);
          totalInbound += entry.inbound;
          totalOutbound += entry.outbound;
          totalCost += entry.cost;
        }
      }

      // Sort days descending (most recent first within each month)
      days.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

      const inv = invoiceMap.get(ym);
      return {
        yearMonth: ym,
        label,
        days,
        totalInbound,
        totalOutbound,
        totalCost,
        invoiceAmount: inv?.amount ?? null,
        invoiceRef: inv?.ref ?? null,
      };
    }).filter((g) => g.days.length > 0); // only show months with activity

    setMonthGroups(groups);
    setIsLoadingCalendar(false);
  }, [supabase, params.id, params.productId]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  // ── Helpers ───────────────────────────────────────────────────
  const estadoBadge = (estado: string) => {
    if (estado === "abierta") return (
      <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-950/40 dark:text-green-400">
        Abierta
      </Badge>
    );
    if (estado === "finalizada") return <Badge variant="secondary">Finalizada</Badge>;
    return <Badge variant="outline">Cerrada</Badge>;
  };

  // ── Calendar totals (for KPI row) ─────────────────────────────
  const allTimeTotals = useMemo(() => {
    return monthGroups.reduce(
      (acc, mg) => ({
        inbound: acc.inbound + mg.totalInbound,
        outbound: acc.outbound + mg.totalOutbound,
        cost: acc.cost + mg.totalCost,
      }),
      { inbound: 0, outbound: 0, cost: 0 }
    );
  }, [monthGroups]);

  return (
    <>
      <PageHeader
        title={isLoadingMeta ? "Cargando…" : productName}
        description={isLoadingMeta ? "" : `${productCode} · ${warehouseName}`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Link>
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="calendar">
            <CalendarDays className="h-4 w-4 mr-1.5" />
            Calendario
          </TabsTrigger>
          <TabsTrigger value="entradas">
            <ArrowDownToLine className="h-4 w-4 mr-1.5" />
            Entradas
            {allInbound.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{allInbound.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="salidas">
            <ArrowUpFromLine className="h-4 w-4 mr-1.5" />
            Salidas
            {allOutbound.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{allOutbound.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="puestas">
            <ClipboardList className="h-4 w-4 mr-1.5" />
            Puestas
            {allPuestas.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{allPuestas.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════
            TAB: CALENDARIO VERTICAL
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="calendar" className="space-y-4">

          {/* Totales globales */}
          <div className="grid gap-3 grid-cols-3">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 dark:bg-green-950/40">
                    <ArrowDownToLine className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total entradas</p>
                    <p className="text-lg font-bold tabular-nums">
                      {formatQuantity(allTimeTotals.inbound, productUnit)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-950/40">
                    <ArrowUpFromLine className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total salidas</p>
                    <p className="text-lg font-bold tabular-nums">
                      {formatQuantity(allTimeTotals.outbound, productUnit)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40">
                    <Euro className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Coste acumulado</p>
                    <p className="text-lg font-bold tabular-nums">
                      {formatCurrency(allTimeTotals.cost)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lista vertical de meses */}
          {isLoadingCalendar ? (
            <div className="space-y-4">
              {[1, 2].map((i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
            </div>
          ) : monthGroups.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <CalendarDays className="h-10 w-10 opacity-30 mb-3" />
                <p className="font-medium">Sin movimientos registrados</p>
                <p className="text-sm mt-1 opacity-70">Los movimientos y costes aparecerán aquí por día y mes</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {monthGroups.map((mg) => (
                <Card key={mg.yearMonth} className="overflow-hidden">
                  {/* Cabecera del mes */}
                  <CardHeader className="py-3 px-5 bg-muted/30 border-b">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base capitalize font-semibold">
                        {mg.label}
                      </CardTitle>
                      <div className="flex items-center gap-4 text-sm">
                        {mg.totalInbound > 0 && (
                          <span className="text-green-600 dark:text-green-400 tabular-nums font-medium">
                            <ArrowDownToLine className="inline h-3.5 w-3.5 mr-0.5 -mt-0.5" />
                            +{formatQuantity(mg.totalInbound, productUnit)}
                          </span>
                        )}
                        {mg.totalOutbound > 0 && (
                          <span className="text-red-600 dark:text-red-400 tabular-nums font-medium">
                            <ArrowUpFromLine className="inline h-3.5 w-3.5 mr-0.5 -mt-0.5" />
                            -{formatQuantity(mg.totalOutbound, productUnit)}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    {/* Tabla de días */}
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/10">
                            <th className="px-5 py-2 text-left font-medium text-muted-foreground w-28">Fecha</th>
                            <th className="px-4 py-2 text-right font-medium text-muted-foreground">Entradas</th>
                            <th className="px-4 py-2 text-right font-medium text-muted-foreground">Salidas</th>
                            <th className="px-5 py-2 text-right font-medium text-muted-foreground">Almacenaje</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mg.days.map((day) => {
                            const dateObj = parseISO(day.dateStr);
                            return (
                              <tr key={day.dateStr} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                                  {format(dateObj, "dd/MM/yyyy")}
                                  <span className="ml-2 text-[10px] text-muted-foreground/60 capitalize">
                                    {format(dateObj, "EEE", { locale: es })}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums">
                                  {day.inbound > 0 ? (
                                    <span className="text-green-600 dark:text-green-400 font-medium">
                                      +{formatQuantity(day.inbound, productUnit)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/40">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums">
                                  {day.outbound > 0 ? (
                                    <span className="text-red-600 dark:text-red-400 font-medium">
                                      -{formatQuantity(day.outbound, productUnit)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/40">—</span>
                                  )}
                                </td>
                                <td className="px-5 py-2.5 text-right tabular-nums">
                                  {day.cost > 0 ? (
                                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                                      {formatCurrency(day.cost)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/40">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pie del mes: totales + factura */}
                    <div className="px-5 py-4 bg-muted/10 border-t">
                      {/* Totales del mes */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                          Total {mg.label}
                        </span>
                        <div className="flex items-center gap-6">
                          {mg.totalInbound > 0 && (
                            <span className="text-green-600 dark:text-green-400 tabular-nums">
                              +{formatQuantity(mg.totalInbound, productUnit)}
                            </span>
                          )}
                          {mg.totalOutbound > 0 && (
                            <span className="text-red-600 dark:text-red-400 tabular-nums">
                              -{formatQuantity(mg.totalOutbound, productUnit)}
                            </span>
                          )}
                          <span className={cn(
                            "font-bold tabular-nums text-base",
                            mg.totalCost > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                          )}>
                            {formatCurrency(mg.totalCost)}
                          </span>
                        </div>
                      </div>

                      {/* Input factura del proveedor */}
                      <InvoiceRow
                        warehouseId={params.id}
                        productId={params.productId}
                        yearMonth={mg.yearMonth}
                        calculatedCost={mg.totalCost}
                        initialAmount={mg.invoiceAmount}
                        initialRef={mg.invoiceRef}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════
            TAB: ENTRADAS
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="entradas">
          <Card>
            <CardHeader>
              <CardTitle>Entradas de mercancía</CardTitle>
              <CardDescription>
                Movimientos de entrada de {productName} en {warehouseName}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingMeta ? (
                <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : allInbound.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ArrowDownToLine className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No hay entradas registradas</p>
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
                        <tr key={row.id} className="border-b hover:bg-muted/50 transition-colors">
                          <td className="p-4 font-mono text-sm">{formatDate(row.movement_date)}</td>
                          <td className="p-4">
                            <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-950/40 dark:text-green-400 tabular-nums font-semibold">
                              +{formatQuantity(row.quantity, productUnit)}
                            </Badge>
                          </td>
                          <td className="p-4 text-sm">{row.supplier?.name ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-4 text-sm text-muted-foreground">{row.comments ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════
            TAB: SALIDAS
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="salidas">
          <Card>
            <CardHeader>
              <CardTitle>Salidas de mercancía</CardTitle>
              <CardDescription>
                Movimientos de salida de {productName} en {warehouseName}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingMeta ? (
                <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : allOutbound.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ArrowUpFromLine className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No hay salidas registradas</p>
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
                        <tr key={row.id} className="border-b hover:bg-muted/50 transition-colors">
                          <td className="p-4 font-mono text-sm">{formatDate(row.movement_date)}</td>
                          <td className="p-4">
                            <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-400 tabular-nums font-semibold">
                              -{formatQuantity(row.quantity, productUnit)}
                            </Badge>
                          </td>
                          <td className="p-4 text-sm">{row.customer?.name ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-4 text-sm text-muted-foreground">{row.comments ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════
            TAB: PUESTAS A DISPOSICIÓN
        ═══════════════════════════════════════════════════════ */}
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
                <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : allPuestas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ClipboardList className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No hay puestas a disposición para esta combinación</p>
                </div>
              ) : (
                <div className="relative w-full overflow-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Contrato</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Cliente</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Fecha</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Cantidad</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Plancha</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Estado</th>
                        <th className="h-10 px-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {allPuestas.map((row) => (
                        <tr key={row.id} className="border-b hover:bg-muted/50 transition-colors">
                          <td className="p-4 font-mono text-sm">{row.numero_contrato ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-4 text-sm">{row.customer?.name ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-4 font-mono text-sm">{formatDate(row.fecha_puesta)}</td>
                          <td className="p-4 tabular-nums font-semibold text-sm">{formatQuantity(row.cantidad_inicial, productUnit)}</td>
                          <td className="p-4 text-sm text-muted-foreground">{row.dias_plancha} días</td>
                          <td className="p-4">{estadoBadge(row.estado)}</td>
                          <td className="p-4">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/puestas/${row.id}`}>Ver detalle</Link>
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
