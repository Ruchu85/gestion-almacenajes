"use client";

import type { ExportOptions } from "@/types";

// ============================================================
// EXPORTACIÓN A CSV
// ============================================================

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: keyof T; header: string }[],
  options: Partial<ExportOptions> = {}
): void {
  const filename = options.filename ?? "export";

  const headers = columns.map((col) => `"${col.header}"`).join(";");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key];
        if (value == null) return '""';
        const str = String(value).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(";")
  );

  const csvContent = "﻿" + [headers, ...rows].join("\n");
  downloadBlob(csvContent, `${filename}.csv`, "text/csv;charset=utf-8");
}

// ============================================================
// EXPORTACIÓN A EXCEL (usando xlsx)
// ============================================================

export async function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: keyof T; header: string }[],
  options: Partial<ExportOptions> = {}
): Promise<void> {
  const filename = options.filename ?? "export";
  const title = options.title ?? "Datos";

  const XLSX = await import("xlsx");

  const worksheetData = [
    columns.map((col) => col.header),
    ...data.map((row) =>
      columns.map((col) => {
        const value = row[col.key];
        return value ?? "";
      })
    ),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  const colWidths = columns.map((col) => {
    const maxLength = Math.max(
      col.header.length,
      ...data.map((row) => String(row[col.key] ?? "").length)
    );
    return { wch: Math.min(maxLength + 2, 50) };
  });
  worksheet["!cols"] = colWidths;

  if (data.length > 0) {
    const lastCol = XLSX.utils.encode_col(columns.length - 1);
    worksheet["!autofilter"] = { ref: `A1:${lastCol}${data.length + 1}` };
  }

  // Freeze header row
  worksheet["!views"] = [{ state: "frozen", ySplit: 1 }];

  XLSX.utils.book_append_sheet(workbook, worksheet, title);
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// ============================================================
// EXPORTACIÓN A PDF (usando jsPDF + autotable)
// ============================================================

export async function exportToPDF<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: keyof T; header: string }[],
  options: Partial<ExportOptions> = {}
): Promise<void> {
  const filename = options.filename ?? "export";
  const title = options.title ?? "Informe";

  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(16);
  doc.setTextColor(40, 40, 40);
  doc.text(title, 14, 16);

  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Generado: ${new Date().toLocaleDateString("es-ES")}`,
    doc.internal.pageSize.width - 14,
    16,
    { align: "right" }
  );

  autoTable(doc, {
    startY: 22,
    head: [columns.map((col) => col.header)],
    body: data.map((row) =>
      columns.map((col) => {
        const value = row[col.key];
        return value == null ? "" : String(value);
      })
    ),
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${filename}.pdf`);
}

// ============================================================
// UTILIDAD INTERNA
// ============================================================

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
