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
  FileSpreadsheet,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { PdfImportDialog } from "@/modules/pdf-import/components/pdf-import-dialog";
import { PdfImportDialogGemini35 } from "@/modules/pdf-import/components/pdf-import-dialog-gemini35";
import { PdfPuestasDialog } from "@/modules/pdf-puestas/components/pdf-puestas-dialog";
import { ExcelImportDialog } from "@/modules/excel-import/components/excel-import-dialog";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Estados de la navegación, al estilo Flowbite: el elemento activo se marca
 * con una superficie sólida un escalón por encima del sidebar y texto a plena
 * intensidad; el resto vive en el gris secundario y solo se ilumina al pasar
 * por encima. Sin degradados ni barras de color: la jerarquía la da el peso
 * del texto y el fondo.
 */
const NAV_BASE =
  "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150";
const NAV_ACTIVE = "bg-sidebar-accent text-sidebar-accent-foreground font-semibold";
const NAV_IDLE =
  "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground";

const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Almacenes", href: "/warehouses", icon: Warehouse },
  { title: "Productos", href: "/products", icon: Package },
  { title: "Proveedores", href: "/suppliers", icon: Truck },
  { title: "Clientes", href: "/customers", icon: Users },
  { title: "Puestas", href: "/puestas", icon: ClipboardList },
  { title: "Entradas", href: "/movements/inbound", icon: ArrowDownToLine },
  { title: "Salidas", href: "/movements/outbound", icon: ArrowUpFromLine },
  { title: "Costes", href: "/storage-costs", icon: Calculator },
  { title: "Buscador", href: "/buscador", icon: Search },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfGemini35Open, setPdfGemini35Open] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
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
        "relative flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        <Link
          href="/dashboard"
          className={cn("flex items-center gap-2.5 group", collapsed && "mx-auto")}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Warehouse className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-base text-sidebar-accent-foreground">
              GestiPuertos
            </span>
          )}
        </Link>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
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
                        NAV_BASE,
                        "h-10 w-10 justify-center mx-auto",
                        isActive ? NAV_ACTIVE : NAV_IDLE
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
                className={cn(NAV_BASE, "h-10 px-3", isActive ? NAV_ACTIVE : NAV_IDLE)}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{item.title}</span>
              </Link>
            );
          })}

          {/* Acciones de PDF: abren un popup, no son rutas. Se separan de la
              navegación con un filete, como en el patrón de Flowbite. */}
          <div className="my-2 border-t border-sidebar-border" />

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setPdfOpen(true)}
                  className={cn(NAV_BASE, "h-10 w-10 justify-center mx-auto", NAV_IDLE)}
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
              className={cn(NAV_BASE, "h-10 px-3 text-left", NAV_IDLE)}
            >
              <FileUp className="h-5 w-5 shrink-0" />
              <span className="truncate">Subir Salidas Puerto (PDF)</span>
            </button>
          )}

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setPdfGemini35Open(true)}
                  className={cn(NAV_BASE, "h-10 w-10 justify-center mx-auto", NAV_IDLE)}
                >
                  <FlaskConical className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Subir Salidas Puerto (PDF) · Beta Gemini 3.5</TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => setPdfGemini35Open(true)}
              className={cn(NAV_BASE, "h-10 px-3 text-left", NAV_IDLE)}
            >
              <FlaskConical className="h-5 w-5 shrink-0" />
              <span className="truncate">Subir Salidas Puerto (PDF) · Beta 3.5</span>
            </button>
          )}

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setExcelOpen(true)}
                  className={cn(NAV_BASE, "h-10 w-10 justify-center mx-auto", NAV_IDLE)}
                >
                  <FileSpreadsheet className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Subir Salidas Puerto (Excel)</TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => setExcelOpen(true)}
              className={cn(NAV_BASE, "h-10 px-3 text-left", NAV_IDLE)}
            >
              <FileSpreadsheet className="h-5 w-5 shrink-0" />
              <span className="truncate">Subir Salidas Puerto (Excel)</span>
            </button>
          )}

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => { setPdfPuestaAutoLoad(false); setPdfPuestaOpen(true); }}
                  className={cn(NAV_BASE, "h-10 w-10 justify-center mx-auto", NAV_IDLE)}
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
              className={cn(NAV_BASE, "h-10 px-3 text-left", NAV_IDLE)}
            >
              <FilePlus2 className="h-5 w-5 shrink-0" />
              <span className="truncate">Subir Pta a Disposición (PDF)</span>
            </button>
          )}
        </nav>
      </ScrollArea>

      <PdfImportDialog open={pdfOpen} onOpenChange={setPdfOpen} />
      <PdfImportDialogGemini35 open={pdfGemini35Open} onOpenChange={setPdfGemini35Open} />
      <ExcelImportDialog open={excelOpen} onOpenChange={setExcelOpen} />
      <PdfPuestasDialog
        open={pdfPuestaOpen}
        onOpenChange={(o) => { setPdfPuestaOpen(o); if (!o) setPdfPuestaAutoLoad(false); }}
        autoLoad={pdfPuestaAutoLoad}
      />

      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="icon"
          className="w-full h-9 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
