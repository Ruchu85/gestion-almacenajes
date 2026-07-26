import { type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string;
  description?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label: string;
  };
  isLoading?: boolean;
  variant?: "default" | "success" | "warning" | "destructive";
}

/**
 * Al estilo Flowbite, la cifra va siempre en el color de texto principal: es
 * el dato, no un adorno. El color de la variante se reserva para el icono, en
 * una pastilla de fondo tenue, y para el indicador de tendencia. Así una fila
 * de KPIs se lee como un bloque homogéneo en lugar de un arcoíris.
 */
const variantStyles = {
  default: {
    iconBg: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  },
  success: {
    iconBg: "bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400",
  },
  warning: {
    iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  },
  destructive: {
    iconBg: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  },
};

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  isLoading = false,
  variant = "default",
}: StatsCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-10 rounded-xl" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-40 mt-2" />
        </CardContent>
      </Card>
    );
  }

  const styles = variantStyles[variant];

  return (
    <Card className="transition-shadow duration-200 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && (
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              styles.iconBg
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums text-foreground">
          {value}
        </div>
        {(description || trend) && (
          <p className="text-xs text-muted-foreground mt-1">
            {trend && (
              <span
                className={cn(
                  "font-medium mr-1",
                  trend.value >= 0
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                )}
              >
                {trend.value >= 0 ? "+" : ""}
                {trend.value.toFixed(1)}%
              </span>
            )}
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
