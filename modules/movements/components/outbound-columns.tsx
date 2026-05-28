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
        <span className="font-medium">{formatDate(row.getValue("movement_date"))}</span>
      ),
    },
    {
      id: "warehouse",
      header: "Almacén",
      cell: ({ row }) => (
        <div>
          <span className="font-mono text-xs text-muted-foreground">{row.original.warehouse.code}</span>
          <p className="text-sm font-medium">{row.original.warehouse.name}</p>
        </div>
      ),
    },
    {
      id: "product",
      header: "Producto",
      cell: ({ row }) => (
        <div>
          <span className="font-mono text-xs text-muted-foreground">{row.original.product.code}</span>
          <p className="text-sm font-medium">{row.original.product.name}</p>
        </div>
      ),
    },
    {
      id: "customer",
      header: "Cliente",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.customer?.name ?? "-"}
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
      accessorKey: "matricula",
      header: "Matrícula",
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {(row.getValue("matricula") as string | null) ?? "-"}
        </span>
      ),
    },
    {
      accessorKey: "comments",
      header: "Comentarios",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {(row.getValue("comments") as string | null)?.slice(0, 50) ?? "-"}
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
