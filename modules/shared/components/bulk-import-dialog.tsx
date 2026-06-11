"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, X, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export interface ImportRow {
  nombre: string;
  cif: string;
  direccion: string;
  comentarios: string;
}

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "proveedores" | "clientes";
  onImport: (rows: ImportRow[]) => Promise<{ imported: number; errors: string[] }>;
}

const TEMPLATE_HEADERS = ["Nombre *", "CIF", "Dirección", "Comentarios"];
const TEMPLATE_EXAMPLE: string[][] = [
  ["Empresa Ejemplo S.L.", "B12345678", "Calle Industrial 1, 28001 Madrid", "Cliente habitual"],
  ["Distribuciones Norte", "A98765432", "Polígono Sur, 41001 Sevilla", ""],
  ["Transportes Ibérica", "B55544433", "", "Proveedor de palés"],
];

export function BulkImportDialog({ open, onOpenChange, type, onImport }: BulkImportDialogProps) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const wsData = [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 32 }, { wch: 14 }, { wch: 42 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, type === "proveedores" ? "Proveedores" : "Clientes");
    XLSX.writeFile(wb, `plantilla_${type}.xlsx`);
  }

  function parseFile(file: File) {
    setParseErrors([]);
    setRows([]);
    setImportResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as string[][];

        if (raw.length < 2) {
          setParseErrors(["El archivo no contiene datos. Comprueba que usas la plantilla correcta."]);
          return;
        }

        const parsed: ImportRow[] = [];
        const errs: string[] = [];

        // Skip header row (row 0)
        for (let i = 1; i < raw.length; i++) {
          const row = raw[i];
          const nombre = String(row[0] ?? "").trim();
          // Skip rows where all cells are empty
          if (!nombre && row.slice(1).every((c) => String(c).trim() === "")) continue;
          if (!nombre) {
            errs.push(`Fila ${i + 1}: el campo Nombre es obligatorio`);
            continue;
          }
          parsed.push({
            nombre,
            cif: String(row[1] ?? "").trim(),
            direccion: String(row[2] ?? "").trim(),
            comentarios: String(row[3] ?? "").trim(),
          });
        }

        setParseErrors(errs);
        setRows(parsed);
      } catch {
        setParseErrors(["No se pudo leer el archivo. Asegúrate de que es un Excel (.xlsx/.xls) o CSV válido."]);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setIsImporting(true);
    const result = await onImport(rows);
    setImportResult(result);
    setIsImporting(false);
    if (result.imported > 0) {
      toast({ title: `${result.imported} ${type} importados correctamente` });
    }
  }

  function handleClose() {
    if (isImporting) return;
    setRows([]);
    setParseErrors([]);
    setImportResult(null);
    setFileName(null);
    onOpenChange(false);
  }

  const isFileParsed = rows.length > 0 || parseErrors.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600 dark:text-green-400" />
            Importar {type} desde Excel
          </DialogTitle>
          <DialogDescription>
            Descarga la plantilla, rellénala y súbela para importar en bloque.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Download template */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-green-100 dark:bg-green-950/40">
                <FileSpreadsheet className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">1. Descarga la plantilla Excel</p>
                <p className="text-xs text-muted-foreground">
                  Columnas: <span className="font-medium">Nombre *</span>, CIF, Dirección, Comentarios
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Descargar plantilla
            </Button>
          </div>

          {/* Step 2: Upload */}
          <div>
            <p className="text-sm font-medium mb-2">2. Sube el archivo rellenado</p>
            <div
              className={cn(
                "relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/40 hover:bg-muted/20"
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              {fileName ? (
                <p className="text-sm font-medium text-center">{fileName}</p>
              ) : (
                <p className="text-sm text-center text-muted-foreground">
                  Arrastra tu archivo aquí o{" "}
                  <span className="text-primary font-medium">haz clic para seleccionar</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">Formatos aceptados: .xlsx, .xls, .csv</p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
              {parseErrors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {err}
                </div>
              ))}
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && !importResult && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-medium">
                  Vista previa
                </p>
                <Badge variant="secondary">{rows.length} {rows.length === 1 ? "registro" : "registros"}</Badge>
              </div>
              <div className="max-h-52 overflow-y-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Nombre</th>
                      <th className="px-3 py-2 text-left font-medium w-28">CIF</th>
                      <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Dirección</th>
                      <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Comentarios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 25).map((row, i) => (
                      <tr key={i} className="border-t hover:bg-muted/20">
                        <td className="px-3 py-1.5 font-medium">{row.nombre}</td>
                        <td className="px-3 py-1.5 text-muted-foreground font-mono">{row.cif || "—"}</td>
                        <td className="px-3 py-1.5 text-muted-foreground hidden md:table-cell truncate max-w-[180px]">
                          {row.direccion || "—"}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground hidden lg:table-cell truncate max-w-[160px]">
                          {row.comentarios || "—"}
                        </td>
                      </tr>
                    ))}
                    {rows.length > 25 && (
                      <tr className="border-t">
                        <td colSpan={4} className="px-3 py-1.5 text-center text-muted-foreground italic text-xs">
                          … y {rows.length - 25} registros más
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className={cn(
              "rounded-lg border p-3 space-y-1.5",
              importResult.imported > 0
                ? "border-green-300 bg-green-50 dark:bg-green-950/20"
                : "border-destructive/30 bg-destructive/5"
            )}>
              {importResult.imported > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  {importResult.imported} {type} importados correctamente
                </div>
              )}
              {importResult.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-destructive">
                  <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {err}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            {importResult ? "Cerrar" : "Cancelar"}
          </Button>
          {rows.length > 0 && !importResult && (
            <Button onClick={handleImport} disabled={isImporting}>
              {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Importar {rows.length} {rows.length === 1 ? "registro" : "registros"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
