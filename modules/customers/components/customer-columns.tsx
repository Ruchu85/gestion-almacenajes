"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2, Power } from "lucide-react";
import type { Customer } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

export function getCustomerColumns(
  onEdit: (c: Customer) => void,
  onDelete: (id: string) => void,
  onToggleActive: (id: string, active: boolean) => void
): ColumnDef<Customer>[] {
  return [
    {
      accessorKey: "name",
      header: "Nombre",
      cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>,
    },
    {
      accessorKey: "tax_id",
      header: "CIF/NIF",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-muted-foreground">{row.getValue("tax_id") ?? "-"}</span>
      ),
    },
    {
      accessorKey: "comments",
      header: "Comentarios",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {(row.getValue("comments") as string | null)?.slice(0, 60) ?? "-"}
        </span>
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
      cell: ({ row }) => {
        const customer = row.original;
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
              <DropdownMenuItem onClick={() => onEdit(customer)}>
                <Pencil className="mr-2 h-4 w-4" />Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleActive(customer.id, !customer.active)}>
                <Power className="mr-2 h-4 w-4" />{customer.active ? "Desactivar" : "Activar"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <ConfirmDialog
                trigger={
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={(e) => e.preventDefault()}>
                    <Trash2 className="mr-2 h-4 w-4" />Eliminar
                  </DropdownMenuItem>
                }
                title="¿Eliminar cliente?"
                description={`Se eliminará "${customer.name}" permanentemente.`}
                confirmLabel="Eliminar"
                onConfirm={() => onDelete(customer.id)}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
