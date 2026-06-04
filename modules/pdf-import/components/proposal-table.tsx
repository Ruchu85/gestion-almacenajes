"use client";

import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
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
import { formatDate, formatNumber } from "@/utils/format";
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
            <TableHead>Cliente / Nº puesta (PDF)</TableHead>
            <TableHead>Puesta encontrada</TableHead>
            <TableHead className="w-[140px]">Fecha</TableHead>
            <TableHead className="w-[130px]">Matrícula</TableHead>
            <TableHead className="w-[130px]">Cantidad</TableHead>
            <TableHead className="w-[110px]">Confianza</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => {
            const meta = CONFIDENCE_META[item.confidence];
            const Icon = meta.icon;
            const hasMatch = !!item.match;
            const candidateList = item.candidates.length > 1 ? item.candidates : [];
            const activeRef =
              item.candidates.find((c) => c.puesta_id === item.chosenPuestaId) ?? item.match;

            return (
              <TableRow key={item.id} className={cn(!hasMatch && "opacity-60")}>
                {/* Selección */}
                <TableCell>
                  <Checkbox
                    checked={item.selected}
                    disabled={!hasMatch}
                    onCheckedChange={(c) => onToggle(index, c === true)}
                    aria-label="Seleccionar fila"
                  />
                </TableCell>

                {/* Datos crudos del PDF */}
                <TableCell>
                  <div className="font-medium leading-tight">{item.line.cliente}</div>
                  <div className="text-xs text-muted-foreground">
                    Nº {item.line.numero_puesta}
                    {item.line.producto ? ` · ${item.line.producto}` : ""}
                  </div>
                </TableCell>

                {/* Puesta encontrada / selector de candidatas */}
                <TableCell>
                  {hasMatch ? (
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
                    disabled={!hasMatch}
                    onChange={(e) => onEdit(index, "fecha", e.target.value)}
                  />
                </TableCell>

                {/* Matrícula editable */}
                <TableCell>
                  <Input
                    className="h-8 uppercase"
                    value={item.edited.matricula}
                    disabled={!hasMatch}
                    onChange={(e) => onEdit(index, "matricula", e.target.value.toUpperCase())}
                  />
                </TableCell>

                {/* Cantidad editable */}
                <TableCell>
                  <DecimalInput
                    className="h-8"
                    value={item.edited.cantidad}
                    disabled={!hasMatch}
                    onChange={(n) => onEdit(index, "cantidad", n ?? 0)}
                  />
                </TableCell>

                {/* Confianza */}
                <TableCell>
                  <Badge variant={meta.variant} className="gap-1">
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </Badge>
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
