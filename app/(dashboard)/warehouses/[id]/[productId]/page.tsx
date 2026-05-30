"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Euro,
  Package,
  CalendarDays,
  ClipboardList,
  Check,
  Loader2,
  Receipt,
  Truck,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import {
  format,
  parseISO,
  eachMonthOfInterval,
  startOfMonth,
  endOfMonth,
  getDaysInMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { calculatePendingQuantity } from "@/utils/calculations";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MatriculaInput } from "@/components/shared/matricula-input";
import { getMatriculas, upsertMatricula } from "@/lib/actions/matriculas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatQuantity } from "@/utils/format";
import { toast } from "@/hooks/use-toast";
import {
  addMonthlyInvoice,
  updateMonthlyInvoice,
  deleteMonthlyInvoice,
  updateInboundMovement,
  deleteInboundMovement,
  updateOutboundMovement,
  deleteOutboundMovement,
} from "./actions";
import { SalidaParcialForm } from "@/modules/puestas/components/salida-parcial-form";
import { createSalidaParcial, triggerPlanchaAutoExit } from "../../../puestas/actions";
import type { SalidaParcialFormValues } from "@/validations/salida-parcial.schema";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

interface DayEntry {
  dateStr: string;
  inbound: number;
  outbound: number;
  cost: number;
  isEstimated: boolean;
}

interface InvoiceRecord {
  id: string;
  amount: number | null;
  ref: string | null;
}

interface MonthGroup {
  yearMonth: string;
  label: string;
  days: DayEntry[];
  totalInbound: number;
  totalOutbound: number;
  totalCost: number;
  hasEstimated: boolean;
  invoices: InvoiceRecord[];
}

interface InboundRow {
  id: string;
  movement_date: string;
  quantity: number;
  free_days: number;
  comments: string | null;
  supplier: { name: string } | null;
}

interface OutboundRow {
  id: string;
  movement_date: string;
  quantity: number;
  comments: string | null;
  matricula: string | null;
  from_puesta: boolean;
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
  salidas_parciales: { cantidad: number; tipo: string }[];
}

// ────────────────────────────────────────────────────────────────
// InvoiceLineItem — una fila de factura editable
// ────────────────────────────────────────────────────────────────
function InvoiceLineItem({
  id,
  initialAmount,
  initialRef,
  calculatedCost,
  isOnly,
  onDelete,
}: {
  id: string;
  initialAmount: number | null;
  initialRef: string | null;
  calculatedCost: number;
  isOnly: boolean;
  onDelete: (id: string) => void;
}) {
  const [amount, setAmount] = useState(initialAmount !== null ? String(initialAmount) : "");
  const [ref, setRef] = useState(initialRef ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(a: string, r: string) {
    const parsed = a.trim() !== "" ? parseFloat(a.replace(",", ".")) : null;
    setSaving(true);
    setSaved(false);
    const result = await updateMonthlyInvoice(id, parsed, r.trim() || null);
    setSaving(false);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al guardar", description: result.error });
    } else {
      setSaved(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaved(false), 2000);
    }
  }

  function schedule(a: string, r: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(a, r), 1200);
  }

  const diff = isOnly && amount.trim() !== "" && !isNaN(parseFloat(amount.replace(",", ".")))
    ? parseFloat(amount.replace(",", ".")) - calculatedCost
    : null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative">
        <Euro className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="number" step="0.01" min="0" placeholder="0,00"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); schedule(e.target.value, ref); }}
          onBlur={() => { if (timerRef.current) clearTimeout(timerRef.current); save(amount, ref); }}
          className="pl-8 pr-3 py-1.5 text-sm border rounded-md w-32 tabular-nums bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <input
        type="text" placeholder="Nº factura / referencia"
        value={ref}
        onChange={(e) => { setRef(e.target.value); schedule(amount, e.target.value); }}
        onBlur={() => { if (timerRef.current) clearTimeout(timerRef.current); save(amount, ref); }}
        className="px-3 py-1.5 text-sm border rounded-md w-44 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
      {saved && !saving && <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />}
      {diff !== null && !isNaN(diff) && (
        <Badge
          variant="outline"
          className={cn(
            "text-xs tabular-nums",
            Math.abs(diff) < 0.01 ? "border-green-400 text-green-600" :
            diff > 0 ? "border-amber-400 text-amber-600" : "border-red-400 text-red-600"
          )}
        >
          {diff >= 0 ? "+" : ""}{formatCurrency(diff)} vs calculado
        </Badge>
      )}
      <button
        type="button"
        onClick={() => onDelete(id)}
        className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// InvoiceSection — sección de facturas de un mes (multi-línea)
// ────────────────────────────────────────────────────────────────
function InvoiceSection({
  warehouseId,
  productId,
  yearMonth,
  calculatedCost,
  initialInvoices,
}: {
  warehouseId: string;
  productId: string;
  yearMonth: string;
  calculatedCost: number;
  initialInvoices: InvoiceRecord[];
}) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(initialInvoices);
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    setAdding(true);
    const result = await addMonthlyInvoice(warehouseId, productId, yearMonth);
    if (result.data) {
      setInvoices((prev) => [...prev, { id: result.data!.id, amount: null, ref: null }]);
    } else if (result.error) {
      toast({ variant: "destructive", title: "Error al añadir factura", description: result.error });
    }
    setAdding(false);
  }

  async function handleDelete(id: string) {
    const result = await deleteMonthlyInvoice(id);
    if (!result.error) {
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
    } else {
      toast({ variant: "destructive", title: "Error al eliminar factura", description: result.error });
    }
  }

  const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.amount ?? 0), 0);

  return (
    <div className="pt-3 mt-3 border-t border-dashed">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-muted-foreground">Facturas recibidas</span>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-dashed text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Añadir factura
        </button>
      </div>

      {invoices.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sin facturas registradas para este mes</p>
      ) : (
        <div className="space-y-1.5">
          {invoices.map((inv) => (
            <InvoiceLineItem
              key={inv.id}
              id={inv.id}
              initialAmount={inv.amount}
              initialRef={inv.ref}
              calculatedCost={calculatedCost}
              isOnly={invoices.length === 1}
              onDelete={handleDelete}
            />
          ))}
          {invoices.length > 1 && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-xs text-muted-foreground">Total facturado:</span>
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(totalInvoiced)}</span>
              {Math.abs(totalInvoiced - calculatedCost) > 0.01 && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs tabular-nums",
                    totalInvoiced > calculatedCost ? "border-amber-400 text-amber-600" : "border-red-400 text-red-600"
                  )}
                >
                  {totalInvoiced > calculatedCost ? "+" : ""}{formatCurrency(totalInvoiced - calculatedCost)} vs calculado
                </Badge>
              )}
            </div>
          )}
        </div>
      )}
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
  const [currentMonthIdx, setCurrentMonthIdx] = useState(0); // 0 = most recent

  // Matrículas para autocompletado
  const [matriculas, setMatriculas] = useState<string[]>([]);

  // Edit inbound state
  const [editingInbound, setEditingInbound] = useState<InboundRow | null>(null);
  const [inboundEditValues, setInboundEditValues] = useState({ movement_date: "", quantity: "", free_days: "0", comments: "" });
  const [isSavingInbound, setIsSavingInbound] = useState(false);

  // Edit outbound state
  const [editingOutbound, setEditingOutbound] = useState<OutboundRow | null>(null);
  const [outboundEditValues, setOutboundEditValues] = useState({ movement_date: "", quantity: "", matricula: "", comments: "" });
  const [isSavingOutbound, setIsSavingOutbound] = useState(false);

  // Grabar salida state
  const [salidaFormOpen, setSalidaFormOpen] = useState(false);
  const [salidaPuestaId, setSalidaPuestaId] = useState<string>("");
  const [salidaPuestaPendiente, setSalidaPuestaPendiente] = useState<number>(0);
  const [salidaFechaPuesta, setSalidaFechaPuesta] = useState<string>("");
  const [isSavingSalida, setIsSavingSalida] = useState(false);
  const [showAllPuestas, setShowAllPuestas] = useState(false);

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
    const [warehouseRes, productRes, inboundRes, outboundRes, puestaRes, mats] = await Promise.all([
      supabase.from("warehouses").select("name").eq("id", params.id).single(),
      supabase.from("products").select("name, code, unit").eq("id", params.productId).single(),
      supabase
        .from("inbound_movements")
        .select("id, movement_date, quantity, free_days, comments, supplier:suppliers(name)")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId)
        .order("movement_date", { ascending: false }),
      supabase
        .from("outbound_movements")
        .select("id, movement_date, quantity, comments, matricula, from_puesta, customer:customers(name)")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId)
        .order("movement_date", { ascending: false }),
      supabase
        .from("puestas_a_disposicion")
        .select("id, numero_contrato, fecha_puesta, cantidad_inicial, estado, dias_plancha, customer:customers(name), salidas_parciales(cantidad, tipo)")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId)
        .order("fecha_puesta", { ascending: false }),
      getMatriculas(),
    ]);

    if (warehouseRes.data) setWarehouseName(warehouseRes.data.name);
    setMatriculas(mats);
    if (productRes.data) {
      setProductName(productRes.data.name);
      setProductCode(productRes.data.code);
      setProductUnit(productRes.data.unit ?? "ud");
    }
    setAllInbound((inboundRes.data ?? []) as InboundRow[]);
    setAllOutbound((outboundRes.data ?? []) as OutboundRow[]);

    // Auto-trigger plancha exit for any open puesta that has passed its plancha date
    const puestasRaw = (puestaRes.data ?? []) as unknown as PuestaRow[];
    const todayStr = new Date().toISOString().split("T")[0];
    let anyAutoExit = false;
    for (const p of puestasRaw) {
      if (p.estado === "abierta") {
        const hasAutoExit = (p.salidas_parciales ?? []).some((s) => s.tipo === "plancha");
        if (!hasAutoExit) {
          const fechaPuesta = new Date(p.fecha_puesta + "T00:00:00");
          const fechaFin = new Date(fechaPuesta);
          fechaFin.setDate(fechaFin.getDate() + (Number(p.dias_plancha) ?? 0));
          const fechaFinStr = fechaFin.toISOString().split("T")[0];
          if (todayStr > fechaFinStr) {
            await triggerPlanchaAutoExit(p.id);
            anyAutoExit = true;
          }
        }
      }
    }

    if (anyAutoExit) {
      // Reload puestas and outbound to reflect the auto-generated exits
      const [puestaRes2, outboundRes2] = await Promise.all([
        supabase
          .from("puestas_a_disposicion")
          .select("id, numero_contrato, fecha_puesta, cantidad_inicial, estado, dias_plancha, customer:customers(name), salidas_parciales(cantidad, tipo)")
          .eq("warehouse_id", params.id)
          .eq("product_id", params.productId)
          .order("fecha_puesta", { ascending: false }),
        supabase
          .from("outbound_movements")
          .select("id, movement_date, quantity, comments, matricula, from_puesta, customer:customers(name)")
          .eq("warehouse_id", params.id)
          .eq("product_id", params.productId)
          .order("movement_date", { ascending: false }),
      ]);
      setAllPuestas((puestaRes2.data ?? []) as unknown as PuestaRow[]);
      setAllOutbound((outboundRes2.data ?? []) as OutboundRow[]);
    } else {
      setAllPuestas(puestasRaw);
    }

    setIsLoadingMeta(false);
  }, [supabase, params.id, params.productId]);

  // ── Load vertical calendar (all days in range) ───────────────
  const loadCalendar = useCallback(async () => {
    setIsLoadingCalendar(true);

    const [inboundRes, outboundRes, costsRes, invoicesRes, warehouseRes] = await Promise.all([
      supabase
        .from("inbound_movements")
        .select("movement_date, quantity, free_days")
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
        .select("id, year_month, invoice_amount, invoice_ref")
        .eq("warehouse_id", params.id)
        .eq("product_id", params.productId),
      supabase
        .from("warehouses")
        .select("storage_daily_price")
        .eq("id", params.id)
        .single(),
    ]);

    const dailyPrice = Number(warehouseRes.data?.storage_daily_price ?? 0);
    const inboundMovements = (inboundRes.data ?? []) as { movement_date: string; quantity: number; free_days: number }[];
    const outboundMovements = (outboundRes.data ?? []) as { movement_date: string; quantity: number }[];

    if (inboundMovements.length === 0) {
      setMonthGroups([]);
      setIsLoadingCalendar(false);
      return;
    }

    // Build day-level map for movements and actual storage costs
    const dayMap = new Map<string, { inbound: number; outbound: number; cost: number }>();
    function getDay(dateStr: string) {
      if (!dayMap.has(dateStr)) dayMap.set(dateStr, { inbound: 0, outbound: 0, cost: 0 });
      return dayMap.get(dateStr)!;
    }

    for (const row of inboundMovements)  getDay(row.movement_date).inbound  += Number(row.quantity);
    for (const row of outboundMovements) getDay(row.movement_date).outbound += Number(row.quantity);
    for (const row of costsRes.data ?? []) getDay(row.cost_date).cost += Number(row.total_cost);

    // Set of dates with actual (non-estimated) costs
    const actualCostDates = new Set((costsRes.data ?? []).map((r) => r.cost_date));

    // Invoice map (multiple per month)
    const invoiceMap = new Map<string, InvoiceRecord[]>();
    for (const row of invoicesRes.data ?? []) {
      const list = invoiceMap.get(row.year_month) ?? [];
      list.push({ id: row.id, amount: row.invoice_amount ?? null, ref: row.invoice_ref ?? null });
      invoiceMap.set(row.year_month, list);
    }

    // Date range: from first inbound to today
    const firstDate = parseISO(inboundMovements[0].movement_date);
    const today = new Date();

    // Generate all months (most recent first)
    const months = eachMonthOfInterval({
      start: startOfMonth(firstDate),
      end: startOfMonth(today),
    }).reverse();

    const groups: MonthGroup[] = months.map((monthStart) => {
      const ym = format(monthStart, "yyyy-MM");
      const daysCount = getDaysInMonth(monthStart);
      const label = format(monthStart, "MMMM yyyy", { locale: es });

      const days: DayEntry[] = [];
      let totalInbound = 0, totalOutbound = 0, totalCost = 0;
      let hasEstimated = false;

      for (let d = 1; d <= daysCount; d++) {
        const dayDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), d);
        if (dayDate > today) break;

        const dateStr = format(dayDate, "yyyy-MM-dd");
        const base = dayMap.get(dateStr);
        const inbound = base?.inbound ?? 0;
        const outbound = base?.outbound ?? 0;

        let cost = 0;
        let isEstimated = false;

        if (actualCostDates.has(dateStr)) {
          cost = base?.cost ?? 0;
        } else {
          const pending = calculatePendingQuantity(inboundMovements, outboundMovements, dayDate);
          cost = pending * dailyPrice;
          if (cost > 0) isEstimated = true;
        }

        if (isEstimated) hasEstimated = true;
        days.push({ dateStr, inbound, outbound, cost, isEstimated });
        totalInbound += inbound;
        totalOutbound += outbound;
        totalCost += cost;
      }

      return {
        yearMonth: ym,
        label,
        days,
        totalInbound,
        totalOutbound,
        totalCost,
        hasEstimated,
        invoices: invoiceMap.get(ym) ?? [],
      };
    });

    setMonthGroups(groups);
    setIsLoadingCalendar(false);
  }, [supabase, params.id, params.productId]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadCalendar(); }, [loadCalendar]);
  // Reset to most-recent month whenever calendar data reloads
  useEffect(() => { setCurrentMonthIdx(0); }, [monthGroups]);

  // ── Edit/Delete inbound ───────────────────────────────────────
  function openEditInbound(row: InboundRow) {
    setEditingInbound(row);
    setInboundEditValues({
      movement_date: row.movement_date,
      quantity: String(row.quantity),
      free_days: String(row.free_days ?? 0),
      comments: row.comments ?? "",
    });
  }

  async function handleSaveInbound() {
    if (!editingInbound) return;
    setIsSavingInbound(true);
    const qty = parseFloat(inboundEditValues.quantity);
    if (isNaN(qty) || qty <= 0) {
      toast({ variant: "destructive", title: "Cantidad inválida" });
      setIsSavingInbound(false);
      return;
    }
    const result = await updateInboundMovement(
      editingInbound.id,
      {
        movement_date: inboundEditValues.movement_date,
        quantity: qty,
        free_days: parseInt(inboundEditValues.free_days) || 0,
        comments: inboundEditValues.comments.trim() || null,
      },
      params.id,
      params.productId,
      editingInbound.movement_date,
    );
    if (result.error) {
      toast({ variant: "destructive", title: "Error al actualizar", description: result.error });
    } else {
      toast({ title: "Entrada actualizada y costes recalculados" });
      setEditingInbound(null);
      await loadMeta();
      await loadCalendar();
    }
    setIsSavingInbound(false);
  }

  async function handleDeleteInbound(row: InboundRow) {
    const result = await deleteInboundMovement(row.id, params.id, params.productId, row.movement_date);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al eliminar", description: result.error });
    } else {
      toast({ title: "Entrada eliminada y costes recalculados" });
      await loadMeta();
      await loadCalendar();
    }
  }

  // ── Edit/Delete outbound ──────────────────────────────────────
  function openEditOutbound(row: OutboundRow) {
    setEditingOutbound(row);
    setOutboundEditValues({
      movement_date: row.movement_date,
      quantity: String(row.quantity),
      matricula: row.matricula ?? "",
      comments: row.comments ?? "",
    });
  }

  async function handleSaveOutbound() {
    if (!editingOutbound) return;
    setIsSavingOutbound(true);
    const qty = parseFloat(outboundEditValues.quantity);
    if (isNaN(qty) || qty <= 0) {
      toast({ variant: "destructive", title: "Cantidad inválida" });
      setIsSavingOutbound(false);
      return;
    }
    const mat = outboundEditValues.matricula.trim().toUpperCase() || null;
    const result = await updateOutboundMovement(
      editingOutbound.id,
      {
        movement_date: outboundEditValues.movement_date,
        quantity: qty,
        matricula: mat,
        comments: outboundEditValues.comments.trim() || null,
      },
      params.id,
      params.productId,
      editingOutbound.movement_date,
    );
    if (result.error) {
      toast({ variant: "destructive", title: "Error al actualizar", description: result.error });
    } else {
      if (mat) {
        await upsertMatricula(mat);
        setMatriculas((prev) => prev.includes(mat) ? prev : [...prev, mat].sort());
      }
      toast({ title: "Salida actualizada y costes recalculados" });
      setEditingOutbound(null);
      await loadMeta();
      await loadCalendar();
    }
    setIsSavingOutbound(false);
  }

  async function handleDeleteOutbound(row: OutboundRow) {
    const result = await deleteOutboundMovement(row.id, params.id, params.productId, row.movement_date);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al eliminar", description: result.error });
    } else {
      toast({ title: "Salida eliminada y costes recalculados" });
      await loadMeta();
      await loadCalendar();
    }
  }

  // ── Grabar salida handlers ────────────────────────────────────
  function handleGrabarSalida(row: PuestaRow) {
    const realSalidas = (row.salidas_parciales ?? [])
      .filter((s) => s.tipo === "real")
      .reduce((acc, s) => acc + Number(s.cantidad), 0);
    const realPending = Math.max(0, Number(row.cantidad_inicial) - realSalidas);
    setSalidaPuestaId(row.id);
    setSalidaPuestaPendiente(realPending);
    setSalidaFechaPuesta(row.fecha_puesta);
    setSalidaFormOpen(true);
  }

  async function handleSalidaSubmit(values: SalidaParcialFormValues, forceOverflow = false) {
    setIsSavingSalida(true);
    const result = await createSalidaParcial(values, salidaPuestaPendiente, forceOverflow);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al registrar salida", description: result.error });
    } else {
      toast({ title: "Salida registrada correctamente" });
      setSalidaFormOpen(false);
      await loadMeta();
      await loadCalendar();
    }
    setIsSavingSalida(false);
  }

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

  const hasAnyEstimated = useMemo(() => monthGroups.some((mg) => mg.hasEstimated), [monthGroups]);

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
                    <p className="text-xs text-muted-foreground">
                      Coste acumulado{hasAnyEstimated && <span className="ml-1 text-[10px] text-amber-500">(incluye est.)</span>}
                    </p>
                    <p className="text-lg font-bold tabular-nums">
                      {formatCurrency(allTimeTotals.cost)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {hasAnyEstimated && (
            <p className="text-xs text-muted-foreground px-1">
              <span className="text-amber-500 font-medium">~</span> Los importes marcados son estimados (precio diario × stock pendiente). Los costes definitivos se generan por el proceso automático diario.
            </p>
          )}

          {/* Month navigation + single-month card */}
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
          ) : (() => {
            const mg = monthGroups[currentMonthIdx];
            if (!mg) return null;
            return (
              <div className="space-y-3">
                {/* Navigation bar */}
                <div className="flex items-center justify-between px-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentMonthIdx((i) => Math.min(i + 1, monthGroups.length - 1))}
                    disabled={currentMonthIdx >= monthGroups.length - 1}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Mes anterior
                  </Button>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold capitalize text-sm">{mg.label}</span>
                    <span className="text-xs text-muted-foreground">
                      ({currentMonthIdx + 1} / {monthGroups.length})
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentMonthIdx((i) => Math.max(i - 1, 0))}
                    disabled={currentMonthIdx === 0}
                    className="gap-1"
                  >
                    Mes siguiente
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <Card className="overflow-hidden">
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
                        {mg.hasEstimated && (
                          <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-300 dark:border-amber-700 py-0">
                            est.
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    {/* Tabla de días — overflow-x-auto for narrow screens */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[460px]">
                        <thead>
                          <tr className="border-b bg-muted/10">
                            <th className="px-5 py-2 text-left font-medium text-muted-foreground w-[140px]">Fecha</th>
                            <th className="px-4 py-2 text-right font-medium text-muted-foreground min-w-[100px]">Entradas</th>
                            <th className="px-4 py-2 text-right font-medium text-muted-foreground min-w-[100px]">Salidas</th>
                            <th className="px-5 py-2 text-right font-medium text-muted-foreground min-w-[120px]">Almacenaje</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mg.days.map((day) => {
                            const dateObj = parseISO(day.dateStr);
                            const isEmpty = day.inbound === 0 && day.outbound === 0 && day.cost === 0;
                            return (
                              <tr
                                key={day.dateStr}
                                className={cn(
                                  "border-b last:border-0 transition-colors",
                                  isEmpty ? "hover:bg-muted/10" : "hover:bg-muted/20",
                                )}
                              >
                                <td className={cn(
                                  "px-5 py-2 font-mono text-xs whitespace-nowrap",
                                  isEmpty ? "text-muted-foreground/40" : "text-muted-foreground"
                                )}>
                                  {format(dateObj, "dd/MM/yyyy")}
                                  <span className="ml-2 text-[10px] opacity-60 capitalize">
                                    {format(dateObj, "EEE", { locale: es })}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right tabular-nums">
                                  {day.inbound > 0 ? (
                                    <span className="text-green-600 dark:text-green-400 font-medium">
                                      +{formatQuantity(day.inbound, productUnit)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/25">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-right tabular-nums">
                                  {day.outbound > 0 ? (
                                    <span className="text-red-600 dark:text-red-400 font-medium">
                                      -{formatQuantity(day.outbound, productUnit)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/25">—</span>
                                  )}
                                </td>
                                <td className="px-5 py-2 text-right tabular-nums">
                                  {day.cost > 0 ? (
                                    <span className={cn(
                                      "font-medium",
                                      day.isEstimated
                                        ? "text-amber-600/70 dark:text-amber-400/60"
                                        : "text-blue-600 dark:text-blue-400"
                                    )}>
                                      {day.isEstimated && "~"}{formatCurrency(day.cost)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/25">—</span>
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
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-muted-foreground uppercase tracking-wide text-xs">
                          Total {mg.label}
                        </span>
                        <span className={cn(
                          "font-bold tabular-nums text-base",
                          mg.hasEstimated
                            ? "text-amber-600/80 dark:text-amber-400/70"
                            : mg.totalCost > 0
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-muted-foreground"
                        )}>
                          {mg.hasEstimated && "~"}{formatCurrency(mg.totalCost)}
                        </span>
                      </div>

                      <InvoiceSection
                        key={mg.yearMonth}
                        warehouseId={params.id}
                        productId={params.productId}
                        yearMonth={mg.yearMonth}
                        calculatedCost={mg.totalCost}
                        initialInvoices={mg.invoices}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })()}
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
                        <th className="h-10 px-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {allInbound.map((row) => (
                        <tr key={row.id} className="border-b hover:bg-muted/50 transition-colors group">
                          <td className="p-4 font-mono text-sm">{formatDate(row.movement_date)}</td>
                          <td className="p-4">
                            <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-950/40 dark:text-green-400 tabular-nums font-semibold">
                              +{formatQuantity(row.quantity, productUnit)}
                            </Badge>
                          </td>
                          <td className="p-4 text-sm">{row.supplier?.name ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-4 text-sm text-muted-foreground">{row.comments ?? "—"}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditInbound(row)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => { if (confirm("¿Eliminar esta entrada? Se recalcularán los costes.")) handleDeleteInbound(row); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
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
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Matrícula</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Comentarios</th>
                        <th className="h-10 px-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {allOutbound.map((row) => (
                        <tr key={row.id} className="border-b hover:bg-muted/50 transition-colors group">
                          <td className="p-4 font-mono text-sm">{formatDate(row.movement_date)}</td>
                          <td className="p-4">
                            <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-400 tabular-nums font-semibold">
                              -{formatQuantity(row.quantity, productUnit)}
                            </Badge>
                          </td>
                          <td className="p-4 text-sm">{row.customer?.name ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-4 font-mono text-sm">{row.matricula ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-4 text-sm text-muted-foreground max-w-[200px] truncate">{row.comments ?? "—"}</td>
                          <td className="p-4">
                            {!row.from_puesta ? (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditOutbound(row)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => { if (confirm("¿Eliminar esta salida? Se recalcularán los costes.")) handleDeleteOutbound(row); }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-70">desde puesta</span>
                            )}
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

        {/* ═══════════════════════════════════════════════════════
            TAB: PUESTAS A DISPOSICIÓN
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="puestas">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Puestas a disposición</CardTitle>
                  <CardDescription>
                    Contratos de puesta a disposición de {productName} en {warehouseName}
                  </CardDescription>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                  <span className="text-sm text-muted-foreground">
                    {showAllPuestas ? "Todas" : "Solo activas"}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showAllPuestas}
                    onClick={() => setShowAllPuestas((v) => !v)}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      showAllPuestas ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform",
                        showAllPuestas ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                  <span className="text-xs text-muted-foreground">Ver todas</span>
                </label>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingMeta ? (
                <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : allPuestas.filter((p) => showAllPuestas || p.estado === "abierta").length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ClipboardList className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">
                    {showAllPuestas
                      ? "No hay puestas a disposición para esta combinación"
                      : "No hay puestas activas — activa 'Ver todas' para ver las finalizadas"}
                  </p>
                </div>
              ) : (
                <div className="relative w-full overflow-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Contrato</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Cliente</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Fecha</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Inicial</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Pendiente</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Plancha</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Estado</th>
                        <th className="h-10 px-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {allPuestas.filter((p) => showAllPuestas || p.estado === "abierta").map((row) => {
                        const totalRealSalidas = (row.salidas_parciales ?? [])
                          .filter((s) => s.tipo === "real")
                          .reduce((acc, s) => acc + Number(s.cantidad), 0);
                        const pending = Number(row.cantidad_inicial) - totalRealSalidas;
                        const isOverflow = pending < 0;
                        return (
                          <tr
                            key={row.id}
                            className={cn(
                              "border-b transition-colors",
                              isOverflow
                                ? "bg-destructive/5 hover:bg-destructive/10"
                                : "hover:bg-muted/50"
                            )}
                          >
                            <td className="p-4 font-mono text-sm">{row.numero_contrato ?? <span className="text-muted-foreground">—</span>}</td>
                            <td className="p-4 text-sm">{row.customer?.name ?? <span className="text-muted-foreground">—</span>}</td>
                            <td className="p-4 font-mono text-sm">{formatDate(row.fecha_puesta)}</td>
                            <td className="p-4 tabular-nums text-sm">{formatQuantity(row.cantidad_inicial, productUnit)}</td>
                            <td className="p-4 tabular-nums font-semibold text-sm">
                              <span className={cn(
                                isOverflow
                                  ? "text-destructive"
                                  : pending > 0
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                              )}>
                                {isOverflow && ""}
                                {formatQuantity(pending, productUnit)}
                                {isOverflow && (
                                  <span className="ml-1 text-xs font-normal">(exceso)</span>
                                )}
                              </span>
                            </td>
                            <td className="p-4 text-sm text-muted-foreground">{row.dias_plancha} días</td>
                            <td className="p-4">{estadoBadge(row.estado)}</td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                {row.estado === "abierta" && !isOverflow && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 text-xs"
                                    onClick={() => handleGrabarSalida(row)}
                                  >
                                    <Truck className="h-3.5 w-3.5" />
                                    Grabar salida
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" asChild>
                                  <Link href={`/puestas/${row.id}?back=${encodeURIComponent(`/warehouses/${params.id}/${params.productId}?tab=puestas`)}`}>
                                    Ver detalle
                                  </Link>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Editar entrada ── */}
      <Dialog open={!!editingInbound} onOpenChange={(o) => { if (!o) setEditingInbound(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Editar entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Fecha *</label>
              <Input type="date" value={inboundEditValues.movement_date}
                onChange={(e) => setInboundEditValues((v) => ({ ...v, movement_date: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Cantidad *</label>
              <Input type="number" step="0.001" min="0.001"
                value={inboundEditValues.quantity}
                onChange={(e) => setInboundEditValues((v) => ({ ...v, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Días de plancha</label>
              <Input type="number" min="0" max="365" step="1"
                value={inboundEditValues.free_days}
                onChange={(e) => setInboundEditValues((v) => ({ ...v, free_days: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Comentarios</label>
              <Input value={inboundEditValues.comments}
                onChange={(e) => setInboundEditValues((v) => ({ ...v, comments: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground">Los costes de almacenaje se recalcularán automáticamente.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingInbound(null)} disabled={isSavingInbound}>Cancelar</Button>
            <Button onClick={handleSaveInbound} disabled={isSavingInbound}>
              {isSavingInbound && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Editar salida manual ── */}
      <Dialog open={!!editingOutbound} onOpenChange={(o) => { if (!o) setEditingOutbound(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Editar salida</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Fecha *</label>
              <Input type="date" value={outboundEditValues.movement_date}
                onChange={(e) => setOutboundEditValues((v) => ({ ...v, movement_date: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Cantidad *</label>
              <Input type="number" step="0.001" min="0.001"
                value={outboundEditValues.quantity}
                onChange={(e) => setOutboundEditValues((v) => ({ ...v, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Matrícula</label>
              <MatriculaInput
                value={outboundEditValues.matricula}
                onChange={(val) => setOutboundEditValues((v) => ({ ...v, matricula: val }))}
                matriculas={matriculas}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Comentarios</label>
              <Input value={outboundEditValues.comments}
                onChange={(e) => setOutboundEditValues((v) => ({ ...v, comments: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground">Los costes de almacenaje se recalcularán automáticamente.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOutbound(null)} disabled={isSavingOutbound}>Cancelar</Button>
            <Button onClick={handleSaveOutbound} disabled={isSavingOutbound}>
              {isSavingOutbound && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salida parcial dialog */}
      <SalidaParcialForm
        open={salidaFormOpen}
        onOpenChange={setSalidaFormOpen}
        onSubmit={handleSalidaSubmit}
        isLoading={isSavingSalida}
        puestaId={salidaPuestaId}
        cantidadPendiente={salidaPuestaPendiente}
        unit={productUnit}
        fechaMinima={salidaFechaPuesta || undefined}
      />
    </>
  );
}
