/**
 * Motor de extracción de salidas de puerto desde un Excel estructurado
 * (equivalente determinista a `lib/gemini.ts`, pero sin IA: el Excel ya trae
 * celdas reales, no hace falta "leer" nada).
 *
 * Alcance actual: una única plantilla, la hoja "SALIDAS MATERIAL" del informe
 * "Consignatarios & Estibadores & Aduanas" (MARÍTIMA DEL PRINCIPADO). Detecta
 * la fila de cabecera por nombre de columna (no por posición fija) para
 * tolerar pequeñas variaciones, y localiza la hoja/tabla de movimientos
 * buscando las columnas ancla en vez de asumir un nombre de hoja fijo.
 */
import * as XLSXNamespace from "xlsx";
import type { PdfExtractedLine } from "@/validations/pdf-import.schema";

/**
 * `xlsx` es un paquete CJS. Bajo interop de módulos ES nativo (no bundlers),
 * propiedades como `SSF` no siempre aparecen en el namespace import — solo
 * en `default`, que sí conserva el `module.exports` completo. Se resuelve
 * así para funcionar igual en cualquier entorno (Node directo o bundler).
 */
const XLSX = ((XLSXNamespace as unknown as { default?: typeof XLSXNamespace }).default ??
  XLSXNamespace) as typeof XLSXNamespace & { SSF: { parse_date_code: (n: number) => { y: number; m: number; d: number } | null } };

// ============================================================
// FUENTES CONOCIDAS (mapeo texto de cabecera → almacén)
// ============================================================

/**
 * El logo del emisor ("MARÍTIMA DEL PRINCIPADO") es una imagen incrustada en
 * el Excel: no aparece en ninguna celda. Lo que sí es texto estable es la
 * razón social/email de la cabecera, así que el almacén se detecta por ahí.
 */
const KNOWN_EXCEL_SOURCES: Array<{ match: RegExp; almacenName: string }> = [
  {
    match: /MARPRIN\.COM|CONSIGNATARIOS\s*&?\s*ESTIBADORES\s*&?\s*ADUANAS/i,
    almacenName: "MARÍTIMA DEL PRINCIPADO",
  },
];

// ============================================================
// NORMALIZACIÓN DE TEXTO (cabeceras y detección de fuente)
// ============================================================

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function normHeader(value: unknown): string {
  if (value === null || value === undefined) return "";
  return stripAccents(String(value).toUpperCase())
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

// ============================================================
// FECHAS — serial de Excel → YYYY-MM-DD, sin pasar por Date/huso horario
// ============================================================

/**
 * Convierte un serial de fecha de Excel a YYYY-MM-DD operando solo con
 * enteros (año/mes/día), sin construir nunca un `Date` de JS. Se comprobó
 * empíricamente que `XLSX.read(..., { cellDates: true })` + `toISOString()`
 * desplaza la fecha un día en este entorno (huso horario de España): la
 * misma clase de bug ya documentada para `addDaysISO` en `utils/calculations.ts`.
 * `XLSX.SSF.parse_date_code` es puro cálculo de calendario, sin ese riesgo.
 */
function excelSerialToISO(serial: unknown): string | null {
  const n = typeof serial === "number" ? serial : Number(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  const parsed = XLSX.SSF.parse_date_code(n);
  if (!parsed) return null;
  const y = String(parsed.y).padStart(4, "0");
  const m = String(parsed.m).padStart(2, "0");
  const d = String(parsed.d).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ============================================================
// LOCALIZACIÓN DE LA TABLA DE MOVIMIENTOS
// ============================================================

/** Columnas ancla que identifican, sin ambigüedad, la fila de headers de movimientos. */
const MOVIMIENTOS_ANCHOR = ["FECHA", "MATRICULA", "NETO"];
/** Columnas ancla que identifican la fila de cabecera BARCO/CLIENTE/MERCANCIA. */
const CABECERA_ANCHOR = ["BARCO", "MERCANCIA"];

interface ColumnMap {
  [key: string]: number;
}

function buildColumnMap(headerRow: unknown[]): ColumnMap {
  const map: ColumnMap = {};
  headerRow.forEach((cell, idx) => {
    const h = normHeader(cell);
    if (h) map[h] = idx;
  });
  return map;
}

function findColumn(map: ColumnMap, ...candidates: string[]): number {
  for (const c of candidates) {
    if (map[c] !== undefined) return map[c];
    const found = Object.keys(map).find((k) => k.includes(c));
    if (found) return map[found];
  }
  return -1;
}

function rowHasAllAnchors(row: unknown[], anchors: string[]): boolean {
  const normalized = row.map((c) => normHeader(c));
  return anchors.every((a) => normalized.some((h) => h.includes(a)));
}

export interface ParsedSalidasExcel {
  lineas: PdfExtractedLine[];
  almacenDetectado: string | null;
  productoDetectado: string | null;
  barco: string | null;
  fechaMin: string | null;
  fechaMax: string | null;
  /** Avisos no bloqueantes (filas omitidas por datos incompletos, etc.). */
  warnings: string[];
}

const MAX_ROWS = 5000;

/**
 * Analiza un Excel de salidas de puerto (plantilla "SALIDAS MATERIAL") y
 * devuelve las líneas extraídas, sin tocar la base de datos. Lanza `Error`
 * con mensaje legible si no encuentra la tabla de movimientos esperada.
 */
export function parseSalidasExcel(buffer: Buffer): ParsedSalidasExcel {
  const workbook = XLSX.read(buffer, { type: "buffer" });

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });

    const headerRowIdx = rows.findIndex((r) => rowHasAllAnchors(r, MOVIMIENTOS_ANCHOR));
    if (headerRowIdx === -1) continue; // esta hoja no es la tabla de movimientos

    const colMap = buildColumnMap(rows[headerRowIdx]);
    const idxFecha = findColumn(colMap, "FECHA");
    const idxMatricula = findColumn(colMap, "MATRICULA");
    const idxCliente = findColumn(colMap, "CLIENTE");
    const idxNeto = findColumn(colMap, "NETO");
    const idxAlbaran = findColumn(colMap, "ALBARAN", "N DE ALBARAN");

    if (idxFecha === -1 || idxMatricula === -1 || idxNeto === -1) {
      throw new Error(
        `La hoja "${sheetName}" trae una tabla de movimientos pero faltan columnas obligatorias (FECHA/MATRÍCULA/NETO).`
      );
    }

    // Cabecera BARCO/CLIENTE/MERCANCIA: normalmente unas filas antes, con una
    // única fila de valores justo debajo.
    let productoDetectado: string | null = null;
    let barco: string | null = null;
    const cabeceraIdx = rows
      .slice(0, headerRowIdx)
      .findIndex((r) => rowHasAllAnchors(r, CABECERA_ANCHOR));
    if (cabeceraIdx !== -1) {
      const cabeceraMap = buildColumnMap(rows[cabeceraIdx]);
      const idxMercancia = findColumn(cabeceraMap, "MERCANCIA");
      const idxBarco = findColumn(cabeceraMap, "BARCO");
      const valoresRow = rows[cabeceraIdx + 1] ?? [];
      if (idxMercancia !== -1) productoDetectado = cellText(valoresRow[idxMercancia]) || null;
      if (idxBarco !== -1) barco = cellText(valoresRow[idxBarco]) || null;
    }

    // Almacén: por texto fijo de cabecera del emisor (las primeras filas de la hoja).
    const cabeceraTexto = rows
      .slice(0, headerRowIdx)
      .flat()
      .map((c) => cellText(c))
      .join(" ");
    const fuente = KNOWN_EXCEL_SOURCES.find((s) => s.match.test(cabeceraTexto));
    const almacenDetectado = fuente?.almacenName ?? null;

    // Filas de movimientos: hasta la primera fila sin matrícula ni fecha.
    const lineas: PdfExtractedLine[] = [];
    const warnings: string[] = [];
    let fechaMin: string | null = null;
    let fechaMax: string | null = null;

    for (let i = headerRowIdx + 1; i < Math.min(rows.length, headerRowIdx + 1 + MAX_ROWS); i++) {
      const row = rows[i];
      if (!row || row.length === 0) break;

      const matricula = cellText(row[idxMatricula]);
      const fecha = excelSerialToISO(row[idxFecha]);
      if (!matricula && !fecha) break; // fin de la tabla

      const filaNum = i + 1;
      if (!matricula || !fecha) {
        warnings.push(`Fila ${filaNum}: faltan matrícula o fecha, se omite.`);
        continue;
      }

      const cantidad = Number(row[idxNeto]);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        warnings.push(`Fila ${filaNum}: NETO no es un número válido, se omite.`);
        continue;
      }

      const clienteRaw = idxCliente !== -1 ? cellText(row[idxCliente]) : "";
      const cliente = !clienteRaw || /^LESA/i.test(clienteRaw) ? "" : clienteRaw;

      lineas.push({
        cliente,
        numero_puesta: "",
        almacen: almacenDetectado ?? "",
        producto: productoDetectado ?? "",
        fecha,
        matricula,
        remolque: "",
        ticket: idxAlbaran !== -1 ? cellText(row[idxAlbaran]) : "",
        cantidad,
        unidad: "kg",
      });

      if (!fechaMin || fecha < fechaMin) fechaMin = fecha;
      if (!fechaMax || fecha > fechaMax) fechaMax = fecha;
    }

    if (lineas.length === 0) {
      throw new Error(`La hoja "${sheetName}" no tiene ninguna fila de movimiento válida.`);
    }

    return { lineas, almacenDetectado, productoDetectado, barco, fechaMin, fechaMax, warnings };
  }

  throw new Error(
    'No se ha encontrado ninguna hoja con la tabla de movimientos esperada (columnas "FECHA", "MATRÍCULA" y "NETO").'
  );
}
