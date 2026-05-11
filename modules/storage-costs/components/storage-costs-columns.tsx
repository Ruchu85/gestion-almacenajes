"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { StorageCostWithRelations } from "@/types";
import { formatDate, formatCurrency, formatCurrencyLong, formatQuantity } from "@/utils/format";

export function getStorageCostColumns(): ColumnDef<StorageCostWithRelations>[] {
  return [
    {
      accessorKey: "cost_date",
      header: "Fecha",
      cell: ({ row }) => (
        <span className="font-medium">{formatDate(row.getValue("cost_date"))}</span>
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
      accessorKey: "pending_quantity",
      header: "Cantidad pendiente",
      cell: ({ row }) => (
        <span className="tabular-nums font-medium">
          {formatQuantity(row.getValue("pending_quantity"), row.original.product.unit)}
        </span>
      ),
    },
    {
      accessorKey: "daily_price",
      header: "Precio/día",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {formatCurrencyLong(row.getValue("daily_price"))}
        </span>
      ),
    },
    {
      accessorKey: "total_cost",
      header: "Coste total",
      cell: ({ row }) => (
        <span className="tabular-nums font-semibold text-primary">
          {formatCurrency(row.getValue("total_cost"))}
        </span>
      ),
    },
  ];
}
