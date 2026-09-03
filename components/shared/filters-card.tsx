"use client";

import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Panel de filtros común a las pantallas de listado (Salidas, Entradas,
 * Puestas a Disposición), con el mismo lenguaje visual que el Buscador:
 * búsqueda libre arriba a todo lo ancho, los filtros en rejilla —cada uno con
 * su icono— y una fila inferior para las acciones y el contador.
 *
 * La rejilla en vez de `flex flex-wrap` es lo que hace que los controles
 * queden alineados en columnas en lugar de escalonarse según lo que ocupe el
 * texto de cada uno.
 *
 * A diferencia del Buscador NO lleva botón "Buscar": estas pantallas filtran
 * en caliente sobre datos ya cargados, así que obligar a pulsar un botón sería
 * un paso de más. Lo que se comparte es el aspecto, no ese comportamiento.
 */
interface FiltersCardProps {
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  /** Los filtros; normalmente varios `<FilterField>`. */
  children: React.ReactNode;
  /** Fila inferior izquierda: botón de limpiar, acciones… */
  actions?: React.ReactNode;
  /** Fila inferior derecha: contador de resultados. */
  summary?: React.ReactNode;
}

export function FiltersCard({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  children,
  actions,
  summary,
}: FiltersCardProps) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 space-y-4">
        {/* Búsqueda libre */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={searchPlaceholder}
            className="pl-9 text-sm"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Filtros secundarios */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{children}</div>

        {/* Acciones y contador */}
        {(actions || summary) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {actions}
            {summary && <div className="ml-auto">{summary}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Un filtro de la rejilla: su icono y el control.
 *
 * El tamaño compacto (h-8, texto pequeño) se aplica aquí sobre el control hijo
 * en lugar de repetirlo en cada `SelectTrigger` e `Input` de las tres
 * pantallas: así todos los filtros quedan iguales por construcción y no por
 * disciplina de quien los escribe.
 */
export function FilterField({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        "[&_button]:h-8 [&_button]:text-xs [&_input]:h-8 [&_input]:text-xs",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {children}
    </div>
  );
}
