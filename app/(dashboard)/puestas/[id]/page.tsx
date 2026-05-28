"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Truck, TrendingUp, Package, Calendar,
  Clock, CheckCircle2, AlertCircle, BarChart3,
  RotateCcw, XCircle, MessageSquare, Loader2, Undo2, FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { parseISO, isBefore } from "date-fns";
import type {
  PuestaSummary, PuestaDailyBreakdown, SalidaParcial,
} from "@/types";
import type { SalidaParcialFormValues } from "@/validations/salida-parcial.schema";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SalidaParcialForm } from "@/modules/puestas/components/salida-parcial-form";
import { getSalidaColumns } from "@/modules/puestas/components/salida-parcial-columns";
import { DesaplicarDialog } from "@/modules/puestas/components/desaplicar-dialog";
import { toast } from "@/hooks/use-toast";
import { formatDate, formatNumber, formatCurrency } from "@/utils/format";
import {
  createSalidaParcial,
  updateSalidaParcial,
  deleteSalidaParcial,
  triggerPlanchaAutoExit,
  changePuestaEstado,
  updatePuestaComentarios,
  createDesaplicacion,
  markMonthAsInvoiced,
  unmarkMonthAsInvoiced,
} from "../actions";
import { getMatriculas, upsertMatricula } from "@/lib/actions/matriculas";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

const estadoConfig: Record<string, {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: React.ElementType;
}> = {
  abierta:        { label: "Abierta",        variant: "default",   icon: Clock },
  finalizada:     { label: "Finalizada",     variant: "secondary", icon: CheckCircle2 },
  cerrada_manual: { label: "Cerrada manual", variant: "outline",   icon: AlertCircle },
};

function getPrevMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export default function PuestaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [summary, setSummary]       = useState<PuestaSummary | null>(null);
  const [breakdown, setBreakdown]   = useState<PuestaDailyBreakdown[]>([]);
  const [salidas, setSalidas]       = useState<SalidaParcial[]>([]);
  const [comentarios, setComentarios] = useState<string | null>(null);

  const [invoicedMonths, setInvoicedMonths] = useState<{ year_month: string; invoiced_at: string }[]>([]);
  const [selectedMonth, setSelectedMonth]   = useState(getPrevMonth);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);

  const [salidaFormOpen, setSalidaFormOpen] = useState(false);
  const [editingSalida, setEditingSalida]   = useState<SalidaParcial | null>(null);
  const [matriculas, setMatriculas]         = useState<string[]>([]);

  const [desaplicarOpen, setDesaplicarOpen]         = useState(false);
  const [isSavingDesaplicar, setIsSavingDesaplicar] = useState(false);

  const [comentariosDialogOpen, setComentariosDialogOpen] = useState(false);
  const [comentariosText, setComentariosText] = useState("");
  const [isSavingComentarios, setIsSavingComentarios] = useState(false);

  const [backUrl, setBackUrl] = useState("/puestas");

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const back = new URLSearchParams(search).get("back");
    if (back) setBackUrl(decodeURIComponent(back));
  }, []);

  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const loadData = useCallback(async () => {
    setIsLoading(true);

    const [summaryRes, breakdownRes, salidasRes, puestaRes, invoicedRes, mats] = await Promise.all([
      supabase.rpc("get_puesta_summary", { p_puesta_id: id, p_fecha: today }),
      supabase.rpc("get_puesta_daily_breakdown", {
        p_puesta_id: id,
        p_fecha_inicio: null,
        p_fecha_fin: today,
      }),
      supabase
        .from("salidas_parciales")
        .select("*")
        .eq("puesta_id", id)
        .order("fecha_salida", { ascending: false }),
      supabase
        .from("puestas_a_disposicion")
        .select("comentarios")
        .eq("id", id)
        .single(),
      supabase
        .from("puesta_facturacion_meses")
        .select("year_month, invoiced_at")
        .eq("puesta_id", id)
        .order("year_month", { ascending: false }),
      getMatriculas(),
    ]);

    if (summaryRes.error) {
      toast({ variant: "destructive", title: "Error", description: summaryRes.error.message });
    } else {
      const s = (summaryRes.data?.[0] as PuestaSummary) ?? null;
      setSummary(s);

      if (s && s.estado === "abierta") {
        const plancharPassed = isBefore(parseISO(s.fecha_fin_plancha), new Date());
        const hasPlanchaExit = (salidasRes.data ?? []).some(
          (sal: SalidaParcial) => sal.tipo === "plancha"
        );
        if (plancharPassed && !hasPlanchaExit) {
          await triggerPlanchaAutoExit(id);
          const [sRes2, bRes2, salRes2] = await Promise.all([
            supabase.rpc("get_puesta_summary", { p_puesta_id: id, p_fecha: today }),
            supabase.rpc("get_puesta_daily_breakdown", {
              p_puesta_id: id, p_fecha_inicio: null, p_fecha_fin: today,
            }),
            supabase.from("salidas_parciales").select("*").eq("puesta_id", id).order("fecha_salida", { ascending: false }),
          ]);
          setSummary((sRes2.data?.[0] as PuestaSummary) ?? null);
          setBreakdown((bRes2.data ?? []) as PuestaDailyBreakdown[]);
          setSalidas((salRes2.data ?? []) as SalidaParcial[]);
          if (!puestaRes.error) setComentarios(puestaRes.data?.comentarios ?? null);
          if (!invoicedRes.error) setInvoicedMonths((invoicedRes.data ?? []) as { year_month: string; invoiced_at: string }[]);
          setMatriculas(mats);
          setIsLoading(false);
          return;
        }
      }
    }

    if (!breakdownRes.error) setBreakdown((breakdownRes.data ?? []) as PuestaDailyBreakdown[]);
    if (!salidasRes.error) setSalidas((salidasRes.data ?? []) as SalidaParcial[]);
    if (!puestaRes.error) setComentarios(puestaRes.data?.comentarios ?? null);
    if (!invoicedRes.error) setInvoicedMonths((invoicedRes.data ?? []) as { year_month: string; invoiced_at: string }[]);
    setMatriculas(mats);

    setIsLoading(false);
  }, [supabase, id, today]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCreateSalida(values: SalidaParcialFormValues, forceOverflow = false) {
    setIsSaving(true);
    const result = await createSalidaParcial(values, realPending, forceOverflow);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al registrar salida", description: result.error });
    } else {
      if (values.matricula) {
        setMatriculas((prev) =>
          prev.includes(values.matricula!) ? prev : [...prev, values.matricula!].sort()
        );
      }
      toast({ title: "Salida registrada correctamente" });
      setSalidaFormOpen(false);
      await loadData();
    }
    setIsSaving(false);
  }

  async function handleUpdateSalida(values: SalidaParcialFormValues) {
    if (!editingSalida) return;
    setIsSaving(true);
    const result = await updateSalidaParcial(editingSalida.id, values);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al actualizar", description: result.error });
    } else {
      toast({ title: "Salida actualizada correctamente" });
      setSalidaFormOpen(false);
      setEditingSalida(null);
      await loadData();
    }
    setIsSaving(false);
  }

  async function handleDeleteSalida(salidaId: string) {
    const result = await deleteSalidaParcial(salidaId);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al eliminar", description: result.error });
    } else {
      toast({ title: "Salida eliminada" });
      await loadData();
    }
  }

  async function handleReactivar() {
    setIsSaving(true);
    const result = await changePuestaEstado(id, "abierta");
    if (result.error) {
      toast({ variant: "destructive", title: "Error al reactivar", description: result.error });
    } else {
      toast({ title: "Puesta reactivada correctamente" });
      await loadData();
    }
    setIsSaving(false);
  }

  async function handleCerrarManual() {
    setIsSaving(true);
    const result = await changePuestaEstado(id, "cerrada_manual");
    if (result.error) {
      toast({ variant: "destructive", title: "Error al cerrar", description: result.error });
    } else {
      toast({ title: "Puesta cerrada manualmente" });
      await loadData();
    }
    setIsSaving(false);
  }

  async function handleDesaplicar(cantidad: number) {
    setIsSavingDesaplicar(true);
    const result = await createDesaplicacion(id, cantidad);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al desaplicar", description: result.error });
    } else {
      toast({ title: "Desaplicación registrada correctamente" });
      setDesaplicarOpen(false);
      await loadData();
    }
    setIsSavingDesaplicar(false);
  }

  async function handleFacturar() {
    if (!summary) return;
    const monthData = breakdown.filter((r) => r.dia.startsWith(selectedMonth));
    if (monthData.length === 0) {
      toast({
        variant: "destructive",
        title: "Sin datos",
        description: "No hay desglose de almacenaje para el mes seleccionado.",
      });
      return;
    }

    setIsGeneratingPDF(true);
    try {
      await generatePDF(selectedMonth, monthData, summary);
      const result = await markMonthAsInvoiced(id, selectedMonth);
      if (result.error) {
        toast({ variant: "destructive", title: "Error al marcar factura", description: result.error });
      } else {
        toast({ title: "PDF generado · Mes marcado como facturado" });
        setInvoicedMonths((prev) => [
          ...prev.filter((m) => m.year_month !== selectedMonth),
          { year_month: selectedMonth, invoiced_at: new Date().toISOString() },
        ].sort((a, b) => b.year_month.localeCompare(a.year_month)));
      }
    } finally {
      setIsGeneratingPDF(false);
    }
  }

  async function handleUnmarkInvoiced(yearMonth: string) {
    const result = await unmarkMonthAsInvoiced(id, yearMonth);
    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error });
    } else {
      setInvoicedMonths((prev) => prev.filter((m) => m.year_month !== yearMonth));
      toast({ title: "Mes desmarcado como facturado" });
    }
  }

  function handleEditSalida(salida: SalidaParcial) {
    if (salida.tipo === "plancha") return;
    setEditingSalida(salida);
    setSalidaFormOpen(true);
  }

  function openComentariosDialog() {
    setComentariosText(comentarios ?? "");
    setComentariosDialogOpen(true);
  }

  async function handleSaveComentarios() {
    setIsSavingComentarios(true);
    const result = await updatePuestaComentarios(id, comentariosText.trim() || null);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al guardar comentarios", description: result.error });
    } else {
      setComentarios(comentariosText.trim() || null);
      setComentariosDialogOpen(false);
      toast({ title: "Comentarios guardados" });
    }
    setIsSavingComentarios(false);
  }

  const salidaColumns = getSalidaColumns(handleEditSalida, handleDeleteSalida, summary?.unit);

  const chartData = useMemo(() => {
    const last30 = breakdown.slice(-30);
    return last30.map((d) => ({
      date: format(parseISO(d.dia), "dd/MM", { locale: es }),
      pendiente: Number(d.cantidad_pendiente),
      coste: Number(d.coste_dia),
    }));
  }, [breakdown]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Puesta a disposición no encontrada</p>
        <Button variant="outline" onClick={() => router.push(backUrl)}>
          <ArrowLeft className="mr-2 h-4 w-4" />Volver
        </Button>
      </div>
    );
  }

  const estadoCfg = estadoConfig[summary.estado] ?? estadoConfig.abierta;
  const EstadoIcon = estadoCfg.icon;
  const salidasReales      = salidas.filter((s) => s.tipo === "real");
  const salidasDesaplicadas = salidas.filter((s) => s.tipo === "desaplicacion");
  const salidaPlancha      = salidas.find((s) => s.tipo === "plancha");

  const realTotal          = salidasReales.reduce((s, r) => s + Number(r.cantidad), 0);
  const desaplicadoTotal   = salidasDesaplicadas.reduce((s, r) => s + Number(r.cantidad), 0);
  const realPending        = summary.cantidad_inicial - realTotal - desaplicadoTotal;
  const porcentajeSalida   = summary.cantidad_inicial > 0
    ? Math.round(((realTotal + desaplicadoTotal) / summary.cantidad_inicial) * 100)
    : 0;

  const isOutsidePlancha = today > summary.fecha_fin_plancha;
  const puestaRef = summary.numero_contrato || id.slice(0, 8).toUpperCase();

  const isMonthInvoiced = invoicedMonths.some((m) => m.year_month === selectedMonth);
  const monthBreakdown  = breakdown.filter((r) => r.dia.startsWith(selectedMonth));
  const monthTotal      = monthBreakdown.reduce((s, r) => s + Number(r.coste_dia), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(backUrl)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">
              {summary.numero_contrato || "Sin referencia"}
            </h1>
            <Badge variant={estadoCfg.variant} className="flex items-center gap-1">
              <EstadoIcon className="h-3 w-3" />{estadoCfg.label}
            </Badge>
            {summary.estado === "abierta" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCerrarManual}
                  disabled={isSaving}
                  className="text-destructive border-destructive/40 hover:bg-destructive/10"
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <XCircle className="mr-2 h-3.5 w-3.5" />
                  )}
                  Cerrar manualmente
                </Button>
                {realPending > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDesaplicarOpen(true)}
                    disabled={isSaving}
                  >
                    <Undo2 className="mr-2 h-3.5 w-3.5" />
                    Desaplicar
                  </Button>
                )}
              </>
            )}
            {summary.estado !== "abierta" && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleReactivar}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                )}
                Reactivar
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={openComentariosDialog}
              className="text-muted-foreground hover:text-foreground"
            >
              <MessageSquare className="mr-2 h-3.5 w-3.5" />
              {comentarios ? "Ver/editar comentarios" : "Añadir comentarios"}
            </Button>
          </div>
          <p className="text-muted-foreground mt-1">
            {summary.customer_name || "Sin cliente"} · {summary.product_name} · {summary.warehouse_name}
          </p>
          {comentarios && (
            <p className="mt-1.5 text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-1.5 max-w-xl">
              {comentarios}
            </p>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Package className="h-3.5 w-3.5" />Cantidad inicial
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatNumber(summary.cantidad_inicial)}</p>
            <p className="text-xs text-muted-foreground">{summary.unit}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Truck className="h-3.5 w-3.5" />Salida real
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatNumber(realTotal)}
            </p>
            <p className="text-xs text-muted-foreground">
              {desaplicadoTotal > 0
                ? `+ ${formatNumber(desaplicadoTotal)} desapl. · ${porcentajeSalida}%`
                : `${porcentajeSalida}% retirado`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />Cant. Pte Retirar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className={cn(
              "text-2xl font-bold tabular-nums",
              realPending < 0
                ? "text-red-600 dark:text-red-400"
                : "text-amber-600 dark:text-amber-400"
            )}>
              {formatNumber(realPending)}
            </p>
            <p className="text-xs text-muted-foreground">
              {realPending < 0 ? `${summary.unit} en exceso` : `${summary.unit} pendiente`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <TrendingUp className="h-3.5 w-3.5" />Coste acumulado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-primary">
              {formatCurrency(summary.coste_acumulado)}
            </p>
            <p className="text-xs text-muted-foreground">{summary.dias_activos} días activos</p>
          </CardContent>
        </Card>
      </div>

      {/* Info + Chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />Fechas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fecha de puesta</span>
              <span className="font-medium">{formatDate(summary.fecha_puesta)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Días de plancha</span>
              <span className="font-medium">{summary.dias_plancha} días</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fin de plancha</span>
              <span className="font-medium">{formatDate(summary.fecha_fin_plancha)}</span>
            </div>
            {salidaPlancha && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Traspaso a cliente</span>
                  <Badge variant="outline" className="text-xs">
                    {formatNumber(salidaPlancha.cantidad)} {summary.unit}
                  </Badge>
                </div>
              </>
            )}
            {desaplicadoTotal > 0 && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Total desaplicado</span>
                  <Badge variant="secondary" className="text-xs">
                    {formatNumber(desaplicadoTotal)} {summary.unit}
                  </Badge>
                </div>
              </>
            )}
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Días activos (coste)</span>
              <span className="font-bold text-primary">{summary.dias_activos}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Evolución de costes diarios</CardTitle>
            <CardDescription>Últimos 30 días</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Aún no hay datos de coste (en período de plancha o traspasado)
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Coste día"]} />
                  <Area type="monotone" dataKey="coste" stroke="hsl(var(--primary))"
                    fill="url(#costGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Salidas Parciales */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4" />Salidas de camión
            </CardTitle>
            <CardDescription>
              {salidasReales.length} salida{salidasReales.length !== 1 ? "s" : ""} real{salidasReales.length !== 1 ? "es" : ""}
              {salidasDesaplicadas.length > 0 && (
                <span className="ml-2 text-blue-500 font-medium">
                  · {salidasDesaplicadas.length} desaplicación{salidasDesaplicadas.length !== 1 ? "es" : ""}
                </span>
              )}
              {salidaPlancha && (
                <span className="ml-2 text-amber-500 font-medium">
                  · Traspaso plancha: {formatNumber(salidaPlancha.cantidad)} {summary.unit}
                </span>
              )}
            </CardDescription>
          </div>
          {summary.estado === "abierta" && realPending > 0 && (
            <Button size="sm" onClick={() => { setEditingSalida(null); setSalidaFormOpen(true); }}>
              <Truck className="mr-2 h-4 w-4" />Registrar retirada
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {salidas.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <Truck className="h-8 w-8" />
              <p className="text-sm">No hay salidas registradas aún</p>
            </div>
          ) : (
            <DataTable
              columns={salidaColumns}
              data={salidas}
              searchKey="matricula"
              searchPlaceholder="Buscar por matrícula..."
            />
          )}
        </CardContent>
      </Card>

      {/* Daily breakdown table */}
      {breakdown.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">Desglose diario de almacenaje</CardTitle>
                <CardDescription>
                  {breakdown.length} días · Total acumulado: {formatCurrency(summary.coste_acumulado)}
                </CardDescription>
              </div>
              {/* Facturar mes */}
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-[150px] h-9 text-sm"
                />
                <Button
                  size="sm"
                  variant={isMonthInvoiced ? "secondary" : "default"}
                  onClick={handleFacturar}
                  disabled={isGeneratingPDF || monthBreakdown.length === 0}
                  title={monthBreakdown.length === 0 ? "Sin datos para el mes seleccionado" : undefined}
                >
                  {isGeneratingPDF ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : isMonthInvoiced ? (
                    <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <FileText className="mr-2 h-3.5 w-3.5" />
                  )}
                  {isMonthInvoiced ? "Refacturar mes" : "Facturar mes"}
                </Button>
              </div>
            </div>
            {/* Totales del mes seleccionado */}
            {monthBreakdown.length > 0 && (
              <div className="mt-2 flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">
                  {monthBreakdown.length} días · Importe mes seleccionado:
                </span>
                <span className="font-semibold text-primary">{formatCurrency(monthTotal)}</span>
                {isMonthInvoiced && (
                  <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Facturado
                  </Badge>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Fecha</th>
                    <th className="pb-2 text-center font-medium">Día</th>
                    <th className="pb-2 text-right font-medium">Pendiente</th>
                    <th className="pb-2 text-right font-medium">Tarifa/ud</th>
                    <th className="pb-2 text-right font-medium">Coste día</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => {
                    const isSelected = row.dia.startsWith(selectedMonth);
                    return (
                      <tr
                        key={row.dia}
                        className={cn(
                          "border-b last:border-0 hover:bg-muted/40",
                          isSelected && "bg-primary/5"
                        )}
                      >
                        <td className="py-1.5">{formatDate(row.dia)}</td>
                        <td className="py-1.5 text-center text-muted-foreground">{row.dias_activos}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatNumber(row.cantidad_pendiente)} {summary.unit}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                          {formatCurrency(row.tarifa_diaria)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums font-medium">
                          {formatCurrency(row.coste_dia)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td colSpan={4} className="pt-2 text-right">Total acumulado:</td>
                    <td className="pt-2 text-right tabular-nums text-primary">
                      {formatCurrency(summary.coste_acumulado)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Historial de meses facturados */}
            {invoicedMonths.length > 0 && (
              <div className="mt-6 border-t pt-4">
                <p className="text-sm font-medium mb-3 text-muted-foreground">Meses facturados</p>
                <div className="flex flex-wrap gap-2">
                  {invoicedMonths.map((m) => {
                    const [y, mo] = m.year_month.split("-");
                    const label = new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString("es-ES", {
                      month: "long",
                      year: "numeric",
                    });
                    return (
                      <div
                        key={m.year_month}
                        className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs"
                      >
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <span className="capitalize">{label}</span>
                        <button
                          type="button"
                          title="Desmarcar"
                          className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => handleUnmarkInvoiced(m.year_month)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Salida parcial form dialog */}
      <SalidaParcialForm
        open={salidaFormOpen}
        onOpenChange={(open) => { setSalidaFormOpen(open); if (!open) setEditingSalida(null); }}
        onSubmit={editingSalida ? handleUpdateSalida : handleCreateSalida}
        isLoading={isSaving}
        puestaId={id}
        cantidadPendiente={realPending}
        unit={summary.unit}
        defaultValues={editingSalida ?? undefined}
        fechaMinima={summary.fecha_puesta}
        matriculas={matriculas}
      />

      {/* Desaplicar dialog */}
      <DesaplicarDialog
        open={desaplicarOpen}
        onOpenChange={setDesaplicarOpen}
        onSubmit={handleDesaplicar}
        isLoading={isSavingDesaplicar}
        maxCantidad={Math.max(0, realPending)}
        unit={summary.unit}
        isOutsidePlancha={isOutsidePlancha}
        puestaRef={puestaRef}
      />

      {/* Comentarios dialog */}
      <Dialog open={comentariosDialogOpen} onOpenChange={setComentariosDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Comentarios de la puesta
            </DialogTitle>
          </DialogHeader>
          <Textarea
            rows={5}
            placeholder="Escribe aquí los comentarios o notas de esta puesta a disposición..."
            value={comentariosText}
            onChange={(e) => setComentariosText(e.target.value)}
            className="resize-none"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setComentariosDialogOpen(false)}
              disabled={isSavingComentarios}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveComentarios} disabled={isSavingComentarios}>
              {isSavingComentarios && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── PDF generation (client-side, dynamic import) ────────────

async function generatePDF(
  yearMonth: string,
  monthData: PuestaDailyBreakdown[],
  summary: PuestaSummary
) {
  const [y, m] = yearMonth.split("-");
  const monthLabel = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });
  const monthTotal = monthData.reduce((s, r) => s + Number(r.coste_dia), 0);

  const jsPDFModule = await import("jspdf");
  const jsPDF = jsPDFModule.default;
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Factura de Almacenaje", 14, 22);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);

  const infoLines: [string, string][] = [
    ["Mes facturado:", monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)],
    ["Contrato / Ref.:", summary.numero_contrato || "Sin referencia"],
    ["Cliente:", summary.customer_name || "Sin cliente"],
    ["Almacén:", summary.warehouse_name],
    ["Producto:", `${summary.product_name} (${summary.product_code})`],
    ["Fecha de puesta:", formatDate(summary.fecha_puesta)],
    ["Fin plancha:", formatDate(summary.fecha_fin_plancha)],
    ["Generado el:", new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })],
  ];

  let y2 = 32;
  for (const [label, value] of infoLines) {
    doc.setFont("helvetica", "bold");
    doc.text(label, 14, y2);
    doc.setFont("helvetica", "normal");
    doc.text(value, 55, y2);
    y2 += 6;
  }

  doc.setTextColor(0);

  autoTable(doc, {
    startY: y2 + 4,
    head: [["Fecha", "Día activo", `Pendiente (${summary.unit})`, "Tarifa/ud (€)", "Coste día (€)"]],
    body: monthData.map((row) => [
      formatDate(row.dia),
      row.dias_activos.toString(),
      formatNumber(row.cantidad_pendiente),
      formatCurrency(row.tarifa_diaria),
      formatCurrency(row.coste_dia),
    ]),
    foot: [["", "", "", "TOTAL MES:", formatCurrency(monthTotal)]],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], fontStyle: "bold", textColor: [30, 64, 175] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });

  const safeRef = (summary.numero_contrato || summary.puesta_id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_");
  doc.save(`almacenaje-${yearMonth}-${safeRef}.pdf`);
}
