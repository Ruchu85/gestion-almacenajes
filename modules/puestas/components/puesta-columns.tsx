"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Eye, Pencil, Trash2, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { PuestaSummary } from "@/types";
import { formatDate, formatCurrency, formatNumber } from "@/utils/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const estadoConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  abierta:        { label: "Abierta",        variant: "default" },
  finalizada:     { label: "Finalizada",     variant: "secondary" },
  cerrada_manual: { label: "Cerrada manual", variant: "outline" },
};

export function getPuestaColumns(
  onView:   (row: PuestaSummary) => void,
  onEdit:   (row: PuestaSummary) => void,
  onDelete: (puestaId: string)  => void,
  onChangeEstado: (puestaId: string, estado: "abierta" | "finalizada" | "cerrada_manual") => void
): ColumnDef<PuestaSummary>[] {
  return [
    {
      accessorKey: "numero_contrato",
      header: "Contrato",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">
          {row.original.numero_contrato || <span className="text-muted-foreground italic">Sin ref.</span>}
        </span>
      ),
    },
    {
      accessorKey: "customer_name",
      header: "Cliente",
      cell: ({ row }) => (
        <span>{row.original.customer_name || <span className="text-muted-foreground">—</span>}</span>
      ),
    },
    {
      accessorKey: "product_name",
      header: "Producto",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.product_name}</div>
          <div className="text-xs text-muted-foreground">{row.original.product_code}</div>
        </div>
      ),
    },
    {
      accessorKey: "warehouse_name",
      header: "Almacén",
    },
    {
      accessorKey: "fecha_puesta",
      header: "Fecha puesta",
      cell: ({ row }) => formatDate(row.original.fecha_puesta),
    },
    {
      accessorKey: "dias_plancha",
      header: "Plancha",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.dias_plancha} días
          <span className="block text-xs text-muted-foreground">
            hasta {formatDate(row.original.fecha_fin_plancha)}
          </span>
        </span>
      ),
    },
    {
      accessorKey: "cantidad_pendiente",
      header: "Pendiente",
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          <div className="font-medium">
            {formatNumber(row.original.cantidad_pendiente)} {row.original.unit}
          </div>
          <div className="text-xs text-muted-foreground">
            de {formatNumber(row.original.cantidad_inicial)}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "dias_activos",
      header: "Días activos",
      cell: ({ row }) => (
        <div className="text-center tabular-nums">
          {row.original.dias_activos > 0 ? (
            <span className="text-sm font-medium">{row.original.dias_activos}</span>
          ) : (
            <span className="text-muted-foreground text-sm">En plancha</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "coste_acumulado",
      header: "Coste acumulado",
      cell: ({ row }) => (
        <div className="text-right tabular-nums font-medium">
          {formatCurrency(row.original.coste_acumulado)}
        </div>
      ),
    },
    {
      accessorKey: "estado",
      header: "Estado",
      cell: ({ row }) => {
        const cfg = estadoConfig[row.original.estado] ?? { label: row.original.estado, variant: "outline" as const };
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const puesta = row.original;
        const cfg = estadoConfig[puesta.estado];
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onView(puesta)}>
                <Eye className="mr-2 h-4 w-4" />Ver detalle
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(puesta)}>
                <Pencil className="mr-2 h-4 w-4" />Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {puesta.estado !== "abierta" && (
                <DropdownMenuItem onClick={() => onChangeEstado(puesta.puesta_id, "abierta")}>
                  <Clock className="mr-2 h-4 w-4" />Reabrir
                </DropdownMenuItem>
              )}
              {puesta.estado === "abierta" && (
                <DropdownMenuItem onClick={() => onChangeEstado(puesta.puesta_id, "finalizada")}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />Marcar finalizada
                </DropdownMenuItem>
              )}
              {puesta.estado === "abierta" && (
                <DropdownMenuItem onClick={() => onChangeEstado(puesta.puesta_id, "cerrada_manual")}>
                  <XCircle className="mr-2 h-4 w-4" />Cerrar manualmente
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(puesta.puesta_id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
