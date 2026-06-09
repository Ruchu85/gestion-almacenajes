"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileUp, FileText, Loader2, ScanSearch, X, ArrowLeft, CheckCircle2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { analyzePdfAction, confirmSalidasAction, confirmSalidasNormalesAction } from "@/lib/actions/pdf-import";
import type { PdfConfirmItem, PdfConfirmNormalItem, PuestaMatchRef } from "@/validations/pdf-import.schema";
import { ProposalTable, type EditableProposal } from "./proposal-table";

interface PdfImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_MB = 15;

export function PdfImportDialog({ open, onOpenChange }: PdfImportDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [proposals, setProposals] = useState<EditableProposal[] | null>(null);

  // ── Reset al cerrar ──────────────────────────────────────
  function reset() {
    setFile(null);
    setIsDragging(false);
    setUploadError(null);
    setAnalyzing(false);
    setConfirming(false);
    setProposals(null);
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
  async function handleAnalyze() {
    if (!file) return;
    setAnalyzing(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await analyzePdfAction(formData);
      if (res.error || !res.data) {
        setUploadError(res.error ?? "No se pudo analizar el documento.");
        return;
      }
      const editable: EditableProposal[] = res.data.map((p) => ({
        ...p,
        selected: p.confidence === "alta",
        chosenPuestaId: p.match?.puesta_id ?? null,
        edited: {
          fecha: p.line.fecha,
          matricula: p.line.matricula.toUpperCase(),
          cantidad: p.line.cantidad,
        },
      }));
      setProposals(editable);
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

  function handleEdit(index: number, field: "fecha" | "matricula" | "cantidad", value: string | number) {
    setProposals((prev) =>
      prev
        ? prev.map((it, i) =>
            i === index ? { ...it, edited: { ...it.edited, [field]: value } } : it
          )
        : prev
    );
  }

  function handleChoosePuesta(index: number, puestaId: string) {
    updateItem(index, { chosenPuestaId: puestaId });
  }

  // ── Confirmar ────────────────────────────────────────────
  function resolveRef(item: EditableProposal): PuestaMatchRef | null {
    const all = [item.match, ...item.candidates].filter(Boolean) as PuestaMatchRef[];
    return all.find((r) => r.puesta_id === item.chosenPuestaId) ?? item.match;
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
          comentarios: `Importada desde PDF (puesta ${ref.numero_contrato})`,
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
        comentarios: null,
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
      <DialogContent className={cn(showResults ? "sm:max-w-5xl" : "sm:max-w-[480px]")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-sky-500" />
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
                  ? "border-sky-500 bg-sky-500/5"
                  : "border-muted-foreground/25 hover:border-sky-500/50 hover:bg-muted/40"
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
                  <FileText className="h-9 w-9 text-sky-500" />
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
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <X className="h-4 w-4" /> {uploadError}
              </p>
            )}
          </div>
        )}

        {/* ── Vista de propuestas ── */}
        {showResults && proposals && (
          <div className="max-h-[60vh] overflow-auto">
            <ProposalTable
              items={proposals}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onChoosePuesta={handleChoosePuesta}
            />
          </div>
        )}

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
              <Button variant="outline" onClick={() => setProposals(null)} disabled={confirming}>
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
