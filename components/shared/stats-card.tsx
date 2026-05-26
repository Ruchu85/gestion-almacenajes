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

const variantStyles = {
  default: {
    border: "border-l-4 border-l-blue-500 dark:border-l-blue-400",
    iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-blue-400 dark:to-indigo-500",
    value: "text-blue-700 dark:text-blue-300",
    glow: "hover:shadow-blue-100 dark:hover:shadow-blue-900/20",
  },
  success: {
    border: "border-l-4 border-l-emerald-500 dark:border-l-emerald-400",
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-emerald-400 dark:to-teal-500",
    value: "text-emerald-700 dark:text-emerald-300",
    glow: "hover:shadow-emerald-100 dark:hover:shadow-emerald-900/20",
  },
  warning: {
    border: "border-l-4 border-l-amber-500 dark:border-l-amber-400",
    iconBg: "bg-gradient-to-br from-amber-500 to-orange-500 dark:from-amber-400 dark:to-orange-400",
    value: "text-amber-700 dark:text-amber-300",
    glow: "hover:shadow-amber-100 dark:hover:shadow-amber-900/20",
  },
  destructive: {
    border: "border-l-4 border-l-red-500 dark:border-l-red-400",
    iconBg: "bg-gradient-to-br from-red-500 to-rose-600 dark:from-red-400 dark:to-rose-500",
    value: "text-red-700 dark:text-red-300",
    glow: "hover:shadow-red-100 dark:hover:shadow-red-900/20",
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
    <Card
      className={cn(
        "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
        styles.border,
        styles.glow
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && (
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl shadow-sm",
              styles.iconBg
            )}
          >
            <Icon className="h-5 w-5 text-white" />
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold tabular-nums", styles.value)}>
          {value}
        </div>
        {(description || trend) && (
          <p className="text-xs text-muted-foreground mt-1">
            {trend && (
              <span
                className={cn(
                  "font-medium mr-1",
                  trend.value >= 0 ? "text-emerald-600" : "text-destructive"
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
