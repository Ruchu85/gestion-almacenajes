"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileUp, FileText, Loader2, ScanSearch, X, ArrowLeft, CheckCircle2, TriangleAlert, Info, Undo2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/utils/format";
import { analyzePdfAction, confirmSalidasAction, confirmSalidasNormalesAction } from "@/lib/actions/pdf-import";
import { applyRebases } from "@/services/pdf-import.service";
import type {
  PdfConfirmItem,
  PdfConfirmNormalItem,
  PdfResumenAlert,
  PuestaMatchRef,
} from "@/validations/pdf-import.schema";
import { ProposalTable, type EditableProposal } from "./proposal-table";

interface PdfImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_MB = 15;

/** Estilos y copy del panel de control cruzado contra el resumen del informe. */
const ALERT_STYLES: Record<
  PdfResumenAlert["level"],
  { box: string; icon: typeof TriangleAlert; iconClass: string; text: string }
> = {
  error: {
    box: "border-2 border-red-600 bg-red-100 dark:border-red-500 dark:bg-red-950/60",
    icon: TriangleAlert,
    iconClass: "text-red-600 dark:text-red-400",
    text: "text-red-800 dark:text-red-200 font-medium",
  },
  warning: {
    box: "border-2 border-amber-500 bg-amber-100 dark:border-amber-500 dark:bg-amber-950/60",
    icon: TriangleAlert,
    iconClass: "text-amber-600 dark:text-amber-400",
    text: "text-amber-900 dark:text-amber-200 font-medium",
  },
  info: {
    box: "border-2 border-brand-500 bg-brand-100 dark:border-brand-500 dark:bg-brand-950/60",
    icon: Info,
    iconClass: "text-brand-600 dark:text-brand-400",
    text: "text-brand-900 dark:text-brand-200",
  },
};

/**
 * Contraste entre el resumen de retiradas por cliente que declara el informe
 * (página de saldos) y lo que hay en la aplicación.
 */
function ResumenAlerts({ alerts }: { alerts: PdfResumenAlert[] }) {
  const order: PdfResumenAlert["level"][] = ["error", "warning", "info"];
  const sorted = [...alerts].sort(
    (a, b) => order.indexOf(a.level) - order.indexOf(b.level)
  );

  return (
    <div className="space-y-2">
      {sorted.map((alert, i) => {
        const style = ALERT_STYLES[alert.level];
        const AlertIcon = style.icon;
        return (
          <div
            key={`${alert.level}-${alert.cliente}-${i}`}
            className={cn("flex gap-3 rounded-lg border p-3", style.box)}
          >
            <AlertIcon className={cn("h-5 w-5 shrink-0 mt-0.5", style.iconClass)} />
            <p className={cn("text-sm", style.text)}>{alert.message}</p>
          </div>
        );
      })}
    </div>
  );
}

export function PdfImportDialog({ open, onOpenChange }: PdfImportDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /**
   * Gemini ha fallado y hay un motor alternativo disponible. No se usa solo:
   * se ofrece, y solo se lee con él si el usuario pulsa el botón.
   */
  const [ofreceMistral, setOfreceMistral] = useState(false);
  /** El documento en pantalla lo ha leído el motor alternativo. */
  const [leidoConMistral, setLeidoConMistral] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [proposals, setProposals] = useState<EditableProposal[] | null>(null);
  const [alerts, setAlerts] = useState<PdfResumenAlert[]>([]);

  // ── Reset al cerrar ──────────────────────────────────────
  function reset() {
    setFile(null);
    setIsDragging(false);
    setUploadError(null);
    setOfreceMistral(false);
    setLeidoConMistral(false);
    setAnalyzing(false);
    setConfirming(false);
    setProposals(null);
    setAlerts([]);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  // ── Validación y selección de archivo ────────────────────
  const validateAndSet = useCallback((candidate: File | undefined) => {
    setUploadError(null);
    if (!candidate) return;
    const isPdf =
      candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf");
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

  // ── Analizar ─────────────────────────────────────────────
  async function handleAnalyze(motor: "gemini" | "mistral" = "gemini") {
    if (!file) return;
    setAnalyzing(true);
    setUploadError(null);
    setOfreceMistral(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      // Solo se manda el motor alternativo cuando el usuario lo ha aceptado.
      if (motor === "mistral") formData.append("motor", "mistral");
      const res = await analyzePdfAction(formData);
      if (res.error || !res.data) {
        setUploadError(res.error ?? "No se pudo analizar el documento.");
        setOfreceMistral(!!res.puedeUsarMistral);
        return;
      }
      setLeidoConMistral(motor === "mistral");
      const editable: EditableProposal[] = res.data.proposals.map((p) => ({
        ...p,
        // Se preseleccionan las filas resueltas sin dudas: puestas con match de
        // confianza alta y salidas directas con almacén y producto identificados.
        // NO vienen marcadas: las cifras que las dos lecturas del PDF no leen
        // igual (las valida el usuario contra el papel) ni las devoluciones en
        // negativo (no se pueden grabar desde la importación).
        selected:
          (p.verificacion && !p.verificacion.coincide) || p.line.cantidad < 0 || !!p.rebase
            ? false
            : p.tipo === "normal"
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

  // ── Edición de la tabla ──────────────────────────────────
  function updateItem(index: number, patch: Partial<EditableProposal>) {
    setProposals((prev) =>
      prev ? prev.map((it, i) => (i === index ? { ...it, ...patch } : it)) : prev
    );
  }

  function handleToggle(index: number, selected: boolean) {
    updateItem(index, { selected });
  }

  /**
   * Rehace el cálculo de rebase sobre la lista entera.
   *
   * Hace falta porque el rebase es ACUMULATIVO: no depende solo de la fila que
   * se toca, sino de todas las que van a la misma puesta. Cambiar una cantidad
   * o mover un camión a otra puesta puede quitar el aviso rojo a una fila
   * posterior, o ponérselo. `applyRebases` es la misma función que usa el
   * servidor al analizar, así que las dos cuentas no pueden discrepar.
   */
  function withRebases(list: EditableProposal[]): EditableProposal[] {
    const copia = list.map((it) => ({ ...it, warnings: [...it.warnings] }));
    applyRebases(copia);
    return copia;
  }

  function handleEdit(index: number, field: "fecha" | "matricula" | "cantidad", value: string | number) {
    setProposals((prev) =>
      prev
        ? withRebases(
            prev.map((it, i) =>
              i === index ? { ...it, edited: { ...it.edited, [field]: value } } : it
            )
          )
        : prev
    );
  }

  function handleChoosePuesta(index: number, puestaId: string) {
    setProposals((prev) =>
      prev
        ? withRebases(
            prev.map((it, i) => (i === index ? { ...it, chosenPuestaId: puestaId } : it))
          )
        : prev
    );
  }

  // ── Confirmar ────────────────────────────────────────────
  function resolveRef(item: EditableProposal): PuestaMatchRef | null {
    const all = [item.match, ...item.candidates].filter(Boolean) as PuestaMatchRef[];
    return all.find((r) => r.puesta_id === item.chosenPuestaId) ?? item.match;
  }

  /** Traza del origen de la fila en el PDF (ticket, remolque, cantidad original). */
  function traceComment(p: EditableProposal): string[] {
    const parts: string[] = [];
    if (p.line.ticket) parts.push(`Ticket ${p.line.ticket}`);
    if (p.line.remolque) parts.push(`Remolque ${p.line.remolque}`);
    if (p.line.cantidad_origen != null) {
      parts.push(
        `${formatNumber(p.line.cantidad_origen)} ${p.line.unidad_origen ?? ""} en el PDF`.trim()
      );
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
          comentarios: [`Importada desde PDF (puesta ${ref.numero_contrato})`, ...traceComment(p)].join(
            " · "
          ),
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
        toast({
          variant: "destructive",
          title: `${failCount} fila(s) no se grabaron`,
          description: firstErr ?? "Revisa los datos.",
        });
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
            <FileUp className="h-5 w-5 text-brand-500" />
            {showResults ? "Propuesta de salidas" : "Subir Salidas Puerto (PDF)"}
          </DialogTitle>
          <DialogDescription>
            {showResults
              ? "Revisa, ajusta y selecciona las salidas que quieras grabar. Nada se guarda hasta que confirmes."
              : "Arrastra un PDF de salidas/retiradas o búscalo en tu equipo, y pulsa Analizar."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Vista de carga ── */}
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
                  <span className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
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
              <p className="text-sm text-red-600 dark:text-red-400 flex items-start gap-1.5">
                <X className="h-4 w-4 shrink-0 mt-0.5" /> <span>{uploadError}</span>
              </p>
            )}

            {/* Gemini ha fallado. NO se cambia de motor por iniciativa propia:
                se ofrece y decide el usuario, porque leer con el alternativo
                deja el documento sin la segunda lectura de verificación. */}
            {ofreceMistral && (
              <div className="rounded-lg border-2 border-amber-500 bg-amber-100 dark:bg-amber-950/60 p-3 space-y-2">
                <div className="flex gap-2">
                  <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="text-sm text-amber-900 dark:text-amber-200">
                    <p className="font-bold">¿Probamos con el motor alternativo?</p>
                    <p className="mt-1">
                      Gemini no ha podido leer el documento. Hay un segundo motor de otro
                      proveedor que puede intentarlo, pero ten en cuenta que{" "}
                      <strong>sus cantidades no se contrastan con una segunda lectura</strong>,
                      así que habrá que revisarlas todas contra el papel.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pl-7">
                  <Button
                    size="sm"
                    onClick={() => handleAnalyze("mistral")}
                    disabled={analyzing}
                    className="bg-amber-600 text-white hover:bg-amber-700"
                  >
                    {analyzing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ScanSearch className="mr-2 h-4 w-4" />
                    )}
                    Leer con el motor alternativo
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAnalyze("gemini")}
                    disabled={analyzing}
                  >
                    <Undo2 className="mr-2 h-4 w-4" />
                    Reintentar con Gemini
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Vista de propuestas ── */}
        {showResults && proposals && (() => {
          const unmatchedItems = proposals.filter((p) => {
            if (p.tipo === "normal") return !(p.resolvedWarehouseId && p.resolvedProductId);
            return p.confidence === "nula";
          });
          const dudosas = proposals
            .map((p, i) => ({ p, n: i + 1 }))
            .filter(({ p }) => p.verificacion && !p.verificacion.coincide);
          const devoluciones = proposals
            .map((p, i) => ({ p, n: i + 1 }))
            .filter(({ p }) => p.line.cantidad < 0);
          /** Filas que dejan su puesta con pendiente negativo. */
          const rebasadas = proposals
            .map((p, i) => ({ p, n: i + 1 }))
            .filter(({ p }) => !!p.rebase);
          return (
            <div className="space-y-3">
              {/* Leído por el motor alternativo: va primero y se queda visible
                  toda la revisión, porque cambia el nivel de confianza de TODA
                  la tabla (no hay segunda lectura con la que contrastar). */}
              {leidoConMistral && (
                <div className="flex gap-3 rounded-lg border-4 border-amber-500 bg-amber-100 dark:bg-amber-950/70 p-4 shadow-lg shadow-amber-500/20">
                  <TriangleAlert className="h-7 w-7 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="text-sm text-amber-900 dark:text-amber-200">
                    <p className="text-base font-extrabold uppercase tracking-wide">
                      Leído con el motor alternativo
                    </p>
                    <p className="mt-1 font-medium">
                      Gemini no respondió, así que este documento lo ha leído el segundo motor
                      y <strong>no se ha podido hacer la doble lectura</strong>. Ninguna cantidad
                      viene contrastada: revísalas <strong>todas</strong> contra el papel antes de
                      grabarlas.
                    </p>
                  </div>
                </div>
              )}
              {/* Devoluciones: el informe las trae en negativo y no se pueden grabar aquí. */}
              {devoluciones.length > 0 && (
                <div className="rounded-lg border-4 border-violet-600 bg-violet-100 dark:bg-violet-950/70 p-4 shadow-lg shadow-violet-500/20">
                  <div className="flex gap-3">
                    <Undo2 className="h-7 w-7 shrink-0 text-violet-600 dark:text-violet-400" />
                    <div className="space-y-2">
                      <p className="text-base font-extrabold uppercase tracking-wide text-violet-800 dark:text-violet-200">
                        {devoluciones.length} devolución{devoluciones.length > 1 ? "es" : ""} en el documento
                      </p>
                      <p className="text-sm font-medium text-violet-800 dark:text-violet-300">
                        Estas líneas vienen en <strong>negativo</strong>: anulan una retirada y la
                        mercancía vuelve al almacén. <strong>Ninguna viene marcada</strong>:
                        revísalas y márcalas tú.
                      </p>
                      <ul className="space-y-1 text-sm font-semibold text-violet-900 dark:text-violet-200">
                        {devoluciones.map(({ p, n }) => {
                          const grabable = !!p.devolucion?.tieneSalidaPositiva && !!p.match;
                          return (
                            <li key={p.id} className="flex flex-wrap items-center gap-x-2">
                              <span>Fila {n}</span>
                              <span className="font-mono text-xs">{p.line.matricula}</span>
                              {p.line.cliente && <span className="text-xs">{p.line.cliente}</span>}
                              <span className="tabular-nums">{formatNumber(p.line.cantidad)}</span>
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[11px] font-bold uppercase text-white",
                                  grabable ? "bg-violet-600" : "bg-red-600"
                                )}
                              >
                                {grabable
                                  ? "devuelve pendiente al cliente"
                                  : "ajústala a mano"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      {devoluciones.some((d) => !d.p.devolucion?.tieneSalidaPositiva || !d.p.match) && (
                        <p className="text-sm font-medium text-red-800 dark:text-red-300">
                          Las marcadas en rojo llegan <strong>sin la retirada que anulan</strong>, así
                          que no se sabe contra qué van: ajusta las salidas de ese cliente a mano.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Rebases: el PDF retira más de lo que le queda a la puesta. */}
              {rebasadas.length > 0 && (
                <div className="rounded-lg border-4 border-red-600 bg-red-100 dark:bg-red-950/70 p-4 shadow-lg shadow-red-500/20">
                  <div className="flex gap-3">
                    <TriangleAlert className="h-7 w-7 shrink-0 text-red-600 dark:text-red-400 animate-pulse" />
                    <div className="space-y-2">
                      <p className="text-base font-extrabold uppercase tracking-wide text-red-800 dark:text-red-200">
                        {rebasadas.length} camión{rebasadas.length > 1 ? "es" : ""} rebasa
                        {rebasadas.length > 1 ? "n" : ""} su puesta a disposición
                      </p>
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">
                        Al incluir{rebasadas.length > 1 ? "los" : "lo"}, la puesta se queda con{" "}
                        <strong>cantidad pendiente NEGATIVA</strong>: el PDF retira más de lo que
                        quedaba. Puede ser que falte una puesta por dar de alta, que el camión vaya
                        contra otro contrato, o que la cantidad esté mal leída. Se{" "}
                        {rebasadas.length > 1 ? "han dejado" : "ha dejado"}{" "}
                        <strong>sin marcar</strong>: revísalo y márcalo tú si la retirada es correcta.
                      </p>
                      <ul className="space-y-1 text-sm text-red-800 dark:text-red-200">
                        {rebasadas.map(({ p, n }) => (
                          <li key={p.id} className="flex flex-wrap items-center gap-x-2">
                            <span className="font-semibold">Fila {n}</span>
                            <span className="font-mono text-xs">{p.line.matricula}</span>
                            <span>
                              puesta <strong>{p.rebase!.numero_contrato}</strong>
                            </span>
                            <span className="tabular-nums">
                              quedaría en {formatNumber(p.rebase!.pendienteDespues)}{" "}
                              {p.rebase!.unit} ({formatNumber(p.rebase!.exceso)} de más)
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
              {/* Lo más grave primero: cifras que el PDF no ha leído igual dos veces. */}
              {dudosas.length > 0 && (
                <div className="rounded-lg border-4 border-red-600 bg-red-100 dark:bg-red-950/70 p-4 shadow-lg shadow-red-500/20">
                  <div className="flex gap-3">
                    <TriangleAlert className="h-7 w-7 shrink-0 text-red-600 dark:text-red-400 animate-pulse" />
                    <div className="space-y-2">
                      <p className="text-base font-extrabold uppercase tracking-wide text-red-800 dark:text-red-200">
                        Revisa {dudosas.length} cantidad{dudosas.length > 1 ? "es" : ""} antes de grabar
                      </p>
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">
                        El documento se ha leído dos veces y estas cifras <strong>no han salido
                        iguales</strong>, así que alguna puede estar mal interpretada. Se han dejado{" "}
                        <strong>sin marcar</strong> a propósito: compruébalas en el PDF original y
                        márcalas tú si son correctas.
                      </p>
                      <ul className="space-y-1 text-sm text-red-800 dark:text-red-200">
                        {dudosas.map(({ p, n }) => (
                          <li key={p.id} className="flex flex-wrap items-center gap-x-2">
                            <span className="font-semibold">Fila {n}</span>
                            <span className="font-mono text-xs">{p.line.matricula}</span>
                            {p.line.ticket && (
                              <span className="text-xs opacity-80">ticket {p.line.ticket}</span>
                            )}
                            <span className="tabular-nums">
                              {formatNumber(p.line.cantidad_origen ?? p.line.cantidad)}
                              {" vs "}
                              {formatNumber(p.verificacion!.neto)}{" "}
                              {p.line.unidad_origen ?? p.line.unidad ?? ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
              {/* Resumen de avisos: el detalle de cada uno se abre desde el
                  icono ⚠ de su propia fila. */}
              {(() => {
                const duplicadas = proposals.filter((p) =>
                  p.warnings.some((w) => w.includes("Ya existe una salida idéntica"))
                ).length;
                const conAvisos = proposals.filter((p) => p.warnings.length > 0).length;
                if (conAvisos === 0) return null;
                return (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border-2 border-amber-500 bg-amber-100 dark:bg-amber-950/60 px-3 py-2 text-sm">
                    <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="font-bold text-amber-900 dark:text-amber-200">
                      {conAvisos} fila{conAvisos > 1 ? "s" : ""} con avisos
                    </span>
                    {duplicadas > 0 && (
                      <span className="font-semibold text-red-700 dark:text-red-400">
                        · {duplicadas} parece{duplicadas > 1 ? "n" : ""} ya registrada
                        {duplicadas > 1 ? "s" : ""}
                      </span>
                    )}
                    <span className="text-xs text-amber-800/80 dark:text-amber-300/80">
                      — pulsa el icono ⚠ de cada fila para ver el detalle
                    </span>
                  </div>
                );
              })()}
              {alerts.length > 0 && <ResumenAlerts alerts={alerts} />}
              {unmatchedItems.length > 0 && (
                <div className="flex gap-3 rounded-lg border-2 border-red-600 bg-red-100 dark:border-red-500 dark:bg-red-950/60 p-3">
                  <TriangleAlert className="h-6 w-6 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                  <div className="text-sm text-red-800 dark:text-red-300">
                    <p className="font-bold text-red-900 dark:text-red-200">
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
                <ProposalTable
                  items={proposals}
                  onToggle={handleToggle}
                  onEdit={handleEdit}
                  onChoosePuesta={handleChoosePuesta}
                />
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
              <Button onClick={() => handleAnalyze("gemini")} disabled={!file || analyzing}>
                {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
                {analyzing ? "Analizando…" : "Analizar Documento"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => { setProposals(null); setAlerts([]); }}
                disabled={confirming}
              >
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
