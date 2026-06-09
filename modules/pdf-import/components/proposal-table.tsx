"use client";

import { AlertTriangle, ArrowRightLeft, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
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
}

interface ProposalTableProps {
  items: EditableProposal[];
  onToggle: (index: number, selected: boolean) => void;
  onEdit: (index: number, field: "fecha" | "matricula" | "cantidad", value: string | number) => void;
  onChoosePuesta: (index: number, puestaId: string) => void;
}

const CONFIDENCE_META: Record<
  MatchConfidence,
  { label: string; variant: "success" | "warning" | "destructive"; icon: typeof CheckCircle2 }
> = {
  alta: { label: "Alta", variant: "success", icon: CheckCircle2 },
  media: { label: "Revisar", variant: "warning", icon: HelpCircle },
  nula: { label: "Sin match", variant: "destructive", icon: XCircle },
};

export function ProposalTable({ items, onToggle, onEdit, onChoosePuesta }: ProposalTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Datos del PDF</TableHead>
            <TableHead>Puesta / Destino</TableHead>
            <TableHead className="w-[140px]">Fecha</TableHead>
            <TableHead className="w-[160px]">Matrícula</TableHead>
            <TableHead className="w-[130px]">Cantidad</TableHead>
            <TableHead className="w-[120px]">Tipo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => {
            const isNormal = item.tipo === "normal";
            const hasMatch = !!item.match;
            const normalResolved = isNormal && !!(item.resolvedWarehouseId && item.resolvedProductId);
            const isSelectable = isNormal ? normalResolved : hasMatch;
            const isEditable = isSelectable;

            const meta = CONFIDENCE_META[item.confidence];
            const ConfidenceIcon = meta.icon;
            const candidateList = item.candidates.length > 1 ? item.candidates : [];
            const activeRef =
              item.candidates.find((c) => c.puesta_id === item.chosenPuestaId) ?? item.match;

            const isDuplicate = item.warnings.some((w) =>
              w.includes("Ya existe una salida idéntica")
            );
            const isClean = isSelectable && item.warnings.length === 0;

            return (
              <TableRow
                key={item.id}
                className={cn(
                  !isSelectable && "opacity-50",
                  isDuplicate && "bg-red-500/10",
                  !isDuplicate && isClean && "bg-green-500/10",
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

                {/* Datos crudos del PDF */}
                <TableCell>
                  {isNormal ? (
                    <>
                      <div className="font-medium leading-tight text-muted-foreground italic text-xs">
                        Sin cliente / sin contrato
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.line.almacen ? `${item.line.almacen} · ` : ""}
                        {item.line.producto ?? ""}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-medium leading-tight">{item.line.cliente}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.line.numero_puesta ? `Nº ${item.line.numero_puesta}` : "Sin contrato"}
                        {item.line.producto ? ` · ${item.line.producto}` : ""}
                      </div>
                    </>
                  )}
                </TableCell>

                {/* Puesta encontrada / destino para salida normal */}
                <TableCell>
                  {isNormal ? (
                    normalResolved ? (
                      <div>
                        <div className="font-medium leading-tight text-sky-700 dark:text-sky-400">
                          {item.resolvedWarehouseName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.resolvedProductName} · Salida directa
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-destructive italic">
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
                    className="h-8"
                    value={item.edited.cantidad}
                    disabled={!isEditable}
                    onChange={(n) => onEdit(index, "cantidad", n ?? 0)}
                  />
                </TableCell>

                {/* Tipo / Confianza */}
                <TableCell>
                  {isNormal ? (
                    <Badge
                      variant={normalResolved ? "outline" : "destructive"}
                      className={cn("gap-1", normalResolved && "border-sky-500 text-sky-700 dark:text-sky-400")}
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
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Avisos por fila */}
      {items.some((i) => i.warnings.length > 0) && (
        <div className="border-t bg-muted/30 p-3 space-y-1.5">
          {items.map((item, index) =>
            item.warnings.map((w, wi) => (
              <div
                key={`${item.id}-w-${wi}`}
                className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>Fila {index + 1}</strong> ({item.line.matricula}): {w}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
