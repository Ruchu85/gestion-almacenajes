"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2, Truck } from "lucide-react";
import type { SalidaParcial } from "@/types";
import { formatDate, formatNumber } from "@/utils/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function getSalidaColumns(
  onEdit:   (salida: SalidaParcial) => void,
  onDelete: (id: string) => void,
  unit = "ud"
): ColumnDef<SalidaParcial>[] {
  return [
    {
      accessorKey: "fecha_salida",
      header: "Fecha",
      cell: ({ row }) => formatDate(row.original.fecha_salida),
    },
    {
      accessorKey: "n_camion",
      header: "Nº camión",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{row.original.n_camion || <span className="text-muted-foreground">—</span>}</span>
        </div>
      ),
    },
    {
      accessorKey: "matricula",
      header: "Matrícula",
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {row.original.matricula || <span className="text-muted-foreground font-sans">—</span>}
        </span>
      ),
    },
    {
      accessorKey: "cantidad",
      header: "Cantidad",
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {formatNumber(row.original.cantidad)} {unit}
        </span>
      ),
    },
    {
      accessorKey: "comentarios",
      header: "Comentarios",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.comentarios || "—"}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const salida = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onEdit(salida)}>
                <Pencil className="mr-2 h-4 w-4" />Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(salida.id)}
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
