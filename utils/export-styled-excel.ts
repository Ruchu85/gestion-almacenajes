"use client";

/**
 * Exportación a Excel con formato de tabla cuidado (ExcelJS).
 *
 * Distinta de `exportToExcel` (utils/export.ts, SheetJS): la edición libre de
 * SheetJS no escribe estilos, así que no sirve para un libro presentable.
 *
 * Decisiones de formato:
 *  · Las fechas se escriben como fechas reales de Excel (UTC a medianoche, para
 *    que ninguna zona horaria las desplace un día) y las cantidades como
 *    números: se pueden ordenar, filtrar y sumar.
 *  · Cada hoja lleva título, fila de cabecera fija, autofiltro, filas cebreadas,
 *    bordes suaves, y una fila de totales con SUBTOTAL (respeta los filtros
 *    que el usuario aplique en Excel).
 *  · El total solo se pone cuando todas las filas comparten unidad.
 */

import type { Workbook, Alignment, Border, Fill } from "exceljs";

export type ColumnType = "text" | "date" | "quantity" | "estado";

export interface ExcelColumn<T> {
  header: string;
  /** Texto, fecha ISO (YYYY-MM-DD) o número, según `type`. */
  value: (row: T) => string | number | null | undefined;
  type?: ColumnType;
  /** Ancho fijo en caracteres; si no se da, se ajusta al contenido. */
  width?: number;
  /** Texto largo que debe saltar de línea (comentarios). */
  wrap?: boolean;
  /** Formato monoespaciado para códigos (matrículas, contratos...). */
  mono?: boolean;
}

export interface ExcelSheet<T> {
  name: string;
  title: string;
  /** Color de acento de la hoja (hex sin #). */
  accent: string;
  columns: ExcelColumn<T>[];
  rows: T[];
  /** Si todas las filas comparten una unidad, se muestra y se totaliza. */
  unit?: string | null;
}

export interface ExcelSummary {
  title: string;
  subtitle: string;
  filters: { label: string; value: string }[];
  notes?: string[];
}

// ─── Paleta ──────────────────────────────────────────────────────────────────

const FONT = "Calibri";
const C = {
  header: "1E293B",
  headerText: "FFFFFF",
  zebra: "F1F5F9",
  white: "FFFFFF",
  border: "D5DCE6",
  text: "0F172A",
  muted: "64748B",
  totalBg: "E2E8F0",
} as const;

const ESTADOS: Record<string, { label: string; font: string; bg: string }> = {
  abierta: { label: "Abierta", font: "166534", bg: "DCFCE7" },
  finalizada: { label: "Finalizada", font: "1D4ED8", bg: "DBEAFE" },
  cerrada_manual: { label: "Cerrada", font: "475569", bg: "E2E8F0" },
  traspasada: { label: "Traspasada", font: "92400E", bg: "FEF3C7" },
};

const solid = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${argb}` } });
const thin = (argb: string = C.border): Partial<Border> => ({ style: "thin", color: { argb: `FF${argb}` } });
const boxBorders = (argb?: string) => ({ top: thin(argb), left: thin(argb), bottom: thin(argb), right: thin(argb) });

/** Fecha ISO → Date en UTC a medianoche (Excel la muestra sin desfase horario). */
function isoToExcelDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Letra de columna de Excel (1 → A, 27 → AA). */
function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellText(v: string | number | null | undefined, type: ColumnType): string {
  if (v == null) return "";
  if (type === "date") return "00/00/0000";
  if (type === "quantity") return typeof v === "number" ? v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : String(v);
  if (type === "estado") return ESTADOS[String(v)]?.label ?? String(v);
  return String(v);
}

function autoWidth<T>(col: ExcelColumn<T>, rows: T[]): number {
  if (col.width) return col.width;
  const type = col.type ?? "text";
  let max = col.header.length + 3; // hueco para el icono del filtro
  for (const row of rows) {
    max = Math.max(max, cellText(col.value(row), type).length + 2);
  }
  return Math.min(Math.max(max, 11), col.wrap ? 48 : 42);
}

// ─── Hojas ───────────────────────────────────────────────────────────────────

const HEADER_ROW = 4;

function buildDataSheet<T>(wb: Workbook, sheet: ExcelSheet<T>, generatedAt: string): void {
  const ws = wb.addWorksheet(sheet.name, {
    properties: { tabColor: { argb: `FF${sheet.accent}` }, defaultRowHeight: 20 },
    views: [{ state: "frozen", ySplit: HEADER_ROW, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddFooter: "&L&8GestiPuertos&C&8Página &P de &N&R&8&D",
    },
  });

  const cols = sheet.columns;
  const lastCol = cols.length;
  const lastLetter = colLetter(lastCol);

  cols.forEach((col, i) => {
    ws.getColumn(i + 1).width = autoWidth(col, sheet.rows);
  });

  // Fila 1: título con banda de acento
  ws.mergeCells(`A1:${lastLetter}1`);
  const title = ws.getCell("A1");
  title.value = sheet.title;
  title.font = { name: FONT, size: 16, bold: true, color: { argb: `FF${C.text}` } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 34;

  // Fila 2: subtítulo
  ws.mergeCells(`A2:${lastLetter}2`);
  const sub = ws.getCell("A2");
  sub.value = `${sheet.rows.length} ${sheet.rows.length === 1 ? "registro" : "registros"}  ·  Generado el ${generatedAt}`;
  sub.font = { name: FONT, size: 10, color: { argb: `FF${C.muted}` } };
  sub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 18;

  // Fila 3: filete de acento
  ws.getRow(3).height = 5;
  for (let c = 1; c <= lastCol; c++) ws.getCell(3, c).fill = solid(sheet.accent);

  // Cabecera
  const header = ws.getRow(HEADER_ROW);
  header.height = 28;
  cols.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: `FF${C.headerText}` } };
    cell.fill = solid(C.header);
    cell.border = { ...boxBorders(C.header), bottom: { style: "medium", color: { argb: `FF${sheet.accent}` } } };
    const type = col.type ?? "text";
    cell.alignment = {
      vertical: "middle",
      horizontal: type === "quantity" ? "right" : type === "date" || type === "estado" ? "center" : "left",
      indent: type === "text" ? 1 : 0,
      wrapText: true,
    };
  });

  // Datos
  sheet.rows.forEach((row, r) => {
    const excelRow = ws.getRow(HEADER_ROW + 1 + r);
    const bg = solid(r % 2 === 0 ? C.white : C.zebra);
    let maxLines = 1;

    cols.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      const type = col.type ?? "text";
      const raw = col.value(row);
      const align: Partial<Alignment> = { vertical: "middle" };

      if (type === "date") {
        const d = typeof raw === "string" ? isoToExcelDate(raw) : null;
        cell.value = d;
        cell.numFmt = "dd/mm/yyyy";
        align.horizontal = "center";
      } else if (type === "quantity") {
        cell.value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
        cell.numFmt = '#,##0.00;[Red]-#,##0.00';
        align.horizontal = "right";
        align.indent = 1;
      } else if (type === "estado") {
        const e = ESTADOS[String(raw ?? "")];
        cell.value = e?.label ?? (raw == null ? "" : String(raw));
        align.horizontal = "center";
        cell.font = { name: FONT, size: 10, bold: true, color: { argb: `FF${e?.font ?? C.muted}` } };
        cell.fill = solid(e?.bg ?? C.zebra);
      } else {
        const text = raw == null || raw === "" ? "—" : String(raw);
        cell.value = text;
        align.horizontal = "left";
        align.indent = 1;
        if (col.wrap) {
          align.wrapText = true;
          align.vertical = "top";
          const width = ws.getColumn(i + 1).width ?? 40;
          maxLines = Math.max(maxLines, Math.ceil(text.length / Math.max(width - 2, 10)));
        }
      }

      cell.alignment = align;
      if (type !== "estado") {
        cell.font = {
          name: col.mono ? "Consolas" : FONT,
          size: 10,
          bold: !!col.mono && i === 0,
          color: { argb: `FF${C.text}` },
        };
        cell.fill = bg;
      }
      cell.border = boxBorders();
    });

    excelRow.height = Math.min(Math.max(20, maxLines * 14 + 6), 90);
  });

  const firstData = HEADER_ROW + 1;
  const lastData = HEADER_ROW + sheet.rows.length;

  // Totales (SUBTOTAL respeta los filtros de Excel)
  const qtyIdx = cols.findIndex((c) => c.type === "quantity");
  if (sheet.rows.length > 0 && qtyIdx >= 0 && sheet.unit) {
    const totalRow = ws.getRow(lastData + 1);
    totalRow.height = 24;
    for (let c = 1; c <= lastCol; c++) {
      const cell = totalRow.getCell(c);
      cell.fill = solid(C.totalBg);
      cell.border = { top: { style: "medium", color: { argb: `FF${sheet.accent}` } }, bottom: thin(), left: thin(), right: thin() };
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: `FF${C.text}` } };
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    }
    totalRow.getCell(1).value = "TOTAL";
    const qCol = qtyIdx + 1;
    const letter = colLetter(qCol);
    const result = sheet.rows.reduce((s, row) => {
      const v = cols[qtyIdx].value(row);
      return s + (typeof v === "number" ? v : 0);
    }, 0);
    const q = totalRow.getCell(qCol);
    q.value = { formula: `SUBTOTAL(109,${letter}${firstData}:${letter}${lastData})`, result };
    q.numFmt = `#,##0.00 "${sheet.unit}"`;
    q.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  }

  // Autofiltro sobre cabecera + datos
  if (sheet.rows.length > 0) {
    ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: lastData, column: lastCol } };
  }
}

function buildSummarySheet(
  wb: Workbook,
  summary: ExcelSummary,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheets: ExcelSheet<any>[],
  generatedAt: string
): void {
  const ws = wb.addWorksheet("Resumen", {
    properties: { tabColor: { argb: `FF${C.header}` }, defaultRowHeight: 20 },
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.getColumn(1).width = 2;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 46;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 20;

  ws.mergeCells("B2:E2");
  const t = ws.getCell("B2");
  t.value = summary.title;
  t.font = { name: FONT, size: 20, bold: true, color: { argb: `FF${C.text}` } };
  t.alignment = { vertical: "middle" };
  ws.getRow(2).height = 36;

  ws.mergeCells("B3:E3");
  const s = ws.getCell("B3");
  s.value = `${summary.subtitle}  ·  Generado el ${generatedAt}`;
  s.font = { name: FONT, size: 10, color: { argb: `FF${C.muted}` } };

  ws.getRow(4).height = 6;
  for (let c = 2; c <= 5; c++) ws.getCell(4, c).fill = solid("2563EB");

  const sectionTitle = (row: number, text: string) => {
    ws.mergeCells(`B${row}:E${row}`);
    const c = ws.getCell(`B${row}`);
    c.value = text;
    c.font = { name: FONT, size: 12, bold: true, color: { argb: `FF${C.text}` } };
    c.alignment = { vertical: "bottom" };
    ws.getRow(row).height = 28;
  };

  // Filtros aplicados
  let row = 6;
  sectionTitle(row++, "Filtros aplicados");
  summary.filters.forEach((f, i) => {
    ws.mergeCells(`C${row}:E${row}`);
    const a = ws.getCell(`B${row}`);
    const b = ws.getCell(`C${row}`);
    a.value = f.label;
    b.value = f.value;
    a.font = { name: FONT, size: 10, bold: true, color: { argb: `FF${C.muted}` } };
    b.font = { name: FONT, size: 10, color: { argb: `FF${C.text}` } };
    a.alignment = { vertical: "middle", indent: 1 };
    b.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    for (const col of [2, 3, 4, 5]) {
      const cell = ws.getCell(row, col);
      cell.fill = solid(i % 2 === 0 ? C.white : C.zebra);
      cell.border = boxBorders();
    }
    row++;
  });

  // Contenido del libro
  row++;
  sectionTitle(row++, "Contenido del libro");
  const head = ["Hoja", "Descripción", "Registros", "Total cantidad"];
  head.forEach((h, i) => {
    const cell = ws.getCell(row, 2 + i);
    cell.value = h;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: `FF${C.headerText}` } };
    cell.fill = solid(C.header);
    cell.border = boxBorders(C.header);
    cell.alignment = { vertical: "middle", horizontal: i >= 2 ? "right" : "left", indent: 1 };
  });
  ws.getRow(row).height = 24;
  row++;

  sheets.forEach((sh, i) => {
    const qty = sh.columns.find((c) => c.type === "quantity");
    const total = qty && sh.unit ? sh.rows.reduce((acc, r) => acc + (Number(qty.value(r)) || 0), 0) : null;
    const cells = [
      ws.getCell(row, 2),
      ws.getCell(row, 3),
      ws.getCell(row, 4),
      ws.getCell(row, 5),
    ];
    cells[0].value = { text: sh.name, hyperlink: `#'${sh.name}'!A1` };
    cells[0].font = { name: FONT, size: 10, bold: true, color: { argb: `FF${sh.accent}` }, underline: true };
    cells[1].value = sh.title;
    cells[2].value = sh.rows.length;
    cells[2].numFmt = "#,##0";
    if (total != null) {
      cells[3].value = total;
      cells[3].numFmt = `#,##0.00 "${sh.unit}"`;
    } else {
      cells[3].value = "—";
    }
    cells.forEach((cell, k) => {
      if (k > 0) cell.font = { name: FONT, size: 10, color: { argb: `FF${C.text}` } };
      cell.fill = solid(i % 2 === 0 ? C.white : C.zebra);
      cell.border = boxBorders();
      cell.alignment = { vertical: "middle", horizontal: k >= 2 ? "right" : "left", indent: 1 };
    });
    row++;
  });

  // Avisos
  if (summary.notes && summary.notes.length > 0) {
    row++;
    sectionTitle(row++, "Avisos");
    for (const note of summary.notes) {
      ws.mergeCells(`B${row}:E${row}`);
      const c = ws.getCell(`B${row}`);
      c.value = note;
      c.font = { name: FONT, size: 10, color: { argb: "FF92400E" } };
      c.fill = solid("FEF3C7");
      c.alignment = { vertical: "middle", wrapText: true, indent: 1 };
      ws.getRow(row).height = 32;
      row++;
    }
  }
}

// ─── API pública ─────────────────────────────────────────────────────────────

export interface StyledExcelOptions {
  filename: string;
  summary: ExcelSummary;
  sheets: ExcelSheet<any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Genera el libro y lo descarga. Solo se crean las hojas con registros. */
export async function exportStyledExcel({ filename, summary, sheets }: StyledExcelOptions): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "GestiPuertos";
  wb.created = new Date();

  const generatedAt = new Date().toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const nonEmpty = sheets.filter((s) => s.rows.length > 0);
  buildSummarySheet(wb, summary, nonEmpty, generatedAt);
  for (const sheet of nonEmpty) buildDataSheet(wb, sheet, generatedAt);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
