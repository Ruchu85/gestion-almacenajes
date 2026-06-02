"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2, Power } from "lucide-react";
import type { Product } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

function ProductActions({
  product,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  product: Product;
  onEdit: (p: Product) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onEdit(product)}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onToggleActive(product.id, !product.active)}
        >
          <Power className="mr-2 h-4 w-4" />
          {product.active ? "Desactivar" : "Activar"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ConfirmDialog
          trigger={
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(e) => e.preventDefault()}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar
            </DropdownMenuItem>
          }
          title="¿Eliminar producto?"
          description={`Se eliminará "${product.name}" junto con todos sus movimientos, puestas, costes y tarifas asociadas. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onConfirm={() => onDelete(product.id)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function getProductColumns(
  onEdit: (p: Product) => void,
  onDelete: (id: string) => void,
  onToggleActive: (id: string, active: boolean) => void
): ColumnDef<Product>[] {
  return [
    {
      accessorKey: "code",
      header: "Código",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.getValue("code")}</span>
      ),
    },
    {
      accessorKey: "name",
      header: "Nombre",
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("name")}</span>
      ),
    },
    {
      accessorKey: "unit",
      header: "Unidad",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">{row.getValue("unit")}</span>
      ),
    },
    {
      accessorKey: "active",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={row.getValue("active") ? "success" : "secondary"}>
          {row.getValue("active") ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <ProductActions
          product={row.original}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
        />
      ),
    },
  ];
}
