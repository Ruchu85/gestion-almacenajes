"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Truck, TrendingUp, Package, Calendar,
  Clock, CheckCircle2, AlertCircle, BarChart3,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
import { SalidaParcialForm } from "@/modules/puestas/components/salida-parcial-form";
import { getSalidaColumns } from "@/modules/puestas/components/salida-parcial-columns";
import { toast } from "@/hooks/use-toast";
import { formatDate, formatNumber, formatCurrency } from "@/utils/format";
import {
  createSalidaParcial,
  updateSalidaParcial,
  deleteSalidaParcial,
} from "../actions";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const estadoConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  abierta:        { label: "Abierta",        variant: "default",    icon: Clock },
  finalizada:     { label: "Finalizada",     variant: "secondary",  icon: CheckCircle2 },
  cerrada_manual: { label: "Cerrada manual", variant: "outline",    icon: AlertCircle },
};

export default function PuestaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [summary, setSummary]     = useState<PuestaSummary | null>(null);
  const [breakdown, setBreakdown] = useState<PuestaDailyBreakdown[]>([]);
  const [salidas, setSalidas]     = useState<SalidaParcial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);
  const [salidaFormOpen, setSalidaFormOpen] = useState(false);
  const [editingSalida, setEditingSalida]   = useState<SalidaParcial | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [summaryRes, breakdownRes, salidasRes] = await Promise.all([
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
    ]);

    if (summaryRes.error) {
      toast({ variant: "destructive", title: "Error", description: summaryRes.error.message });
    } else {
      setSummary((summaryRes.data?.[0] as PuestaSummary) ?? null);
    }

    if (!breakdownRes.error) {
      setBreakdown((breakdownRes.data ?? []) as PuestaDailyBreakdown[]);
    }

    if (!salidasRes.error) {
      setSalidas((salidasRes.data ?? []) as SalidaParcial[]);
    }

    setIsLoading(false);
  }, [supabase, id, today]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCreateSalida(values: SalidaParcialFormValues) {
    setIsSaving(true);
    const result = await createSalidaParcial(values, summary?.cantidad_pendiente ?? 0);
    if (result.error) {
      toast({ variant: "destructive", title: "Error al registrar salida", description: result.error });
    } else {
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

  function handleEditSalida(salida: SalidaParcial) {
    setEditingSalida(salida);
    setSalidaFormOpen(true);
  }

  const salidaColumns = getSalidaColumns(handleEditSalida, handleDeleteSalida, summary?.unit);

  // Chart data: last 30 days of breakdown
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
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
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
        <Button variant="outline" onClick={() => router.push("/puestas")}>
          <ArrowLeft className="mr-2 h-4 w-4" />Volver al listado
        </Button>
      </div>
    );
  }

  const estadoCfg = estadoConfig[summary.estado] ?? estadoConfig.abierta;
  const EstadoIcon = estadoCfg.icon;
  const porcentajeSalida = summary.cantidad_inicial > 0
    ? Math.round((summary.cantidad_salida / summary.cantidad_inicial) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/puestas")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">
              {summary.numero_contrato || "Sin referencia"}
            </h1>
            <Badge variant={estadoCfg.variant} className="flex items-center gap-1">
              <EstadoIcon className="h-3 w-3" />
              {estadoCfg.label}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {summary.customer_name || "Sin cliente"} · {summary.product_name} · {summary.warehouse_name}
          </p>
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
            <p className="text-2xl font-bold tabular-nums">
              {formatNumber(summary.cantidad_inicial)}
            </p>
            <p className="text-xs text-muted-foreground">{summary.unit}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Truck className="h-3.5 w-3.5" />Salida total
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatNumber(summary.cantidad_salida)}
            </p>
            <p className="text-xs text-muted-foreground">{porcentajeSalida}% retirado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />Pendiente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatNumber(summary.cantidad_pendiente)}
            </p>
            <p className="text-xs text-muted-foreground">{summary.unit} en almacén</p>
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
            <p className="text-xs text-muted-foreground">
              {summary.dias_activos} días activos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Info + Chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Info panel */}
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
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Días activos (coste)</span>
              <span className="font-bold text-primary">{summary.dias_activos}</span>
            </div>
          </CardContent>
        </Card>

        {/* Cost chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Evolución de costes diarios</CardTitle>
            <CardDescription>Últimos 30 días</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Aún no hay datos de coste (en período de plancha)
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
                  <Tooltip
                    formatter={(value: number) => [`${formatCurrency(value)}`, "Coste día"]}
                    labelClassName="font-medium"
                  />
                  <Area
                    type="monotone"
                    dataKey="coste"
                    stroke="hsl(var(--primary))"
                    fill="url(#costGradient)"
                    strokeWidth={2}
                  />
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
              {salidas.length} salida{salidas.length !== 1 ? "s" : ""} registrada{salidas.length !== 1 ? "s" : ""}
            </CardDescription>
          </div>
          {summary.estado === "abierta" && summary.cantidad_pendiente > 0 && (
            <Button
              size="sm"
              onClick={() => { setEditingSalida(null); setSalidaFormOpen(true); }}
            >
              <Plus className="mr-2 h-4 w-4" />Registrar salida
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

      {/* Daily breakdown table (collapsible) */}
      {breakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Desglose diario de almacenaje</CardTitle>
            <CardDescription>
              {breakdown.length} días · Total acumulado: {formatCurrency(summary.coste_acumulado)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Fecha</th>
                    <th className="pb-2 text-center font-medium">Día activo</th>
                    <th className="pb-2 text-right font-medium">Pendiente</th>
                    <th className="pb-2 text-right font-medium">Tarifa/ud</th>
                    <th className="pb-2 text-right font-medium">Coste día</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={row.dia} className="border-b last:border-0 hover:bg-muted/40">
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
                  ))}
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
          </CardContent>
        </Card>
      )}

      {/* Salida form */}
      <SalidaParcialForm
        open={salidaFormOpen}
        onOpenChange={(open) => { setSalidaFormOpen(open); if (!open) setEditingSalida(null); }}
        onSubmit={editingSalida ? handleUpdateSalida : handleCreateSalida}
        isLoading={isSaving}
        puestaId={id}
        cantidadPendiente={summary.cantidad_pendiente}
        unit={summary.unit}
        defaultValues={editingSalida ?? undefined}
      />
    </div>
  );
}
