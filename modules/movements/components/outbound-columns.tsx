"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Trash2 } from "lucide-react";
import type { OutboundMovementWithRelations } from "@/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatDate, formatQuantity } from "@/utils/format";

export function getOutboundColumns(
  onDelete: (id: string) => void
): ColumnDef<OutboundMovementWithRelations>[] {
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
      id: "customer",
      header: "Cliente",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate block max-w-[240px]">
          {row.original.customer?.name ?? "-"}
        </span>
      ),
    },
    {
      accessorKey: "quantity",
      header: "Cantidad",
      cell: ({ row }) => (
        <span className="tabular-nums font-medium whitespace-nowrap">
          {formatQuantity(row.getValue("quantity"), row.original.product.unit)}
        </span>
      ),
    },
    {
      accessorKey: "matricula",
      header: "Matrícula",
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {row.original.matricula ?? row.original.salida_parcial?.matricula ?? "-"}
        </span>
      ),
    },
    {
      id: "pta_disposicion",
      header: "Nº pta. a disposición",
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {row.original.puesta?.numero_contrato ?? "-"}
        </span>
      ),
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
            <ConfirmDialog
              trigger={
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={(e) => e.preventDefault()}>
                  <Trash2 className="mr-2 h-4 w-4" />Eliminar
                </DropdownMenuItem>
              }
              title="¿Eliminar salida?"
              description="Esta acción eliminará el movimiento de salida permanentemente."
              confirmLabel="Eliminar"
              onConfirm={() => onDelete(row.original.id)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}
