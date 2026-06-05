"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  FileUp, FileText, Loader2, ScanSearch, X, ArrowLeft, CheckCircle2,
  AlertTriangle, ChevronsUpDown, Check, Search, Info, Database, Trash2, Clock,
} from "lucide-react";
import { addDays, parseISO } from "date-fns";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDate } from "@/utils/format";
import {
  analyzePuestaPdfAction,
  analyzePuestaFromStorageAction,
  listPuestaPdfsAction,
  confirmPuestaPdfAction,
  movePuestaPdfAction,
  type AnalyzePuestaResult,
  type PuestaPdfFolder,
} from "@/lib/actions/pdf-puestas";
import type { PuestaProposalState } from "@/validations/pdf-puestas.schema";

interface PdfPuestasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si es true, al abrirse arranca directamente "Leer PDFs de Base de Datos". */
  autoLoad?: boolean;
}

const MAX_MB = 15;

const STATE_META: Record<
  PuestaProposalState,
  { label: string; variant: "success" | "warning" | "destructive"; icon: typeof CheckCircle2 }
> = {
  listo: { label: "Listo", variant: "success", icon: CheckCircle2 },
  dudoso: { label: "Revisar", variant: "warning", icon: AlertTriangle },
  error: { label: "Con errores", variant: "destructive", icon: X },
};

interface EditableState {
  numero_contrato: string;
  warehouse_id: string;
  product_id: string;
  customer_id: string;
  cantidad_inicial: number | null;
  fecha_puesta: string;
  dias_plancha: number | null;
  comentarios: string;
}

export function PdfPuestasDialog({ open, onOpenChange, autoLoad = false }: PdfPuestasDialogProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const autoLoadTriggered = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [result, setResult] = useState<AnalyzePuestaResult | null>(null);
  const [editable, setEditable] = useState<EditableState | null>(null);

  // Cola de PDFs leídos desde Storage
  const [queue, setQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(false);

  // Combobox de cliente
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

  const queueMode = queue.length > 0;

  // ── Reset ────────────────────────────────────────────────
  function reset() {
    setFile(null);
    setIsDragging(false);
    setUploadError(null);
    setAnalyzing(false);
    setConfirming(false);
    setMoving(false);
    setResult(null);
    setEditable(null);
    setQueue([]);
    setQueueIndex(0);
    setQueueError(null);
    setLoadingQueue(false);
    setCustomerSearch("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  // ── Volcar una propuesta del servidor al estado editable ──
  function applyResult(data: AnalyzePuestaResult) {
    const p = data.proposal;
    setResult(data);
    setEditable({
      numero_contrato: p.numero_contrato ?? "",
      warehouse_id: p.warehouse.match?.id ?? "",
      product_id: p.product.match?.id ?? "",
      customer_id: p.customer.match?.id ?? "",
      cantidad_inicial: p.cantidad_inicial,
      fecha_puesta: p.fecha_puesta ?? new Date().toISOString().split("T")[0],
      dias_plancha: p.dias_plancha,
      comentarios: p.comentarios ?? "",
    });
  }

  // ── Selección de archivo ─────────────────────────────────
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

  // ── Analizar archivo subido ──────────────────────────────
  async function handleAnalyze() {
    if (!file) return;
    setAnalyzing(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await analyzePuestaPdfAction(formData);
      if (res.error || !res.data) {
        setUploadError(res.error ?? "No se pudo analizar el documento.");
        return;
      }
      applyResult(res.data);
    } catch (err) {
      setUploadError(`Error inesperado: ${(err as Error).message}`);
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Leer PDFs desde la base de datos (Storage) ───────────
  async function handleLoadFromDb() {
    setLoadingQueue(true);
    setUploadError(null);
    try {
      const res = await listPuestaPdfsAction();
      if (res.error) {
        setUploadError(res.error);
        return;
      }
      if (!res.files || res.files.length === 0) {
        setUploadError("No hay PDFs en la base de datos (bucket «ptas-disposicion»).");
        return;
      }
      setQueue(res.files);
      setQueueIndex(0);
      void analyzeFromStorage(res.files[0]);
    } catch (err) {
      setUploadError(`Error inesperado: ${(err as Error).message}`);
    } finally {
      setLoadingQueue(false);
    }
  }

  // Si se abre por el aviso del Dashboard (autoLoad), arrancar la lectura
  // desde Storage una sola vez por apertura.
  useEffect(() => {
    if (!open) {
      autoLoadTriggered.current = false;
      return;
    }
    if (autoLoad && !autoLoadTriggered.current) {
      autoLoadTriggered.current = true;
      void handleLoadFromDb();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoLoad]);

  // ── Analizar un PDF concreto del bucket ──────────────────
  async function analyzeFromStorage(name: string) {
    setAnalyzing(true);
    setQueueError(null);
    setResult(null);
    setEditable(null);
    try {
      const res = await analyzePuestaFromStorageAction(name);
      if (res.error || !res.data) {
        setQueueError(res.error ?? "No se pudo analizar el documento.");
        return;
      }
      applyResult(res.data);
    } catch (err) {
      setQueueError(`Error inesperado: ${(err as Error).message}`);
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Avanzar en la cola (o terminar) ──────────────────────
  function advanceQueue() {
    if (queueIndex < queue.length - 1) {
      const next = queueIndex + 1;
      setQueueIndex(next);
      void analyzeFromStorage(queue[next]);
    } else {
      // Fin de la cola: recargar para refrescar el dashboard.
      window.location.reload();
    }
  }

  // Mueve el PDF actual a una carpeta del bucket y avanza. Si el mover
  // falla, avisa pero continúa (no bloquea la cola).
  async function moveCurrentTo(folder: PuestaPdfFolder) {
    if (currentName) {
      const mv = await movePuestaPdfAction(currentName, folder);
      if (mv.error) {
        toast({
          variant: "destructive",
          title: "No se pudo mover el PDF",
          description: mv.error,
        });
      }
    }
    advanceQueue();
  }

  // Botones "Descartar" / "Dejar Pte": mueven sin crear puesta.
  async function handleMoveOnly(folder: PuestaPdfFolder) {
    setMoving(true);
    try {
      await moveCurrentTo(folder);
    } finally {
      setMoving(false);
    }
  }

  function patch(p: Partial<EditableState>) {
    setEditable((prev) => (prev ? { ...prev, ...p } : prev));
  }

  // ── Validez y confirmación ───────────────────────────────
  const canConfirm =
    !!editable &&
    !!editable.warehouse_id &&
    !!editable.product_id &&
    (editable.cantidad_inicial ?? 0) > 0 &&
    !!editable.fecha_puesta &&
    editable.dias_plancha !== null &&
    editable.dias_plancha >= 0;

  async function handleConfirm() {
    if (!editable || !canConfirm) {
      toast({
        variant: "destructive",
        title: "Faltan datos",
        description: "Completa almacén, producto, cantidad, fecha y días de plancha.",
      });
      return;
    }
    setConfirming(true);
    try {
      const res = await confirmPuestaPdfAction({
        numero_contrato: editable.numero_contrato || null,
        customer_id: editable.customer_id || null,
        product_id: editable.product_id,
        warehouse_id: editable.warehouse_id,
        cantidad_inicial: editable.cantidad_inicial!,
        fecha_puesta: editable.fecha_puesta,
        dias_plancha: editable.dias_plancha!,
        comentarios: editable.comentarios || null,
      });
      if (res.error) {
        toast({ variant: "destructive", title: "Error al crear", description: res.error });
        return;
      }
      toast({ title: "Puesta creada", description: "La puesta a disposición se ha registrado." });
      if (queueMode) {
        // Solo tras crear la puesta movemos el PDF a "procesados", y avanzamos.
        await moveCurrentTo("procesados");
      } else {
        // El dashboard carga datos en cliente; recargamos para reflejarlo.
        window.location.reload();
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Error inesperado", description: (err as Error).message });
    } finally {
      setConfirming(false);
    }
  }

  const showProposal = result !== null && editable !== null;
  const proposal = result?.proposal;
  const masters = result?.masters;
  const isLastInQueue = queueIndex >= queue.length - 1;
  const currentName = queueMode ? queue[queueIndex] : null;
  const fromPendientes = !!currentName?.startsWith("pendientes/");

  // Fin de plancha calculado para mostrar
  let finPlancha: string | null = null;
  if (editable?.fecha_puesta && editable.dias_plancha !== null && editable.dias_plancha >= 0) {
    try {
      finPlancha = addDays(parseISO(editable.fecha_puesta), editable.dias_plancha)
        .toISOString()
        .split("T")[0];
    } catch {
      finPlancha = null;
    }
  }

  const selectedCustomer = masters?.customers.find((c) => c.id === editable?.customer_id);
  const filteredCustomers = (masters?.customers ?? []).filter((c) =>
    c.label.toLowerCase().includes(customerSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(showProposal ? "sm:max-w-2xl" : "sm:max-w-[480px]", "max-h-[90vh] overflow-y-auto")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-amber-500" />
            {showProposal ? "Propuesta de puesta a disposición" : "Subir Pta a Disposición (PDF)"}
          </DialogTitle>
          <DialogDescription>
            {showProposal
              ? "Revisa y ajusta los datos detectados. Nada se guarda hasta que confirmes."
              : "Arrastra el PDF de la aplicación, búscalo en tu equipo, o léelos desde la base de datos."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Vista de carga (subida manual) ── */}
        {!showProposal && !queueMode && (
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
                  ? "border-amber-500 bg-amber-500/5"
                  : "border-muted-foreground/25 hover:border-amber-500/50 hover:bg-muted/40"
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
                  <FileText className="h-9 w-9 text-amber-500" />
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

            {/* Separador + botón leer desde la base de datos */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">o</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleLoadFromDb}
              disabled={loadingQueue}
            >
              {loadingQueue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              {loadingQueue ? "Buscando PDFs…" : "Leer PDFs de Base de Datos"}
            </Button>

            {uploadError && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <X className="h-4 w-4" /> {uploadError}
              </p>
            )}
          </div>
        )}

        {/* ── Cola: analizando o error de un PDF ── */}
        {!showProposal && queueMode && (
          <div className="py-8 text-center space-y-3">
            <p className="text-xs text-muted-foreground">
              PDF {queueIndex + 1} de {queue.length}
              {currentName ? <> · <span className="font-mono">{currentName}</span></> : null}
              {fromPendientes ? <span className="ml-1 text-amber-600">(de Pendientes)</span> : null}
            </p>
            {analyzing ? (
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                Analizando documento…
              </div>
            ) : queueError ? (
              <div className="flex flex-col items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-6 w-6" />
                <span>{queueError}</span>
              </div>
            ) : null}
          </div>
        )}

        {/* ── Vista de propuesta ── */}
        {showProposal && editable && proposal && masters && (
          <div className="space-y-4">
            {/* Cabecera de cola */}
            {queueMode && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                PDF {queueIndex + 1} de {queue.length}
                {currentName ? <> · <span className="font-mono">{currentName}</span></> : null}
                {fromPendientes ? <span className="ml-1 font-semibold">(de Pendientes)</span> : null}
              </div>
            )}

            {/* Estado + datos crudos del PDF */}
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">PDF:</span>{" "}
                {[proposal.extraction.transitario, proposal.extraction.puerto].filter(Boolean).join(" + ") || "—"} ·{" "}
                {proposal.extraction.producto ?? "—"} · {proposal.extraction.cliente ?? "—"}
              </div>
              {(() => {
                const meta = STATE_META[proposal.state];
                const Icon = meta.icon;
                return (
                  <Badge variant={meta.variant} className="gap-1 shrink-0">
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </Badge>
                );
              })()}
            </div>

            {/* Nº contrato */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nº de contrato / aplicación</label>
              <Input
                value={editable.numero_contrato}
                onChange={(e) => patch({ numero_contrato: e.target.value })}
                placeholder="D02600777_10-1"
              />
            </div>

            {/* Cliente (combobox buscable) */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Cliente</label>
              <div className="flex gap-2">
                <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      type="button"
                      className={cn("flex-1 justify-between font-normal", !selectedCustomer && "text-muted-foreground")}
                    >
                      <span className="truncate">{selectedCustomer?.label ?? "Sin cliente asignado"}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[420px] p-0" align="start">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-8 h-8 text-sm"
                          placeholder="Buscar cliente..."
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                    </div>
                    <ScrollArea className="max-h-56">
                      <div className="p-1">
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent text-muted-foreground"
                          onClick={() => { patch({ customer_id: "" }); setCustomerPopoverOpen(false); setCustomerSearch(""); }}
                        >
                          Sin cliente asignado
                        </button>
                        {filteredCustomers.length === 0 ? (
                          <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                        ) : (
                          filteredCustomers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent flex items-center gap-2"
                              onClick={() => { patch({ customer_id: c.id }); setCustomerPopoverOpen(false); setCustomerSearch(""); }}
                            >
                              <Check className={cn("h-3.5 w-3.5 shrink-0", editable.customer_id === c.id ? "opacity-100" : "opacity-0")} />
                              <span className="flex-1 truncate">{c.label}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
                {editable.customer_id && (
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => patch({ customer_id: "" })}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Producto + Almacén */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Producto *</label>
                <Select value={editable.product_id} onValueChange={(v) => patch({ product_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {masters.products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Almacén *</label>
                <Select value={editable.warehouse_id} onValueChange={(v) => patch({ warehouse_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {masters.warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cantidad + Fecha */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Cantidad inicial *</label>
                <DecimalInput
                  value={editable.cantidad_inicial}
                  onChange={(n) => patch({ cantidad_inicial: n })}
                  placeholder="0,000"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Fecha de puesta *</label>
                <Input
                  type="date"
                  value={editable.fecha_puesta}
                  onChange={(e) => patch({ fecha_puesta: e.target.value })}
                />
              </div>
            </div>

            {/* Días de plancha */}
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1">
                Días de plancha *
                <Tooltip>
                  <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Calculado a partir de la fecha de plancha del PDF (fecha plancha − fecha aplicación).
                    Puedes ajustarlo.
                  </TooltipContent>
                </Tooltip>
              </label>
              <Input
                type="number"
                min="0"
                max="365"
                step="1"
                value={editable.dias_plancha ?? ""}
                onChange={(e) => patch({ dias_plancha: e.target.value === "" ? null : parseInt(e.target.value) })}
              />
              {finPlancha && (
                <p className="text-xs text-muted-foreground mt-1">
                  Fin de plancha: <strong>{formatDate(finPlancha)}</strong> — el coste empieza el{" "}
                  <strong>{formatDate(addDays(parseISO(finPlancha), 1).toISOString().split("T")[0])}</strong>
                </p>
              )}
            </div>

            {/* Comentarios */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Comentarios</label>
              <Textarea
                rows={2}
                value={editable.comentarios}
                onChange={(e) => patch({ comentarios: e.target.value })}
              />
            </div>

            {/* Avisos / errores */}
            {(proposal.errors.length > 0 || proposal.warnings.length > 0) && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                {proposal.errors.map((err, i) => (
                  <div key={`e-${i}`} className="flex items-start gap-2 text-xs text-destructive">
                    <X className="h-3.5 w-3.5 shrink-0 mt-0.5" /> <span>{err}</span>
                  </div>
                ))}
                {proposal.warnings.map((w, i) => (
                  <div key={`w-${i}`} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!showProposal && !queueMode ? (
            // Subida manual
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={analyzing || loadingQueue}>
                Cancelar
              </Button>
              <Button onClick={handleAnalyze} disabled={!file || analyzing || loadingQueue}>
                {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
                {analyzing ? "Analizando…" : "Analizar Documento"}
              </Button>
            </>
          ) : !showProposal && queueMode ? (
            // Cola: analizando o con error
            queueError ? (
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => handleMoveOnly("descartadas")} disabled={moving}>
                    <Trash2 className="mr-2 h-4 w-4" /> Descartar
                  </Button>
                  <Button variant="outline" onClick={() => handleMoveOnly("pendientes")} disabled={moving}>
                    <Clock className="mr-2 h-4 w-4" /> Dejar Pte
                  </Button>
                </div>
                <Button variant="ghost" onClick={reset} disabled={moving}>Cancelar</Button>
              </div>
            ) : (
              <Button variant="outline" onClick={reset} disabled={analyzing}>
                Cancelar
              </Button>
            )
          ) : queueMode ? (
            // Propuesta dentro de una cola: Descartar / Dejar Pte / Crear
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleMoveOnly("descartadas")} disabled={confirming || moving}>
                  <Trash2 className="mr-2 h-4 w-4" /> Descartar
                </Button>
                <Button variant="outline" onClick={() => handleMoveOnly("pendientes")} disabled={confirming || moving}>
                  <Clock className="mr-2 h-4 w-4" /> Dejar Pte
                </Button>
              </div>
              <Button onClick={handleConfirm} disabled={confirming || moving || !canConfirm}>
                {confirming || moving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                {confirming
                  ? "Creando…"
                  : isLastInQueue ? "Crear y finalizar" : "Crear y siguiente"}
              </Button>
            </div>
          ) : (
            // Propuesta de subida manual
            <>
              <Button variant="outline" onClick={reset} disabled={confirming}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Volver
              </Button>
              <Button onClick={handleConfirm} disabled={confirming || !canConfirm}>
                {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                {confirming ? "Creando…" : "Crear puesta"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
