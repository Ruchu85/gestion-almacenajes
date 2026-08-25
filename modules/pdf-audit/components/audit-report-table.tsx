"use client";

import { AlertCircle, CheckCircle2, FileText, Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/utils/format";
import type {
  AuditFileReport,
  AuditFinding,
  AuditLineResult,
  AuditLineStatus,
} from "@/validations/pdf-audit.schema";

const STATUS_META: Record<
  AuditLineStatus,
  { label: string; variant: "success" | "warning" | "destructive" | "info"; problema: boolean }
> = {
  ok: { label: "Correcta", variant: "success", problema: false },
  cantidad_distinta: { label: "Cantidad distinta", variant: "destructive", problema: true },
  fecha_distinta: { label: "Fecha distinta", variant: "warning", problema: true },
  no_registrada: { label: "No registrada", variant: "destructive", problema: true },
  duplicada: { label: "Duplicada", variant: "warning", problema: true },
};

const FINDING_STYLES: Record<
  AuditFinding["level"],
  { box: string; icon: typeof TriangleAlert; iconClass: string; text: string }
> = {
  error: {
    box: "border-red-500/40 bg-red-50 dark:border-red-500/40 dark:bg-red-950/40",
    icon: TriangleAlert,
    iconClass: "text-red-600 dark:text-red-400",
    text: "text-red-700 dark:text-red-300",
  },
  warning: {
    box: "border-amber-500/40 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/40",
    icon: AlertCircle,
    iconClass: "text-amber-600 dark:text-amber-400",
    text: "text-amber-800 dark:text-amber-300",
  },
  info: {
    box: "border-brand-500/40 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-950/40",
    icon: Info,
    iconClass: "text-brand-600 dark:text-brand-400",
    text: "text-brand-800 dark:text-brand-300",
  },
};

export function isLineaProblematica(line: AuditLineResult): boolean {
  return STATUS_META[line.status].problema || line.findings.some((f) => f.level !== "info");
}

function FindingList({ findings }: { findings: AuditFinding[] }) {
  const order: AuditFinding["level"][] = ["error", "warning", "info"];
  const sorted = [...findings].sort(
    (a, b) => order.indexOf(a.level) - order.indexOf(b.level)
  );
  return (
    <div className="space-y-2">
      {sorted.map((f, i) => {
        const style = FINDING_STYLES[f.level];
        const Icon = style.icon;
        return (
          <div
            key={`${f.code}-${i}`}
            className={cn("flex gap-3 rounded-lg border p-3", style.box)}
          >
            <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", style.iconClass)} />
            <p className={cn("text-sm", style.text)}>{f.message}</p>
          </div>
        );
      })}
    </div>
  );
}

interface AuditReportTableProps {
  report: AuditFileReport;
  /** Cuando está activo solo se pintan las líneas con algo que revisar. */
  soloProblemas: boolean;
}

export function AuditReportTable({ report, soloProblemas }: AuditReportTableProps) {
  if (!report.ok) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-50 dark:bg-red-950/40 p-4">
        <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-200">
          <FileText className="h-4 w-4" />
          {report.fileName}
        </div>
        <p className="mt-1 text-sm text-red-700 dark:text-red-300">{report.error}</p>
      </div>
    );
  }

  const visibles = soloProblemas ? report.lines.filter(isLineaProblematica) : report.lines;
  const problemas = report.lines.filter(isLineaProblematica).length;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Cabecera del documento */}
      <div className="bg-muted/40 px-4 py-3 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-medium truncate">{report.fileName}</span>
            {problemas === 0 ? (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Todo cuadra
              </Badge>
            ) : (
              <Badge variant="destructive">
                {problemas} línea{problemas > 1 ? "s" : ""} a revisar
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {report.warehouseName ?? "Almacén sin identificar"}
            {report.fechas.length > 0 && (
              <>
                {" · "}
                {report.fechas.length === 1
                  ? formatDate(report.fechas[0])
                  : `${formatDate(report.fechas[0])} – ${formatDate(
                      report.fechas[report.fechas.length - 1]
                    )}`}
              </>
            )}
            {" · "}
            {report.lines.length} pesada{report.lines.length > 1 ? "s" : ""}
          </div>
        </div>

        {/* Cuadre contra el total declarado por el propio PDF */}
        {report.totals?.declarado != null && (
          <div
            className={cn(
              "mt-2 text-xs font-medium tabular-nums",
              report.totals.cuadra
                ? "text-green-700 dark:text-green-400"
                : "text-red-700 dark:text-red-400"
            )}
          >
            Total declarado en el PDF: {formatNumber(report.totals.declarado)}{" "}
            {report.totals.unidad} · Suma de pesadas leídas:{" "}
            {formatNumber(report.totals.extraido)} {report.totals.unidad}
            {report.totals.cuadra
              ? " · cuadra"
              : ` · descuadre de ${formatNumber(report.totals.diferencia ?? 0)}`}
          </div>
        )}
      </div>

      {report.findings.length > 0 && (
        <div className="p-3 border-b border-border">
          <FindingList findings={report.findings} />
        </div>
      )}

      {/* Líneas */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left font-semibold px-3 py-2">Estado</th>
              <th className="text-left font-semibold px-3 py-2">Ticket</th>
              <th className="text-left font-semibold px-3 py-2">Fecha</th>
              <th className="text-left font-semibold px-3 py-2">Matrícula</th>
              <th className="text-left font-semibold px-3 py-2">Cliente</th>
              <th className="text-right font-semibold px-3 py-2">PDF</th>
              <th className="text-right font-semibold px-3 py-2">Sistema</th>
              <th className="text-right font-semibold px-3 py-2">Dif.</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  {soloProblemas
                    ? "Ninguna línea de este documento necesita revisión."
                    : "El documento no tiene líneas."}
                </td>
              </tr>
            ) : (
              visibles.map((line) => {
                const meta = STATUS_META[line.status];
                const hayAviso = line.findings.length > 0;
                return (
                  <tr
                    key={line.id}
                    className={cn(
                      "border-t border-border/40 align-top",
                      meta.problema && "bg-red-50/40 dark:bg-red-950/10"
                    )}
                  >
                    <td className="px-3 py-2">
                      <Badge variant={meta.variant} className="whitespace-nowrap">
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{line.ticket ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDate(line.fecha)}
                      {line.status === "fecha_distinta" && line.registered && (
                        <div className="text-[10px] text-amber-700 dark:text-amber-400">
                          sistema: {formatDate(line.registered.fecha)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">{line.matricula}</td>
                    <td className="px-3 py-2 max-w-[180px] truncate" title={line.cliente ?? ""}>
                      {line.cliente || <span className="text-muted-foreground">salida propia</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatNumber(line.cantidad)}
                      {line.cantidadOrigen != null && (
                        <div className="text-[10px] text-muted-foreground">
                          {formatNumber(line.cantidadOrigen)} {line.unidadOrigen}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {line.registered ? formatNumber(line.registered.cantidad) : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums font-semibold",
                        line.diferencia != null && Math.abs(line.diferencia) > 0.005
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {line.diferencia != null && Math.abs(line.diferencia) > 0.005
                        ? formatNumber(line.diferencia)
                        : "—"}
                    </td>
                  </tr>
                );
              })
            )}
            {/* Avisos por línea, en su propia fila para no romper la tabla */}
            {visibles.map((line) =>
              line.findings.length > 0 ? (
                <tr key={`${line.id}-avisos`} className="border-t border-border/20">
                  <td />
                  <td colSpan={7} className="px-3 pb-2">
                    <ul className="space-y-1">
                      {line.findings.map((f, i) => (
                        <li
                          key={`${f.code}-${i}`}
                          className={cn(
                            "text-[11px] flex gap-1.5",
                            f.level === "error"
                              ? "text-red-700 dark:text-red-400"
                              : f.level === "warning"
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-muted-foreground"
                          )}
                        >
                          <span aria-hidden>•</span>
                          <span>
                            <span className="font-mono opacity-70">{line.ticket ?? line.matricula}</span>{" "}
                            {f.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ) : null
            )}
          </tbody>
        </table>
      </div>

      {/* Registros del sistema sin respaldo en el PDF */}
      {report.sobrantes.length > 0 && (
        <div className="border-t border-border bg-amber-50/40 dark:bg-amber-950/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400 mb-2">
            Grabado en el sistema pero no en el PDF ({report.sobrantes.length})
          </p>
          <ul className="space-y-1 text-xs">
            {report.sobrantes.map((s) => (
              <li key={s.id} className="flex flex-wrap gap-x-3 text-amber-900 dark:text-amber-300">
                <span className="tabular-nums">{formatDate(s.fecha)}</span>
                <span className="font-mono">{s.matricula ?? "sin matrícula"}</span>
                <span className="tabular-nums font-medium">{formatNumber(s.cantidad)}</span>
                {s.ticket && <span className="opacity-70">ticket {s.ticket}</span>}
                <span className="opacity-70">{s.referencia}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
