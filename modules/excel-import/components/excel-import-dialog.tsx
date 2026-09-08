"use client";

import { useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { DateRange } from "react-day-picker";
import {
  FileUp, FileSpreadsheet, Loader2, ScanSearch, X, ArrowLeft, CheckCircle2, TriangleAlert,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/utils/format";
import { analyzeExcelAction, updateExcelWatermarkAction } from "@/lib/actions/excel-import";
import { confirmSalidasAction, confirmSalidasNormalesAction } from "@/lib/actions/pdf-import";
import {
  aplicarRebasesDelTramo,
  buildSplitProposal,
  idsParaQuitarPartida,
} from "@/services/pdf-import.service";
import type {
  PdfConfirmItem,
  PdfConfirmNormalItem,
  PuestaMatchRef,
} from "@/validations/pdf-import.schema";
import type { ExcelSourceInfo } from "@/validations/excel-import.schema";
import { ProposalTable, type EditableProposal } from "@/modules/pdf-import/components/proposal-table";

interface ExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_MB = 10;

/** "2026-08-17" (local, sin desfase de huso) → Date de medianoche local, solo para el <Calendar>. */
function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function localDateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ExcelImportDialog({ open, onOpenChange }: ExcelImportDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [proposals, setProposals] = useState<EditableProposal[] | null>(null);
  const [sourceInfo, setSourceInfo] = useState<ExcelSourceInfo | null>(null);
  const [fechaMin, setFechaMin] = useState<string | null>(null);
  const [fechaMax, setFechaMax] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  function reset() {
    setFile(null);
    setIsDragging(false);
    setUploadError(null);
    setAnalyzing(false);
    setConfirming(false);
    setProposals(null);
    setSourceInfo(null);
    setFechaMin(null);
    setFechaMax(null);
    setParseWarnings([]);
    setRange(undefined);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  // ── Validación y selección de archivo ────────────────────
  const validateAndSet = useCallback((candidate: File | undefined) => {
    setUploadError(null);
    if (!candidate) return;
    const isExcel = /\.(xlsx|xls)$/i.test(candidate.name);
    if (!isExcel) {
      setUploadError("El archivo no es un Excel. Solo se admiten .xlsx / .xls.");
      return;
    }
    if (candidate.size > MAX_MB * 1024 * 1024) {
      setUploadError(`El Excel supera el tamaño máximo (${MAX_MB} MB).`);
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
  async function handleAnalyze() {
    if (!file) return;
    setAnalyzing(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await analyzeExcelAction(formData);
      if (res.error || !res.data) {
        setUploadError(res.error ?? "No se pudo analizar el Excel.");
        return;
      }
      const editable: EditableProposal[] = res.data.proposals.map((p) => ({
        ...p,
        // Nunca se preselecciona lo que exige criterio humano: una fila que
        // rebasa la puesta va en rojo y sin marcar, aunque el cruce con la
        // puesta sea de confianza alta. (Antes se colaba marcada: el aviso
        // salía, pero la casilla venía puesta.)
        selected:
          p.rebase || p.duplicado
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
      setSourceInfo(res.data.sourceInfo);
      setFechaMin(res.data.fechaMin);
      setFechaMax(res.data.fechaMax);
      setParseWarnings(res.data.parseWarnings);
      const desde = res.data.suggestedFechaDesde ?? res.data.fechaMin;
      const hasta = res.data.fechaMax;
      setRange(
        desde && hasta ? { from: isoToLocalDate(desde), to: isoToLocalDate(hasta) } : undefined
      );
    } catch (err) {
      setUploadError(`Error inesperado: ${(err as Error).message}`);
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Rango de fechas elegido, en ISO ──────────────────────
  const rangoISO = useMemo(() => {
    const desde = range?.from ? localDateToISO(range.from) : null;
    const hasta = range?.to ? localDateToISO(range.to) : desde;
    return { desde, hasta };
  }, [range]);

  /**
   * Propuestas con el aviso de rebase al día para el rango elegido.
   *
   * El rango NO es solo un filtro visual: manda en la cuenta del rebase. El
   * Excel es el registro acumulativo del barco entero y las filas de días ya
   * importados están grabadas, con su consumo ya restado del pendiente de la
   * puesta. Contarlas otra vez daba avisos de rebase de cientos de toneladas
   * sobre puestas que ni se acercaban a agotarse.
   *
   * Se calcula en un memo, y no en cada handler, porque depende de tres cosas a
   * la vez —el rango, las cantidades editadas y la puesta elegida— y así
   * ninguna de ellas puede olvidarse de recalcular.
   */
  const proposalsConRebase = useMemo(() => {
    if (!proposals) return null;
    const copia = proposals.map((it) => ({ ...it, warnings: [...it.warnings] }));
    aplicarRebasesDelTramo(copia, rangoISO.desde, rangoISO.hasta);
    return copia;
  }, [proposals, rangoISO]);

  // ── Filtro de fechas (visual: no hace falta re-analizar) ──
  const visibleProposals = useMemo(() => {
    if (!proposalsConRebase) return [];
    const { desde, hasta } = rangoISO;
    if (!desde) return proposalsConRebase;
    return proposalsConRebase.filter(
      (p) => p.line.fecha >= desde && (!hasta || p.line.fecha <= hasta)
    );
  }, [proposalsConRebase, rangoISO]);

  // ── Edición de la tabla (por id estable, no por índice: la tabla
  //    puede mostrar un subconjunto filtrado por fecha) ──────────
  function updateItemById(id: string, patch: Partial<EditableProposal>) {
    setProposals((prev) =>
      prev ? prev.map((it) => (it.id === id ? { ...it, ...patch } : it)) : prev
    );
  }

  function handleToggle(index: number, selected: boolean) {
    updateItemById(visibleProposals[index].id, { selected });
  }

  function handleEdit(index: number, field: "fecha" | "matricula" | "cantidad", value: string | number) {
    const item = visibleProposals[index];
    updateItemById(item.id, { edited: { ...item.edited, [field]: value } });
  }

  function handleChoosePuesta(index: number, puestaId: string) {
    updateItemById(visibleProposals[index].id, { chosenPuestaId: puestaId });
  }

  /**
   * "Partir": inserta una fila idéntica justo debajo de la original, apuntando
   * a otra puesta del mismo cliente por defecto. Se inserta en `proposals`
   * (el estado real, no `visibleProposals`, que es una copia derivada con el
   * rebase recalculado en el memo de más arriba) para que ese memo la recoja
   * sola en el siguiente render.
   */
  const splitCounterRef = useRef(0);
  function handleSplit(index: number) {
    const original = visibleProposals[index];
    splitCounterRef.current += 1;
    const nueva = buildSplitProposal(original, `${original.id}::split-${splitCounterRef.current}`);
    setProposals((prev) => {
      if (!prev) return prev;
      const i = prev.findIndex((p) => p.id === original.id);
      if (i < 0) return prev;
      const copia = [...prev];
      copia.splice(i + 1, 0, nueva);
      return copia;
    });
  }

  /**
   * Quita una fila generada por "Partir". La fila original nunca se toca
   * aquí. Si a su vez se había partido ESA fila (partir dos veces), sus
   * propias particiones se van con ella — ver idsParaQuitarPartida.
   */
  function handleRemoveSplit(index: number) {
    const item = visibleProposals[index];
    setProposals((prev) => {
      if (!prev) return prev;
      const aQuitar = idsParaQuitarPartida(prev, item.id);
      return prev.filter((p) => !aQuitar.has(p.id));
    });
  }

  // ── Confirmar ────────────────────────────────────────────
  function resolveRef(item: EditableProposal): PuestaMatchRef | null {
    const all = [item.match, ...item.candidates].filter(Boolean) as PuestaMatchRef[];
    return all.find((r) => r.puesta_id === item.chosenPuestaId) ?? item.match;
  }

  function traceComment(p: EditableProposal): string[] {
    const parts: string[] = [];
    if (p.line.ticket) parts.push(`Albarán ${p.line.ticket}`);
    if (p.line.cantidad_origen != null) {
      parts.push(
        `${formatNumber(p.line.cantidad_origen)} ${p.line.unidad_origen ?? ""} en el Excel`.trim()
      );
    }
    // Deja constancia en el propio movimiento de que esta fila es la mitad
    // (o el tercio, etc.) de un camión que se repartió entre varias puestas.
    if (p.partidaDeId) parts.push("Partida de otra línea del mismo documento");
    return parts;
  }

  function isSelectedAndValid(p: EditableProposal): boolean {
    if (!p.selected) return false;
    if (p.tipo === "normal") return !!(p.resolvedWarehouseId && p.resolvedProductId);
    return !!resolveRef(p);
  }

  async function handleConfirm() {
    if (!proposals) return;
    const selected = visibleProposals.filter(isSelectedAndValid);
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
          comentarios: [`Importada desde Excel (puesta ${ref.numero_contrato})`, ...traceComment(p)].join(
            " · "
          ),
        };
      });

    const normalItems: PdfConfirmNormalItem[] = selected
      .filter((p) => p.tipo === "normal")
      .map((p) => ({
        warehouse_id: p.resolvedWarehouseId!,
        product_id: p.resolvedProductId!,
        fecha_salida: p.edited.fecha,
        matricula: p.edited.matricula,
        cantidad: p.edited.cantidad,
        comentarios: traceComment(p).length > 0 ? traceComment(p).join(" · ") : null,
        origen: "Excel",
      }));

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

      const puestaResults = puestaRes.data ?? [];
      const normalResults = normalRes.data ?? [];
      const allResults = [...puestaResults, ...normalResults];
      const okCount = allResults.filter((r) => r.ok).length;
      const failCount = allResults.length - okCount;

      // Watermark: última fecha entre las filas que sí se grabaron.
      const fechasOk = [
        ...puestaItems.filter((_, i) => puestaResults[i]?.ok).map((it) => it.fecha_salida),
        ...normalItems.filter((_, i) => normalResults[i]?.ok).map((it) => it.fecha_salida),
      ];
      if (fechasOk.length > 0 && sourceInfo?.resolvedWarehouseId && sourceInfo?.resolvedProductId) {
        const maxFecha = fechasOk.reduce((a, b) => (b > a ? b : a));
        await updateExcelWatermarkAction({
          warehouseId: sourceInfo.resolvedWarehouseId,
          productId: sourceInfo.resolvedProductId,
          fecha: maxFecha,
        });
      }

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

  const selectedCount = visibleProposals.filter(isSelectedAndValid).length;
  const showResults = proposals !== null;
  const almacenSinResolver = showResults && !sourceInfo?.resolvedWarehouseId;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          showResults ? "sm:max-w-[92vw]" : "sm:max-w-[480px]",
          // Cabecera y pie FIJOS, y una única zona central con scroll — igual
          // que en el diálogo de PDF (mismo bug, mismo motivo: sin tope de
          // altura, muchos avisos hacían crecer el diálogo fuera de la
          // ventana por arriba y por abajo a la vez, sin forma de llegar al
          // botón "Confirmar".
          "flex max-h-[90vh] flex-col overflow-hidden"
        )}
        // Un clic fuera (en el overlay) YA NO cierra el diálogo, por el mismo
        // motivo que en el de PDF: con una tabla grande y filas marcadas a
        // mano, un cierre accidental tira toda la revisión. Solo se cierra
        // desde dentro (aspa, "Volver" o al confirmar). Esc sigue funcionando.
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-brand-500" />
            {showResults ? "Propuesta de salidas" : "Subir Salidas Puerto (Excel)"}
          </DialogTitle>
          <DialogDescription>
            {showResults
              ? "Revisa, ajusta y selecciona las salidas que quieras grabar. Nada se guarda hasta que confirmes."
              : "Arrastra el Excel de salidas del puerto o búscalo en tu equipo, y pulsa Analizar."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
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
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => validateAndSet(e.target.files?.[0] ?? undefined)}
              />
              {file ? (
                <>
                  <FileSpreadsheet className="h-9 w-9 text-brand-500" />
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
                  <p className="text-sm font-medium">Arrastra el Excel aquí</p>
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

        {/* ── Vista de propuestas ── */}
        {showResults && proposals && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="text-sm">
                <span className="font-medium">
                  {sourceInfo?.almacenDetectado ?? "Almacén no identificado"}
                </span>
                {sourceInfo?.productoDetectado && <span className="text-muted-foreground"> · {sourceInfo.productoDetectado}</span>}
                {sourceInfo?.barco && <span className="text-muted-foreground"> · {sourceInfo.barco}</span>}
                {fechaMin && fechaMax && (
                  <div className="text-xs text-muted-foreground">
                    Filas de {fechaMin} a {fechaMax} — se proponen por defecto las de dentro del rango elegido.
                  </div>
                )}
              </div>
              <DateRangePicker value={range} onChange={setRange} placeholder="Rango de fechas" />
            </div>

            {almacenSinResolver && (
              <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/40 p-3">
                <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  No se ha podido identificar el almacén de este Excel en el sistema (o coincide con
                  varios). No se recordará la fecha importada para la próxima vez; revisa cada fila
                  antes de confirmar.
                </p>
              </div>
            )}

            {parseWarnings.length > 0 && (
              <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/40 p-3">
                <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-300">
                  {parseWarnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              </div>
            )}

            {/* Antes esta tabla tenía su propio "max-h-[60vh] overflow-auto"
                independiente del resto del diálogo: con muchos avisos por
                encima (rango con muchos rebases, etc.), quedaban DOS scrolls
                anidados sin límite conjunto y el diálogo crecía igualmente
                más allá de la ventana. Ahora fluye en el único scroll de
                arriba. */}
            <ProposalTable
              items={visibleProposals}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onChoosePuesta={handleChoosePuesta}
              onSplit={handleSplit}
              onRemoveSplit={handleRemoveSplit}
            />
          </div>
        )}
        </div>

        <DialogFooter className="shrink-0">
          {!showResults ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={analyzing}>
                Cancelar
              </Button>
              <Button onClick={handleAnalyze} disabled={!file || analyzing}>
                {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
                {analyzing ? "Analizando…" : "Analizar Excel"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setProposals(null); setSourceInfo(null); }} disabled={confirming}>
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
