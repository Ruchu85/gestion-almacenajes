"use client";

import { useCallback, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  FileUp,
  Loader2,
  ScanSearch,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/utils/format";
import { exportToExcel } from "@/utils/export";
import { auditPdfAction } from "@/lib/actions/pdf-audit";
import type { AuditFileReport } from "@/validations/pdf-audit.schema";
import { AuditReportTable, isLineaProblematica } from "./audit-report-table";

interface PdfAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_MB = 15;
const MAX_FILES = 20;

interface Progress {
  done: number;
  total: number;
  current: string;
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "good" && "text-green-600 dark:text-green-400",
          tone === "bad" && "text-red-600 dark:text-red-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function PdfAuditDialog({ open, onOpenChange }: PdfAuditDialogProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [reports, setReports] = useState<AuditFileReport[] | null>(null);
  const [soloProblemas, setSoloProblemas] = useState(true);

  function reset() {
    setFiles([]);
    setIsDragging(false);
    setUploadError(null);
    setProgress(null);
    setReports(null);
    setSoloProblemas(true);
  }

  function handleOpenChange(next: boolean) {
    if (!next && progress) return; // no cerrar a mitad de un análisis
    if (!next) reset();
    onOpenChange(next);
  }

  const addFiles = useCallback((incoming: FileList | null) => {
    setUploadError(null);
    if (!incoming || incoming.length === 0) return;

    const aceptados: File[] = [];
    const rechazados: string[] = [];

    for (const candidate of Array.from(incoming)) {
      const isPdf =
        candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        rechazados.push(`${candidate.name} (no es PDF)`);
      } else if (candidate.size > MAX_MB * 1024 * 1024) {
        rechazados.push(`${candidate.name} (supera ${MAX_MB} MB)`);
      } else {
        aceptados.push(candidate);
      }
    }

    setFiles((prev) => {
      const merged = [...prev];
      for (const f of aceptados) {
        if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
      }
      if (merged.length > MAX_FILES) {
        setUploadError(`Máximo ${MAX_FILES} PDF por revisión. Se han descartado los sobrantes.`);
        return merged.slice(0, MAX_FILES);
      }
      return merged;
    });

    if (rechazados.length > 0) {
      setUploadError(`No se han añadido: ${rechazados.join(", ")}`);
    }
  }, []);

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleAnalyze() {
    if (files.length === 0) return;
    setUploadError(null);
    setReports([]);

    const acumulados: AuditFileReport[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress({ done: i, total: files.length, current: file.name });
      try {
        const formData = new FormData();
        formData.append("file", file);
        const report = await auditPdfAction(formData);
        acumulados.push(report);
      } catch (err) {
        acumulados.push({
          fileName: file.name,
          ok: false,
          error: `Error inesperado: ${(err as Error).message}`,
          warehouseId: null,
          warehouseName: null,
          fechas: [],
          lines: [],
          sobrantes: [],
          findings: [],
          totals: null,
        });
      }
      // Se van pintando conforme terminan, sin esperar a todo el lote.
      setReports([...acumulados]);
    }

    setProgress(null);
    const problemas = acumulados.reduce(
      (acc, r) => acc + r.lines.filter(isLineaProblematica).length,
      0
    );
    const sinGrabar = acumulados.reduce(
      (acc, r) => acc + r.lines.filter((l) => l.status === "no_registrada").length,
      0
    );
    toast({
      title:
        problemas === 0
          ? "Revisión completada: no falta nada"
          : sinGrabar > 0
            ? `${sinGrabar} pesada(s) del PDF sin grabar`
            : `${problemas} línea(s) a revisar`,
      description:
        problemas === 0
          ? "Todas las pesadas de los PDF están registradas con la cantidad correcta."
          : "Revisa el informe: hay datos del PDF que no cuadran con lo grabado.",
      variant: problemas === 0 ? "default" : "destructive",
    });
  }

  async function handleExport() {
    if (!reports) return;
    const rows = reports.flatMap((r) =>
      r.lines.map((l) => ({
        archivo: r.fileName,
        almacen: r.warehouseName ?? "",
        estado: l.status,
        ticket: l.ticket ?? "",
        fecha_pdf: l.fecha,
        fecha_sistema: l.registered?.fecha ?? "",
        matricula: l.matricula,
        cliente: l.cliente ?? "",
        cantidad_pdf: l.cantidad,
        cantidad_sistema: l.registered?.cantidad ?? "",
        diferencia: l.diferencia ?? "",
        avisos: l.findings.map((f) => f.message).join(" | "),
      }))
    );

    if (rows.length === 0) {
      toast({ variant: "destructive", title: "Nada que exportar" });
      return;
    }

    await exportToExcel(
      rows,
      [
        { key: "archivo", header: "Archivo" },
        { key: "almacen", header: "Almacén" },
        { key: "estado", header: "Estado" },
        { key: "ticket", header: "Ticket" },
        { key: "fecha_pdf", header: "Fecha PDF" },
        { key: "fecha_sistema", header: "Fecha sistema" },
        { key: "matricula", header: "Matrícula" },
        { key: "cliente", header: "Cliente" },
        { key: "cantidad_pdf", header: "Cantidad PDF" },
        { key: "cantidad_sistema", header: "Cantidad sistema" },
        { key: "diferencia", header: "Diferencia" },
        { key: "avisos", header: "Avisos" },
      ],
      {
        filename: `revision-salidas-puerto-${new Date().toISOString().split("T")[0]}`,
        title: "Revisión",
      }
    );
  }

  const showResults = reports !== null;

  const summary = reports
    ? {
        archivos: reports.length,
        lineas: reports.reduce((a, r) => a + r.lines.length, 0),
        problemas: reports.reduce((a, r) => a + r.lines.filter(isLineaProblematica).length, 0),
        noRegistradas: reports.reduce(
          (a, r) => a + r.lines.filter((l) => l.status === "no_registrada").length,
          0
        ),
        cantidades: reports.reduce(
          (a, r) => a + r.lines.filter((l) => l.status === "cantidad_distinta").length,
          0
        ),
        sobrantes: reports.reduce((a, r) => a + r.sobrantes.length, 0),
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(showResults ? "sm:max-w-[94vw]" : "sm:max-w-[520px]")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-brand-500" />
            Revisar Salidas Puerto (PDF)
          </DialogTitle>
          <DialogDescription>
            {showResults
              ? "Comparación entre lo que dicen los PDF y lo que hay grabado. Esta pantalla no modifica nada."
              : "Sube los PDF ya importados para volver a leerlos y compararlos con lo registrado. No se graba ni se modifica nada: es solo una revisión."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Selección de archivos ─────────────────────────── */}
        {!showResults && (
          <div className="space-y-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors cursor-pointer",
                isDragging
                  ? "border-brand-500 bg-brand-500/5"
                  : "border-muted-foreground/25 hover:border-brand-500/50 hover:bg-muted/40"
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <FileUp className="h-9 w-9 text-muted-foreground" />
              <p className="text-sm font-medium">Arrastra aquí los PDF a revisar</p>
              <p className="text-xs text-muted-foreground">
                Puedes soltar varios a la vez (máximo {MAX_FILES})
              </p>
            </div>

            {files.length > 0 && (
              <div className="rounded-md border border-border/60 divide-y divide-border/40 max-h-52 overflow-auto">
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-brand-500" />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(f.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="rounded-full p-0.5 hover:bg-muted shrink-0"
                      aria-label={`Quitar ${f.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {uploadError && (
              <p className="text-sm text-amber-600 dark:text-amber-400">{uploadError}</p>
            )}
          </div>
        )}

        {/* ── Progreso ──────────────────────────────────────── */}
        {progress && (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
              <span className="font-medium">
                Analizando {progress.done + 1} de {progress.total}
              </span>
              <span className="text-muted-foreground truncate">— {progress.current}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-300"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Cada PDF se lee dos veces para contrastar las cantidades, así que tarda un poco.
            </p>
          </div>
        )}

        {/* ── Resultados ────────────────────────────────────── */}
        {showResults && summary && (
          <div className="space-y-3 max-h-[68vh] overflow-auto pr-1">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <SummaryCard label="Sin grabar" value={summary.noRegistradas} tone="bad" />
              <SummaryCard label="Cantidad distinta" value={summary.cantidades} tone="bad" />
              <SummaryCard
                label="Correctas"
                value={summary.lineas - summary.problemas}
                tone="good"
              />
              <SummaryCard label="Pesadas" value={summary.lineas} />
              <SummaryCard label="Archivos" value={summary.archivos} />
              <SummaryCard label="Solo en sistema" value={summary.sobrantes} />
            </div>

            {!progress && summary.problemas === 0 && (
              <div className="flex gap-3 rounded-lg border border-green-500/40 bg-green-50 dark:bg-green-950/30 p-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
                <p className="text-sm text-green-800 dark:text-green-300">
                  Todas las pesadas de los PDF están grabadas y con la cantidad correcta. No falta
                  nada por importar.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={soloProblemas} onCheckedChange={setSoloProblemas} />
                Mostrar solo lo que hay que revisar
              </label>
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Exportar informe
              </Button>
            </div>

            {reports.map((report, i) => (
              <AuditReportTable
                key={`${report.fileName}-${i}`}
                report={report}
                soloProblemas={soloProblemas}
              />
            ))}
          </div>
        )}

        <DialogFooter>
          {!showResults ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAnalyze} disabled={files.length === 0}>
                <ScanSearch className="mr-2 h-4 w-4" />
                Revisar {files.length > 0 ? `${files.length} PDF` : ""}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setReports(null);
                  setFiles([]);
                }}
                disabled={!!progress}
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Revisar otros
              </Button>
              <Button onClick={() => handleOpenChange(false)} disabled={!!progress}>
                Cerrar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
