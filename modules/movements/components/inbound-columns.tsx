"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { InboundMovementWithRelations } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatDate, formatQuantity } from "@/utils/format";
import { getCostStartDate } from "@/utils/calculations";

export function getInboundColumns(
  onDelete: (id: string) => void,
  onEdit?: (movement: InboundMovementWithRelations) => void
): ColumnDef<InboundMovementWithRelations>[] {
  return [
    {
      accessorKey: "movement_date",
      header: "Fecha",
      cell: ({ row }) => (
        <span className="font-medium whitespace-nowrap">{formatDate(row.getValue("movement_date"))}</span>
      ),
    },
    {
      id: "warehouse",
      header: "Almacén",
      // Código y nombre EN LÍNEA, no apilados: es lo que hacía que cada fila
      // ocupara el doble de alto. Mismo criterio que las filas del Buscador.
      cell: ({ row }) => (
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="font-mono text-xs text-muted-foreground shrink-0">{row.original.warehouse.code}</span>
          <span className="text-sm font-medium truncate">{row.original.warehouse.name}</span>
        </div>
      ),
    },
    {
      id: "product",
      header: "Producto",
      cell: ({ row }) => (
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="font-mono text-xs text-muted-foreground shrink-0">{row.original.product.code}</span>
          <span className="text-sm font-medium truncate">{row.original.product.name}</span>
        </div>
      ),
    },
    {
      id: "supplier",
      header: "Proveedor",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate block max-w-[220px]">
          {row.original.supplier?.name ?? "-"}
        </span>
      ),
    },
    {
      accessorKey: "quantity",
      header: "Cantidad",
      cell: ({ row }) => (
        <span className="tabular-nums font-medium">
          {formatQuantity(row.getValue("quantity"), row.original.product.unit)}
        </span>
      ),
    },
    {
      accessorKey: "free_days",
      header: "Días plancha",
      cell: ({ row }) => {
        const freeDays = row.getValue("free_days") as number;
        const costStart = getCostStartDate(row.original.movement_date, freeDays, row.original.created_at);
        return (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Badge variant={freeDays > 0 ? "warning" : "secondary"} className="tabular-nums">
              {freeDays}d
            </Badge>
            <span className="text-xs text-muted-foreground">
              desde {formatDate(costStart)}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "comments",
      header: "Comentarios",
      cell: ({ row }) => (
        <span
          className="text-sm text-muted-foreground truncate block max-w-[280px]"
          title={(row.getValue("comments") as string | null) ?? undefined}
        >
          {(row.getValue("comments") as string | null) ?? "-"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {onEdit && (
              <DropdownMenuItem onSelect={() => onEdit(row.original)}>
                <Pencil className="mr-2 h-4 w-4" />Editar
              </DropdownMenuItem>
            )}
            <ConfirmDialog
              trigger={
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={(e) => e.preventDefault()}>
                  <Trash2 className="mr-2 h-4 w-4" />Eliminar
                </DropdownMenuItem>
              }
              title="¿Eliminar entrada?"
              description="Se eliminará el movimiento y se recalcularán los costes de almacenaje desde su fecha."
              confirmLabel="Eliminar"
              onConfirm={() => onDelete(row.original.id)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}
