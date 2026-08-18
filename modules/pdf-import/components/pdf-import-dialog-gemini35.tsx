"use client";

/**
 * Copia deliberada de `pdf-import-dialog.tsx` para probar Gemini 3.5 Flash
 * sin tocar el diálogo de producción. Comparte el motor de cruce y las
 * acciones de confirmación (`confirmSalidasAction`/`confirmSalidasNormalesAction`),
 * solo cambia qué acción de análisis llama. Pensado para probar en modo
 * Desarrollo antes de decidir si sustituye al flujo estable.
 */
import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileUp, FileText, Loader2, ScanSearch, X, ArrowLeft, CheckCircle2, TriangleAlert, Info, FlaskConical,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/utils/format";
import { analyzePdfActionGemini35 } from "@/lib/actions/pdf-import-gemini35";
import { confirmSalidasAction, confirmSalidasNormalesAction } from "@/lib/actions/pdf-import";
import type {
  PdfConfirmItem,
  PdfConfirmNormalItem,
  PdfResumenAlert,
  PuestaMatchRef,
} from "@/validations/pdf-import.schema";
import { ProposalTable, type EditableProposal } from "./proposal-table";

interface PdfImportDialogGemini35Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_MB = 15;

const ALERT_STYLES: Record<
  PdfResumenAlert["level"],
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
    icon: TriangleAlert,
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

function ResumenAlerts({ alerts }: { alerts: PdfResumenAlert[] }) {
  const order: PdfResumenAlert["level"][] = ["error", "warning", "info"];
  const sorted = [...alerts].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));

  return (
    <div className="space-y-2">
      {sorted.map((alert, i) => {
        const style = ALERT_STYLES[alert.level];
        const AlertIcon = style.icon;
        return (
          <div key={`${alert.level}-${alert.cliente}-${i}`} className={cn("flex gap-3 rounded-lg border p-3", style.box)}>
            <AlertIcon className={cn("h-5 w-5 shrink-0 mt-0.5", style.iconClass)} />
            <p className={cn("text-sm", style.text)}>{alert.message}</p>
          </div>
        );
      })}
    </div>
  );
}

export function PdfImportDialogGemini35({ open, onOpenChange }: PdfImportDialogGemini35Props) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [proposals, setProposals] = useState<EditableProposal[] | null>(null);
  const [alerts, setAlerts] = useState<PdfResumenAlert[]>([]);

  function reset() {
    setFile(null);
    setIsDragging(false);
    setUploadError(null);
    setAnalyzing(false);
    setConfirming(false);
    setProposals(null);
    setAlerts([]);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const validateAndSet = useCallback((candidate: File | undefined) => {
    setUploadError(null);
    if (!candidate) return;
    const isPdf = candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setUploadError("El archivo no es un PDF. Solo se admiten documentos PDF.");
      return;
    }
    if (candidate.size > MAX_MB * 1024 * 1024) {
      setUploadError(`El PDF supera el tamaño máximo (${MAX_MB} MB).`);
      return;
    }
    setFile(candidate);
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    validateAndSet(e.dataTransfer.files?.[0]);
  }

  async function handleAnalyze() {
    if (!file) return;
    setAnalyzing(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await analyzePdfActionGemini35(formData);
      if (res.error || !res.data) {
        setUploadError(res.error ?? "No se pudo analizar el documento.");
        return;
      }
      const editable: EditableProposal[] = res.data.proposals.map((p) => ({
        ...p,
        selected:
          p.tipo === "normal"
            ? !!(p.resolvedWarehouseId && p.resolvedProductId) && p.warnings.length === 0
            : p.confidence === "alta",
        chosenPuestaId: p.match?.puesta_id ?? null,
        edited: {
          fecha: p.line.fecha,
          matricula: p.line.matricula.toUpperCase(),
          cantidad: p.line.cantidad,
        },
      }));
      setProposals(editable);
      setAlerts(res.data.alerts);
    } catch (err) {
      setUploadError(`Error inesperado: ${(err as Error).message}`);
    } finally {
      setAnalyzing(false);
    }
  }

  function updateItem(index: number, patch: Partial<EditableProposal>) {
    setProposals((prev) => (prev ? prev.map((it, i) => (i === index ? { ...it, ...patch } : it)) : prev));
  }

  function handleToggle(index: number, selected: boolean) {
    updateItem(index, { selected });
  }

  function handleEdit(index: number, field: "fecha" | "matricula" | "cantidad", value: string | number) {
    setProposals((prev) =>
      prev ? prev.map((it, i) => (i === index ? { ...it, edited: { ...it.edited, [field]: value } } : it)) : prev
    );
  }

  function handleChoosePuesta(index: number, puestaId: string) {
    updateItem(index, { chosenPuestaId: puestaId });
  }

  function resolveRef(item: EditableProposal): PuestaMatchRef | null {
    const all = [item.match, ...item.candidates].filter(Boolean) as PuestaMatchRef[];
    return all.find((r) => r.puesta_id === item.chosenPuestaId) ?? item.match;
  }

  function traceComment(p: EditableProposal): string[] {
    const parts: string[] = [];
    if (p.line.ticket) parts.push(`Ticket ${p.line.ticket}`);
    if (p.line.remolque) parts.push(`Remolque ${p.line.remolque}`);
    if (p.line.cantidad_origen != null) {
      parts.push(`${formatNumber(p.line.cantidad_origen)} ${p.line.unidad_origen ?? ""} en el PDF`.trim());
    }
    return parts;
  }

  function isSelectedAndValid(p: EditableProposal): boolean {
    if (!p.selected) return false;
    if (p.tipo === "normal") return !!(p.resolvedWarehouseId && p.resolvedProductId);
    return !!resolveRef(p);
  }

  async function handleConfirm() {
    if (!proposals) return;
    const selected = proposals.filter(isSelectedAndValid);
    if (selected.length === 0) {
      toast({ variant: "destructive", title: "Nada que grabar", description: "Selecciona al menos una fila válida." });
      return;
    }

    const puestaItems: PdfConfirmItem[] = selected
      .filter((p) => p.tipo === "puesta")
      .map((p) => {
        const ref = resolveRef(p)!;
        return {
          puesta_id: ref.puesta_id,
          fecha_salida: p.edited.fecha,
          matricula: p.edited.matricula,
          cantidad: p.edited.cantidad,
          cantidad_pendiente: ref.cantidad_pendiente,
          n_camion: null,
          comentarios: [`Importada desde PDF · Gemini 3.5 (puesta ${ref.numero_contrato})`, ...traceComment(p)].join(" · "),
        };
      });

    const normalItems: PdfConfirmNormalItem[] = selected
      .filter((p) => p.tipo === "normal")
      .map((p) => {
        const parts = [...traceComment(p)];
        if (p.line.numero_puesta) parts.push(`Contrato ref. ${p.line.numero_puesta}`);
        return {
          warehouse_id: p.resolvedWarehouseId!,
          product_id: p.resolvedProductId!,
          fecha_salida: p.edited.fecha,
          matricula: p.edited.matricula,
          cantidad: p.edited.cantidad,
          comentarios: parts.length > 0 ? parts.join(" · ") : null,
          origen: "PDF · Gemini 3.5",
        };
      });

    setConfirming(true);
    try {
      const [puestaRes, normalRes] = await Promise.all([
        puestaItems.length > 0 ? confirmSalidasAction(puestaItems) : Promise.resolve({ data: [], error: undefined }),
        normalItems.length > 0 ? confirmSalidasNormalesAction(normalItems) : Promise.resolve({ data: [], error: undefined }),
      ]);

      if ((puestaRes.error && puestaItems.length > 0) || (normalRes.error && normalItems.length > 0)) {
        const errMsg = puestaRes.error ?? normalRes.error;
        toast({ variant: "destructive", title: "Error al grabar", description: errMsg ?? "Inténtalo de nuevo." });
        return;
      }

      const allResults = [...(puestaRes.data ?? []), ...(normalRes.data ?? [])];
      const okCount = allResults.filter((r) => r.ok).length;
      const failCount = allResults.length - okCount;

      if (okCount > 0) {
        toast({
          title: `${okCount} salida(s) grabada(s)`,
          description: failCount > 0 ? `${failCount} fila(s) fallaron.` : "Las salidas se han registrado correctamente.",
        });
      }
      if (failCount > 0) {
        const firstErr = allResults.find((r) => !r.ok)?.error;
        toast({ variant: "destructive", title: `${failCount} fila(s) no se grabaron`, description: firstErr ?? "Revisa los datos." });
      }

      if (failCount === 0) {
        window.location.reload();
      } else {
        router.refresh();
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Error inesperado", description: (err as Error).message });
    } finally {
      setConfirming(false);
    }
  }

  const selectedCount = proposals?.filter(isSelectedAndValid).length ?? 0;
  const showResults = proposals !== null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(showResults ? "sm:max-w-[92vw]" : "sm:max-w-[480px]")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-amber-500" />
            {showResults ? "Propuesta de salidas (Beta Gemini 3.5)" : "Subir Salidas Puerto (PDF) · Beta Gemini 3.5"}
          </DialogTitle>
          <DialogDescription>
            {showResults
              ? "Revisa, ajusta y selecciona las salidas que quieras grabar. Nada se guarda hasta que confirmes."
              : "Prueba experimental con Gemini 3.5 Flash. Úsala en modo Desarrollo para comparar contra el flujo estable antes de confiar en ella."}
          </DialogDescription>
        </DialogHeader>

        {!showResults && (
          <div className="space-y-4">
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer",
                isDragging
                  ? "border-brand-500 bg-brand-500/5"
                  : "border-muted-foreground/25 hover:border-brand-500/50 hover:bg-muted/40"
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => validateAndSet(e.target.files?.[0] ?? undefined)}
              />
              {file ? (
                <>
                  <FileText className="h-9 w-9 text-brand-500" />
                  <div className="flex items-center gap-2 font-medium">
                    {file.name}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setFile(null); if (inputRef.current) inputRef.current.value = ""; }}
                      className="rounded-full p-0.5 hover:bg-muted"
                      aria-label="Quitar archivo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </>
              ) : (
                <>
                  <FileUp className="h-9 w-9 text-muted-foreground" />
                  <p className="text-sm font-medium">Arrastra el PDF aquí</p>
                  <p className="text-xs text-muted-foreground">o haz clic para buscar en tu equipo</p>
                </>
              )}
            </div>

            {uploadError && (
              <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <X className="h-4 w-4" /> {uploadError}
              </p>
            )}
          </div>
        )}

        {showResults && proposals && (() => {
          const unmatchedItems = proposals.filter((p) => {
            if (p.tipo === "normal") return !(p.resolvedWarehouseId && p.resolvedProductId);
            return p.confidence === "nula";
          });
          return (
            <div className="space-y-3">
              {alerts.length > 0 && <ResumenAlerts alerts={alerts} />}
              {unmatchedItems.length > 0 && (
                <div className="flex gap-3 rounded-lg border border-red-500/40 bg-red-50 dark:border-red-500/40 dark:bg-red-950/40 p-3">
                  <TriangleAlert className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                  <div className="text-sm text-red-700 dark:text-red-300">
                    <p className="font-semibold text-red-800 dark:text-red-200">
                      {unmatchedItems.length} línea{unmatchedItems.length > 1 ? "s" : ""} del PDF no se pueden procesar
                    </p>
                    <p className="mt-0.5 text-xs text-red-700/90 dark:text-red-300/90">
                      {unmatchedItems.map((p) => p.line.matricula || "sin matrícula").join(", ")}
                      {" "}— no se han encontrado en el sistema. Estas salidas{" "}
                      <strong>no se grabarán</strong>. Comprueba que la puesta está abierta o que el
                      almacén/producto coincide con los de la aplicación.
                    </p>
                  </div>
                </div>
              )}
              <div className="max-h-[60vh] overflow-auto">
                <ProposalTable items={proposals} onToggle={handleToggle} onEdit={handleEdit} onChoosePuesta={handleChoosePuesta} />
              </div>
            </div>
          );
        })()}

        <DialogFooter>
          {!showResults ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={analyzing}>
                Cancelar
              </Button>
              <Button onClick={handleAnalyze} disabled={!file || analyzing}>
                {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
                {analyzing ? "Analizando…" : "Analizar Documento"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setProposals(null); setAlerts([]); }} disabled={confirming}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Volver
              </Button>
              <Button onClick={handleConfirm} disabled={confirming || selectedCount === 0}>
                {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                {confirming ? "Grabando…" : `Confirmar ${selectedCount} salida(s)`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
