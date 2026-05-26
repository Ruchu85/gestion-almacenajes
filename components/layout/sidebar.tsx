"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Warehouse,
  Package,
  Truck,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  activeBg: string;
  hoverBg: string;
}

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    color: "text-violet-500",
    activeBg: "bg-gradient-to-r from-violet-500/15 to-violet-500/5 border-l-2 border-violet-500",
    hoverBg: "hover:bg-violet-500/8 hover:text-violet-600 dark:hover:text-violet-400",
  },
  {
    title: "Almacenes",
    href: "/warehouses",
    icon: Warehouse,
    color: "text-blue-500",
    activeBg: "bg-gradient-to-r from-blue-500/15 to-blue-500/5 border-l-2 border-blue-500",
    hoverBg: "hover:bg-blue-500/8 hover:text-blue-600 dark:hover:text-blue-400",
  },
  {
    title: "Productos",
    href: "/products",
    icon: Package,
    color: "text-cyan-500",
    activeBg: "bg-gradient-to-r from-cyan-500/15 to-cyan-500/5 border-l-2 border-cyan-500",
    hoverBg: "hover:bg-cyan-500/8 hover:text-cyan-600 dark:hover:text-cyan-400",
  },
  {
    title: "Proveedores",
    href: "/suppliers",
    icon: Truck,
    color: "text-indigo-500",
    activeBg: "bg-gradient-to-r from-indigo-500/15 to-indigo-500/5 border-l-2 border-indigo-500",
    hoverBg: "hover:bg-indigo-500/8 hover:text-indigo-600 dark:hover:text-indigo-400",
  },
  {
    title: "Clientes",
    href: "/customers",
    icon: Users,
    color: "text-teal-500",
    activeBg: "bg-gradient-to-r from-teal-500/15 to-teal-500/5 border-l-2 border-teal-500",
    hoverBg: "hover:bg-teal-500/8 hover:text-teal-600 dark:hover:text-teal-400",
  },
  {
    title: "Puestas",
    href: "/puestas",
    icon: ClipboardList,
    color: "text-amber-500",
    activeBg: "bg-gradient-to-r from-amber-500/15 to-amber-500/5 border-l-2 border-amber-500",
    hoverBg: "hover:bg-amber-500/8 hover:text-amber-600 dark:hover:text-amber-400",
  },
  {
    title: "Entradas",
    href: "/movements/inbound",
    icon: ArrowDownToLine,
    color: "text-emerald-500",
    activeBg: "bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 border-l-2 border-emerald-500",
    hoverBg: "hover:bg-emerald-500/8 hover:text-emerald-600 dark:hover:text-emerald-400",
  },
  {
    title: "Salidas",
    href: "/movements/outbound",
    icon: ArrowUpFromLine,
    color: "text-rose-500",
    activeBg: "bg-gradient-to-r from-rose-500/15 to-rose-500/5 border-l-2 border-rose-500",
    hoverBg: "hover:bg-rose-500/8 hover:text-rose-600 dark:hover:text-rose-400",
  },
  {
    title: "Costes",
    href: "/storage-costs",
    icon: Calculator,
    color: "text-orange-500",
    activeBg: "bg-gradient-to-r from-orange-500/15 to-orange-500/5 border-l-2 border-orange-500",
    hoverBg: "hover:bg-orange-500/8 hover:text-orange-600 dark:hover:text-orange-400",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r bg-card transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4 bg-gradient-to-r from-card to-card/80">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 shadow-sm group-hover:shadow-violet-200 dark:group-hover:shadow-violet-900/40 transition-shadow">
              <Warehouse className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-sm bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              GestAlmacén
            </span>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" className="mx-auto group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 shadow-sm group-hover:shadow-violet-200 dark:group-hover:shadow-violet-900/40 transition-shadow">
              <Warehouse className="h-4 w-4 text-white" />
            </div>
          </Link>
        )}
      </div>

      <ScrollArea className="flex-1 px-2 py-4">
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`);

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-md mx-auto transition-all duration-150",
                        isActive
                          ? cn("bg-primary/10", item.color)
                          : cn("text-muted-foreground", item.hoverBg)
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {item.title}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-all duration-150",
                  isActive
                    ? cn(item.activeBg, item.color, "font-semibold")
                    : cn("text-muted-foreground", item.hoverBg)
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="icon"
          className="w-full h-9 hover:bg-muted/80"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
