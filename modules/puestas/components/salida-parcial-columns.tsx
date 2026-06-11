"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2, Truck, ArrowRightLeft } from "lucide-react";
import type { SalidaParcial } from "@/types";
import { formatDate, formatNumber } from "@/utils/format";
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
import { cn } from "@/lib/utils";

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
      accessorKey: "tipo",
      header: "Tipo",
      cell: ({ row }) => {
        const isPlancha = row.original.tipo === "plancha";
        return isPlancha ? (
          <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-950/30 gap-1">
            <ArrowRightLeft className="h-3 w-3" />Traspaso
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1">
            <Truck className="h-3 w-3" />Camión
          </Badge>
        );
      },
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
        <span className={cn(
          "font-medium tabular-nums",
          row.original.tipo === "plancha" && "text-amber-600 dark:text-amber-400"
        )}>
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
        const isPlancha = salida.tipo === "plancha";
        if (isPlancha) return null; // plancha exits are not editable/deletable
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
