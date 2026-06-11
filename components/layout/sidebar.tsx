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
  Search,
  FileUp,
  FilePlus2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { PdfImportDialog } from "@/modules/pdf-import/components/pdf-import-dialog";
import { PdfPuestasDialog } from "@/modules/pdf-puestas/components/pdf-puestas-dialog";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  activeBg: string;
  hoverBg: string;
}

// Acento de marca unificado (violeta) para todas las secciones, en línea con
// el logo GestiPuertos. Se centraliza para mantener la coherencia visual.
const ACCENT = {
  color: "text-violet-500",
  activeBg:
    "bg-gradient-to-r from-violet-500/15 to-violet-500/5 border-l-2 border-violet-500",
  hoverBg: "hover:bg-violet-500/8 hover:text-violet-600 dark:hover:text-violet-400",
} as const;

const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, ...ACCENT },
  { title: "Almacenes", href: "/warehouses", icon: Warehouse, ...ACCENT },
  { title: "Productos", href: "/products", icon: Package, ...ACCENT },
  { title: "Proveedores", href: "/suppliers", icon: Truck, ...ACCENT },
  { title: "Clientes", href: "/customers", icon: Users, ...ACCENT },
  { title: "Puestas", href: "/puestas", icon: ClipboardList, ...ACCENT },
  { title: "Entradas", href: "/movements/inbound", icon: ArrowDownToLine, ...ACCENT },
  { title: "Salidas", href: "/movements/outbound", icon: ArrowUpFromLine, ...ACCENT },
  { title: "Costes", href: "/storage-costs", icon: Calculator, ...ACCENT },
  { title: "Buscador", href: "/buscador", icon: Search, ...ACCENT },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfPuestaOpen, setPdfPuestaOpen] = useState(false);
  const [pdfPuestaAutoLoad, setPdfPuestaAutoLoad] = useState(false);

  // El aviso del Dashboard dispara este evento para abrir el diálogo de
  // puestas y arrancar directamente "Leer PDFs de Base de Datos".
  useEffect(() => {
    function handleOpenFromDashboard() {
      setPdfPuestaAutoLoad(true);
      setPdfPuestaOpen(true);
    }
    window.addEventListener("gestalmacen:open-pdf-puestas", handleOpenFromDashboard);
    return () => window.removeEventListener("gestalmacen:open-pdf-puestas", handleOpenFromDashboard);
  }, []);

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
              GestiPuertos
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

          {/* Subir Salidas Puerto (PDF) — abre un popup, no es una ruta */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setPdfOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-md mx-auto transition-all duration-150 text-muted-foreground hover:bg-violet-500/8 hover:text-violet-600 dark:hover:text-violet-400"
                >
                  <FileUp className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Subir Salidas Puerto (PDF)</TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => setPdfOpen(true)}
              className="flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-all duration-150 text-muted-foreground hover:bg-violet-500/8 hover:text-violet-600 dark:hover:text-violet-400"
            >
              <FileUp className="h-4 w-4 shrink-0" />
              <span className="truncate">Subir Salidas Puerto (PDF)</span>
            </button>
          )}

          {/* Subir Pta a Disposición (PDF) — abre un popup, no es una ruta */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => { setPdfPuestaAutoLoad(false); setPdfPuestaOpen(true); }}
                  className="flex h-10 w-10 items-center justify-center rounded-md mx-auto transition-all duration-150 text-muted-foreground hover:bg-violet-500/8 hover:text-violet-600 dark:hover:text-violet-400"
                >
                  <FilePlus2 className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Subir Pta a Disposición (PDF)</TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => setPdfPuestaOpen(true)}
              className="flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-all duration-150 text-muted-foreground hover:bg-violet-500/8 hover:text-violet-600 dark:hover:text-violet-400"
            >
              <FilePlus2 className="h-4 w-4 shrink-0" />
              <span className="truncate">Subir Pta a Disposición (PDF)</span>
            </button>
          )}
        </nav>
      </ScrollArea>

      <PdfImportDialog open={pdfOpen} onOpenChange={setPdfOpen} />
      <PdfPuestasDialog
        open={pdfPuestaOpen}
        onOpenChange={(o) => { setPdfPuestaOpen(o); if (!o) setPdfPuestaAutoLoad(false); }}
        autoLoad={pdfPuestaAutoLoad}
      />

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
