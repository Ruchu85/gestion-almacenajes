"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Trash2 } from "lucide-react";
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
  onDelete: (id: string) => void
): ColumnDef<InboundMovementWithRelations>[] {
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
      id: "supplier",
      header: "Proveedor",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
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
        const costStart = getCostStartDate(row.original.movement_date, freeDays);
        return (
          <div className="text-center">
            <Badge variant={freeDays > 0 ? "warning" : "secondary"} className="tabular-nums">
              {freeDays}d
            </Badge>
            <p className="text-xs text-muted-foreground mt-0.5">
              Coste desde {formatDate(costStart)}
            </p>
          </div>
        );
      },
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
              title="¿Eliminar entrada?"
              description="Esta acción eliminará el movimiento. Los costes de almacenaje ya calculados NO se recalcularán automáticamente."
              confirmLabel="Eliminar"
              onConfirm={() => onDelete(row.original.id)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}
