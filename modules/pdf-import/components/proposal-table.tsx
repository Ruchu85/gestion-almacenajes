"use client";

import {
  AlertTriangle, ArrowRightLeft, CheckCircle2, HelpCircle, Scissors, Trash2, Undo2, XCircle,
} from "lucide-react";
import type { PdfProposalItem, MatchConfidence } from "@/validations/pdf-import.schema";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNumber } from "@/utils/format";
import { cn } from "@/lib/utils";

/** Modelo editable de una propuesta (estado vivo en el diálogo). */
export interface EditableProposal extends PdfProposalItem {
  selected: boolean;
  chosenPuestaId: string | null;
  edited: {
    fecha: string;
    matricula: string;
    cantidad: number;
  };
  /**
   * Id de la fila de la que esta se partió (ver "Partir" más abajo y
   * `buildSplitProposal` en `services/pdf-import.service.ts`). Solo la llevan
   * las filas generadas por ese botón — las que vienen del documento no la
   * tienen. Sirve para (1) marcarla visualmente distinta y (2) permitir
   * borrarla: una fila del documento no se borra, solo se desmarca, pero una
   * fila partida sí, porque no representa nada que el documento trajera.
   */
  partidaDeId?: string | null;
}

interface ProposalTableProps {
  items: EditableProposal[];
  onToggle: (index: number, selected: boolean) => void;
  onEdit: (index: number, field: "fecha" | "matricula" | "cantidad", value: string | number) => void;
  onChoosePuesta: (index: number, puestaId: string) => void;
  /**
   * "Partir": genera una fila idéntica a la de `index`, para repartir la
   * cantidad de ese camión entre dos puestas del mismo cliente (p. ej.
   * cuando rebasa la puesta propuesta y el resto cabe en otra).
   */
  onSplit: (index: number) => void;
  /** Quita una fila generada por "Partir". No aplica a filas del documento. */
  onRemoveSplit: (index: number) => void;
}

const CONFIDENCE_META: Record<
  MatchConfidence,
  { label: string; variant: "success" | "warning" | "destructive"; icon: typeof CheckCircle2 }
> = {
  alta: { label: "Alta", variant: "success", icon: CheckCircle2 },
  media: { label: "Revisar", variant: "warning", icon: HelpCircle },
  nula: { label: "Sin match", variant: "destructive", icon: XCircle },
};

/**
 * Campana de avisos de una fila. Los mensajes viven aquí, junto a la línea que
 * los provoca, en vez de en una lista al final de la tabla: así se ve de un
 * vistazo qué filas tienen algo que mirar, y el detalle se abre al pulsar.
 */
type TonoAviso = "rojo" | "violeta" | "ambar";

const TONO_AVISO: Record<TonoAviso, { boton: string; contador: string; texto: string }> = {
  rojo: {
    boton: "bg-red-500 text-white hover:bg-red-600 ring-4 ring-red-500/40 animate-pulse",
    contador: "bg-red-700",
    texto: "text-red-700 dark:text-red-300",
  },
  violeta: {
    boton: "bg-violet-500 text-white hover:bg-violet-600 ring-4 ring-violet-500/40",
    contador: "bg-violet-700",
    texto: "text-violet-700 dark:text-violet-300",
  },
  ambar: {
    boton: "bg-amber-500 text-white hover:bg-amber-600 ring-2 ring-amber-500/40",
    contador: "bg-amber-700",
    texto: "text-amber-800 dark:text-amber-300",
  },
};

function RowWarnings({
  warnings,
  tono,
  numero,
  matricula,
}: {
  warnings: string[];
  tono: TonoAviso;
  numero: number;
  matricula: string;
}) {
  if (warnings.length === 0) {
    return <span className="sr-only">Sin avisos</span>;
  }

  const estilo = TONO_AVISO[tono];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Ver ${warnings.length} aviso(s) de la fila ${numero}`}
          className={cn(
            "relative inline-flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-colors",
            estilo.boton
          )}
        >
          <AlertTriangle className="h-5 w-5" />
          {warnings.length > 1 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-background",
                estilo.contador
              )}
            >
              {warnings.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <p className="text-xs font-semibold mb-2">
          Fila {numero} · {matricula}
        </p>
        <ul className="space-y-2">
          {warnings.map((w, i) => (
            <li key={i} className={cn("flex gap-2 text-xs leading-snug font-medium", estilo.texto)}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function ProposalTable({
  items, onToggle, onEdit, onChoosePuesta, onSplit, onRemoveSplit,
}: ProposalTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead className="w-10 text-center">#</TableHead>
            <TableHead>Datos del PDF</TableHead>
            <TableHead>Puesta / Destino</TableHead>
            <TableHead className="w-[140px]">Fecha</TableHead>
            <TableHead className="w-[160px]">Matrícula</TableHead>
            <TableHead className="w-[130px]">Cantidad</TableHead>
            <TableHead className="w-[120px]">Tipo</TableHead>
            <TableHead className="w-14 text-center">Avisos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => {
            const isNormal = item.tipo === "normal";
            const hasMatch = !!item.match;
            /** Salida directa sin stock físico suficiente en el almacén resuelto. */
            const sinStock = isNormal && !!item.stockInsuficiente;
            const normalResolved =
              isNormal && !!(item.resolvedWarehouseId && item.resolvedProductId) && !sinStock;
            /** Devolución: el informe la trae en negativo (anula una retirada). */
            const esDevolucion = item.line.cantidad < 0;
            // Solo se puede grabar la devolución que anula una salida presente en
            // el mismo documento y que tiene puesta asignada: la suelta la ajusta
            // el usuario a mano.
            const devolucionGrabable =
              esDevolucion && !!item.devolucion?.tieneSalidaPositiva && hasMatch;
            const isSelectable = esDevolucion
              ? devolucionGrabable
              : isNormal
                ? normalResolved
                : hasMatch;
            const isEditable = isSelectable;

            const meta = CONFIDENCE_META[item.confidence];
            const ConfidenceIcon = meta.icon;
            const candidateList = item.candidates.length > 1 ? item.candidates : [];
            const activeRef =
              item.candidates.find((c) => c.puesta_id === item.chosenPuestaId) ?? item.match;

            const isDuplicate = item.warnings.some((w) =>
              w.includes("Ya existe una salida idéntica")
            );
            /** Las dos lecturas del PDF discrepan en la cantidad de esta fila. */
            const lecturaDudosa = !!item.verificacion && !item.verificacion.coincide;
            /** Al incluir este camión la puesta se queda con pendiente negativo. */
            const rebasa = !!item.rebase;
            const isClean = isSelectable && item.warnings.length === 0;
            /** Fila generada por "Partir" (no viene del documento). */
            const esPartida = !!item.partidaDeId;
            /** Nº de la fila de la que se partió, para el rótulo "Partida de fila N". */
            const origenNumero = item.partidaDeId
              ? items.findIndex((x) => x.id === item.partidaDeId) + 1
              : null;
            /**
             * "Partir" solo tiene sentido con una puesta ya identificada, y no
             * en una devolución: esa anula una retirada concreta del mismo
             * documento, no se reparte entre puestas.
             */
            const puedePartir = item.tipo === "puesta" && hasMatch && !esDevolucion;

            return (
              <TableRow
                key={item.id}
                className={cn(
                  !isSelectable && !esDevolucion && "bg-muted/60 opacity-70",
                  !isDuplicate && isClean && "bg-green-500/25 dark:bg-green-500/20",
                  // Partida: nunca en verde plano aunque no tenga ningún aviso
                  // — es una fila que el usuario acaba de generar a mano y
                  // tiene que revisar (puesta elegida, reparto de cantidad).
                  // El trazo discontinuo la distingue de los estados de error
                  // de abajo, que la pisan si además coinciden con alguno.
                  esPartida &&
                    "bg-brand-500/10 dark:bg-brand-500/15 outline outline-2 outline-dashed -outline-offset-2 outline-brand-500/50",
                  // Devolución que se puede grabar: color propio, para que no se
                  // confunda con un error.
                  esDevolucion && devolucionGrabable &&
                    "bg-violet-500/30 dark:bg-violet-500/25 outline outline-2 -outline-offset-2 outline-violet-500",
                  // Devolución suelta: hay que ajustarla a mano, va en rojo.
                  esDevolucion && !devolucionGrabable &&
                    "bg-red-500/30 dark:bg-red-500/25 outline outline-2 -outline-offset-2 outline-red-500",
                  // Sin stock físico para la salida directa: tampoco se puede grabar.
                  sinStock &&
                    "bg-red-500/30 dark:bg-red-500/25 outline outline-2 -outline-offset-2 outline-red-500/80",
                  // Rebase: la puesta se queda en negativo. Se graba solo si el
                  // usuario lo marca a conciencia, así que va en rojo.
                  rebasa &&
                    "bg-red-500/30 dark:bg-red-500/25 outline outline-2 -outline-offset-2 outline-red-500/80",
                  // Duplicado y cifra dudosa mandan sobre cualquier otro estado:
                  // son las dos cosas que el usuario no puede pasar por alto.
                  isDuplicate &&
                    "bg-red-500/30 dark:bg-red-500/25 outline outline-2 -outline-offset-2 outline-red-500/80",
                  lecturaDudosa &&
                    "bg-red-500/40 dark:bg-red-500/35 outline outline-[3px] -outline-offset-2 outline-red-500",
                )}
              >
                {/* Selección */}
                <TableCell>
                  <Checkbox
                    checked={item.selected}
                    disabled={!isSelectable}
                    onCheckedChange={(c) => onToggle(index, c === true)}
                    aria-label="Seleccionar fila"
                  />
                </TableCell>

                {/* Nº de fila, para poder referirse a ella en los avisos */}
                <TableCell className="text-center text-xs font-semibold tabular-nums text-muted-foreground">
                  {index + 1}
                </TableCell>

                {/* Datos crudos del PDF */}
                <TableCell>
                  {isNormal ? (
                    <>
                      <div className="font-medium leading-tight text-muted-foreground italic text-xs">
                        Sin destinatario en el PDF
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.line.almacen ? `${item.line.almacen} · ` : ""}
                        {item.line.producto ?? ""}
                        {item.line.numero_puesta ? ` · Ref. ${item.line.numero_puesta}` : ""}
                      </div>
                    </>
                  ) : (
                    <>
                      {esPartida && (
                        <div className="mb-0.5 inline-flex items-center gap-1 rounded bg-brand-500/15 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                          <Scissors className="h-2.5 w-2.5" />
                          Partida de fila {origenNumero}
                        </div>
                      )}
                      <div className="font-medium leading-tight">{item.line.cliente}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.line.numero_puesta ? `Nº ${item.line.numero_puesta}` : "Sin contrato"}
                        {item.line.producto ? ` · ${item.line.producto}` : ""}
                      </div>
                    </>
                  )}
                  {(item.line.ticket || item.line.remolque) && (
                    <div className="text-[11px] text-muted-foreground/80">
                      {item.line.ticket ? `Ticket ${item.line.ticket}` : ""}
                      {item.line.ticket && item.line.remolque ? " · " : ""}
                      {item.line.remolque ? `Remolque ${item.line.remolque}` : ""}
                    </div>
                  )}
                </TableCell>

                {/* Puesta encontrada / destino para salida normal */}
                <TableCell>
                  {isNormal ? (
                    normalResolved ? (
                      <div>
                        <div className="font-medium leading-tight text-brand-700 dark:text-brand-400">
                          {item.resolvedWarehouseName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.resolvedProductName} · Salida directa
                        </div>
                      </div>
                    ) : sinStock ? (
                      <div>
                        <div className="font-medium leading-tight text-red-700 dark:text-red-400">
                          {item.resolvedWarehouseName}
                        </div>
                        <div className="text-xs text-red-600 dark:text-red-400">
                          Sin stock de {item.resolvedProductName}
                          {" "}({formatNumber(item.stockDisponible ?? 0)} disponible)
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-red-600 dark:text-red-400 italic">
                        Almacén o producto no identificado
                      </span>
                    )
                  ) : hasMatch ? (
                    candidateList.length > 0 ? (
                      <Select
                        value={item.chosenPuestaId ?? item.match!.puesta_id}
                        onValueChange={(v) => onChoosePuesta(index, v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {candidateList.map((c) => (
                            <SelectItem key={c.puesta_id} value={c.puesta_id} className="text-xs">
                              {c.numero_contrato} · {c.customer_name} ({formatNumber(c.cantidad_pendiente)} {c.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div>
                        <div className="font-medium leading-tight">{activeRef?.customer_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {activeRef?.numero_contrato} · Pdte {formatNumber(activeRef?.cantidad_pendiente ?? 0)}{" "}
                          {activeRef?.unit}
                        </div>
                      </div>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Sin puesta abierta</span>
                  )}

                  {/* Rebase: el pendiente se queda en negativo al incluir esta
                      fila. Va aquí, pegado a la puesta afectada, y no solo en
                      el globo de avisos, porque es la cifra que hay que mirar
                      antes de decidir si se marca. */}
                  {rebasa && (
                    <div className="mt-1 flex items-start gap-1 rounded border border-red-500 bg-red-500/15 px-1.5 py-1 text-[11px] font-semibold text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
                      <span>
                        REBASA la puesta: quedaría en{" "}
                        {formatNumber(item.rebase!.pendienteDespues)} {item.rebase!.unit} (
                        {formatNumber(item.rebase!.exceso)} {item.rebase!.unit} de más)
                        {!item.rebase!.cruzaLaRaya && " — ya rebasada por un camión anterior"}
                      </span>
                    </div>
                  )}

                  {/* Partir: genera una fila idéntica para repartir la
                      cantidad de este camión con otra puesta del mismo
                      cliente. Sobre todo pensado para cuando rebasa (arriba),
                      pero se ofrece en cualquier fila resuelta: a veces hace
                      falta repartir aunque no se haya llegado a rebasar. */}
                  {(puedePartir || esPartida) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {puedePartir && (
                        <button
                          type="button"
                          onClick={() => onSplit(index)}
                          title="Genera una fila idéntica para repartir esta cantidad con otra puesta del mismo cliente"
                          className="inline-flex items-center gap-1 rounded border border-brand-300 bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300 dark:hover:bg-brand-900/40"
                        >
                          <Scissors className="h-3 w-3" />
                          Partir
                        </button>
                      )}
                      {esPartida && (
                        <button
                          type="button"
                          onClick={() => onRemoveSplit(index)}
                          title="Quita esta fila partida (la fila original no se toca)"
                          className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/40"
                        >
                          <Trash2 className="h-3 w-3" />
                          Quitar
                        </button>
                      )}
                    </div>
                  )}
                  {/* Recordatorio en el momento en que hace falta: al partir
                      un camión que rebasa, las DOS cantidades hay que
                      cuadrarlas a mano. La acumulación de rebases ignora la
                      casilla de selección a propósito (ver comentario en
                      aplicarRebasesDelTramo): desmarcar la fila vieja sin
                      bajar también su cantidad no libera el pendiente. */}
                  {rebasa && (puedePartir || esPartida) && (
                    <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                      Al partir, ajusta la cantidad de las dos filas para que sumen lo mismo que
                      el camión original — desmarcar sola una no basta, sigue contando.
                    </p>
                  )}
                </TableCell>

                {/* Fecha editable */}
                <TableCell>
                  <Input
                    type="date"
                    className="h-8"
                    value={item.edited.fecha}
                    disabled={!isEditable}
                    onChange={(e) => onEdit(index, "fecha", e.target.value)}
                  />
                </TableCell>

                {/* Matrícula editable */}
                <TableCell>
                  <Input
                    className="h-8 uppercase"
                    value={item.edited.matricula}
                    disabled={!isEditable}
                    onChange={(e) => onEdit(index, "matricula", e.target.value.toUpperCase())}
                  />
                </TableCell>

                {/* Cantidad editable */}
                <TableCell>
                  <DecimalInput
                    className={cn(
                      "h-8",
                      lecturaDudosa && "border-red-500 ring-1 ring-red-500/40 font-semibold"
                    )}
                    value={item.edited.cantidad}
                    disabled={!isEditable}
                    onChange={(n) => onEdit(index, "cantidad", n ?? 0)}
                  />
                  {item.line.cantidad_origen != null && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatNumber(item.line.cantidad_origen)} {item.line.unidad_origen ?? ""} →{" "}
                      {item.line.unidad_destino ?? ""}
                    </div>
                  )}
                  {lecturaDudosa && (
                    <div className="mt-1 flex items-start gap-1 text-[11px] font-medium text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
                      <span>
                        2ª lectura: {formatNumber(item.verificacion!.neto)}{" "}
                        {item.line.unidad_origen ?? item.line.unidad ?? ""}
                      </span>
                    </div>
                  )}
                </TableCell>

                {/* Tipo / Confianza */}
                <TableCell>
                  {esDevolucion ? (
                    <Badge
                      className={cn(
                        "gap-1 border-transparent text-white",
                        devolucionGrabable
                          ? "bg-violet-600 hover:bg-violet-600"
                          : "bg-red-600 hover:bg-red-600"
                      )}
                    >
                      <Undo2 className="h-3 w-3" />
                      {devolucionGrabable ? "Devolución" : "Ajustar a mano"}
                    </Badge>
                  ) : isNormal ? (
                    <Badge
                      variant={normalResolved ? "outline" : "destructive"}
                      className={cn("gap-1", normalResolved && "border-brand-500 text-brand-700 dark:text-brand-400")}
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                      Directa
                    </Badge>
                  ) : (
                    <Badge variant={meta.variant} className="gap-1">
                      <ConfidenceIcon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                  )}
                </TableCell>

                {/* Avisos de la fila, desplegables */}
                <TableCell className="text-center">
                  <RowWarnings
                    warnings={item.warnings}
                    tono={
                      lecturaDudosa || isDuplicate || rebasa || (esDevolucion && !devolucionGrabable)
                        ? "rojo"
                        : esDevolucion
                          ? "violeta"
                          : "ambar"
                    }
                    numero={index + 1}
                    matricula={item.line.matricula}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
