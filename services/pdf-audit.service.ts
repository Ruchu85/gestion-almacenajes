import type { PdfExtractedLine } from "@/validations/pdf-import.schema";
import type {
  AuditFinding,
  AuditLineResult,
  AuditLineStatus,
  AuditMatchKey,
  AuditTotals,
  PesadaVerificacion,
  RegisteredMovement,
  TotalDeclarado,
} from "@/validations/pdf-audit.schema";
import { formatNumber } from "@/utils/format";

// ============================================================
// NORMALIZADORES
// ============================================================

/** Matrícula comparable: mayúsculas y solo alfanuméricos. */
export function normMatricula(value: string | null | undefined): string {
  if (!value) return "";
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Nº de ticket comparable: sin ceros a la izquierda ni separadores. */
export function normTicket(value: string | null | undefined): string {
  if (!value) return "";
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.replace(/^0+(?=\d)/, "");
}

/**
 * Nº de ticket que la importación dejó escrito en el comentario del
 * movimiento ("… · Ticket 59800 · Remolque R0437BDS · …").
 */
export function extractTicketFromComment(comment: string | null | undefined): string | null {
  if (!comment) return null;
  const m = comment.match(/Ticket\s+([A-Za-z0-9-]+)/i);
  return m ? m[1] : null;
}

/**
 * Matrícula escrita dentro del comentario. Las salidas directas importadas
 * desde PDF dejan la columna `matricula` a null y la guardan en el texto
 * ("Salida propia — matrícula: 7534KTZ — …").
 */
export function extractMatriculaFromComment(comment: string | null | undefined): string | null {
  if (!comment) return null;
  const m = comment.match(/matr[ií]cula:?\s*([A-Za-z0-9-]+)/i);
  return m ? m[1] : null;
}

/** Redondeo a 3 decimales, la precisión con la que se guardan las cantidades. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Diferencia máxima admitida entre la cantidad del PDF y la registrada para
 * considerar que cuadran: 0,005 unidades (5 kg cuando se trabaja en toneladas).
 * Muy por encima del ruido de coma flotante y del redondeo de la conversión,
 * y muy por debajo de cualquier error de dígito real (el menor, en el dígito
 * de las centenas de kilo, ya son 0,1 tns).
 */
const TOLERANCIA_CANTIDAD = 0.005;

// ============================================================
// CONFUSIÓN DE DÍGITOS
// ============================================================

/**
 * Pares de dígitos que se confunden al leer un documento escaneado o de baja
 * calidad. Son los que comparten trazo: el 6 y el 8 con el bucle cerrado, el 3
 * y el 8 con las dos curvas, el 1 y el 7 con el asta vertical.
 */
const DIGIT_CONFUSIONS: ReadonlyArray<readonly [string, string]> = [
  ["0", "6"], ["0", "8"], ["0", "9"],
  ["1", "4"], ["1", "7"],
  ["2", "7"],
  ["3", "8"], ["3", "9"],
  ["4", "9"],
  ["5", "6"], ["5", "8"],
  ["6", "8"],
  ["8", "9"],
];

function areConfusable(a: string, b: string): boolean {
  return DIGIT_CONFUSIONS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

/**
 * Cadena de dígitos de un número, con los decimales pegados y sin signo, para
 * poder comparar dos valores posición a posición. 29300 → "29300000".
 */
function digitString(value: number): string {
  return Math.abs(value).toFixed(3).replace(".", "");
}

export type DigitAnomalyKind = "sustitucion" | "transposicion" | "magnitud";

export interface DigitAnomaly {
  kind: DigitAnomalyKind;
  /** Descripción corta del cambio: "3↔8", "dígitos contiguos", "×10". */
  detail: string;
}

/**
 * Determina si `target` puede obtenerse de `value` por un error de lectura
 * típico: la sustitución de un único dígito por otro con el que se confunde,
 * el intercambio de dos dígitos contiguos, o un error de magnitud (una cifra
 * de más o de menos). Devuelve null si no hay explicación plausible.
 */
export function explainDigitChange(value: number, target: number): DigitAnomaly | null {
  if (value === target) return null;

  // Error de magnitud: se ha perdido o añadido un cero / desplazado la coma.
  if (Math.abs(target - value * 10) < 0.0005) return { kind: "magnitud", detail: "×10" };
  if (Math.abs(target - value / 10) < 0.0005) return { kind: "magnitud", detail: "÷10" };

  const a = digitString(value);
  const b = digitString(target);
  if (a.length !== b.length) return null;

  const diffs: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diffs.push(i);
    if (diffs.length > 2) return null;
  }

  if (diffs.length === 1) {
    const i = diffs[0];
    if (areConfusable(a[i], b[i])) {
      return { kind: "sustitucion", detail: `${a[i]}↔${b[i]}` };
    }
    return null;
  }

  // Transposición de dos dígitos contiguos: 29.380 leído como 29.830.
  if (diffs.length === 2 && diffs[1] === diffs[0] + 1) {
    const [i, j] = diffs;
    if (a[i] === b[j] && a[j] === b[i]) {
      return { kind: "transposicion", detail: `${a[i]}${a[j]} → ${b[i]}${b[j]}` };
    }
  }

  return null;
}

/** Valor tal cual está impreso en el PDF (kg), antes de convertir a la unidad del sistema. */
function printedValue(line: PdfExtractedLine): number {
  return line.cantidad_origen ?? line.cantidad;
}

function printedUnit(line: PdfExtractedLine): string {
  return line.unidad_origen ?? line.unidad ?? "";
}

export interface DigitSuspicion {
  lineId: string;
  ticket: string | null;
  matricula: string;
  leido: number;
  propuesto: number;
  unidad: string;
  anomaly: DigitAnomaly;
}

/**
 * Busca qué línea explicaría, ella sola, un descuadre `delta` entre la suma de
 * las pesadas y el total declarado por el documento.
 *
 * Si al corregir una única línea el total cuadra EXACTAMENTE, y además la
 * corrección es un error de lectura típico, tenemos señalado el fallo con
 * nombre y apellidos. El cálculo se hace sobre los valores impresos en el PDF
 * (kilos), que son los dígitos que el modelo ha tenido que leer.
 */
export function findDigitSuspicions(
  lines: PdfExtractedLine[],
  ids: string[],
  deltaPrinted: number
): DigitSuspicion[] {
  if (Math.abs(deltaPrinted) < 0.0005) return [];

  const suspicions: DigitSuspicion[] = [];
  lines.forEach((line, i) => {
    const leido = printedValue(line);
    const propuesto = round3(leido + deltaPrinted);
    if (propuesto <= 0) return;

    const anomaly = explainDigitChange(leido, propuesto);
    if (!anomaly) return;

    suspicions.push({
      lineId: ids[i],
      ticket: line.ticket ?? null,
      matricula: line.matricula,
      leido,
      propuesto,
      unidad: printedUnit(line),
      anomaly,
    });
  });

  return suspicions;
}

// ============================================================
// CONTRASTE ENTRE LAS DOS PASADAS DE EXTRACCIÓN
// ============================================================

export interface PassComparison {
  /** Por id de línea: lo que leyó la segunda pasada. */
  byLineId: Map<string, { neto: number; coincide: boolean }>;
  /** Pesadas que solo vio la segunda pasada (la primera se las dejó). */
  soloEnVerificacion: PesadaVerificacion[];
}

/**
 * Cruza la extracción principal con la pasada de verificación. Ambas leen el
 * mismo documento con prompts distintos, así que una cantidad que no coincide
 * entre las dos es una cifra que el modelo no lee de forma estable: justo el
 * síntoma de un dígito ambiguo.
 *
 * El cruce va por ticket y, si el documento no los trae, por matrícula.
 * Las cantidades se comparan en la unidad impresa (la que devuelven ambas).
 */
export function compareExtractionPasses(
  lines: PdfExtractedLine[],
  ids: string[],
  pesadas: PesadaVerificacion[]
): PassComparison {
  const byLineId = new Map<string, { neto: number; coincide: boolean }>();
  const usadas = new Set<number>();

  const findPesada = (line: PdfExtractedLine): number => {
    const ticket = normTicket(line.ticket);
    if (ticket) {
      const idx = pesadas.findIndex((p, i) => !usadas.has(i) && normTicket(p.ticket) === ticket);
      if (idx >= 0) return idx;
    }
    const matricula = normMatricula(line.matricula);
    if (matricula) {
      const idx = pesadas.findIndex(
        (p, i) => !usadas.has(i) && normMatricula(p.matricula) === matricula
      );
      if (idx >= 0) return idx;
    }
    return -1;
  };

  lines.forEach((line, i) => {
    const idx = findPesada(line);
    if (idx < 0) return;
    usadas.add(idx);

    const neto = pesadas[idx].neto;
    const coincide = Math.abs(neto - printedValue(line)) < 0.5;
    byLineId.set(ids[i], { neto, coincide });
  });

  const soloEnVerificacion = pesadas.filter((_, i) => !usadas.has(i));
  return { byLineId, soloEnVerificacion };
}

// ============================================================
// CUADRE CONTRA LOS TOTALES DECLARADOS
// ============================================================

/**
 * Conceptos de total que representan lo retirado. Incluye la fila "Totales" del
 * "Informe de Salidas a Vendedor", que es la que permite cuadrar ese formato
 * (y la que delata una línea de devolución perdida).
 */
const CONCEPTOS_RETIRADA = /RET\.?\s*D[ÍI]A|RETIRAD|SALIDAS?\s*D[ÍI]A|TOTAL/i;

/**
 * Cuadra la suma de las pesadas extraídas contra el total que el propio
 * documento declara ("RET. DIA: 295.660"). Trabaja en la unidad impresa.
 */
export function reconcileTotals(
  lines: PdfExtractedLine[],
  totales: TotalDeclarado[]
): { totals: AuditTotals; deltaPrinted: number } {
  const extraido = round3(lines.reduce((acc, l) => acc + printedValue(l), 0));
  const unidad = lines.length > 0 ? printedUnit(lines[0]) || "kg" : "kg";

  const relevantes = totales.filter((t) => CONCEPTOS_RETIRADA.test(t.concepto));
  const declarado =
    relevantes.length > 0 ? round3(relevantes.reduce((acc, t) => acc + t.valor, 0)) : null;

  if (declarado === null) {
    return {
      totals: { declarado: null, extraido, unidad, diferencia: null, cuadra: true },
      deltaPrinted: 0,
    };
  }

  const diferencia = round3(declarado - extraido);
  return {
    totals: {
      declarado,
      extraido,
      unidad,
      diferencia,
      cuadra: Math.abs(diferencia) < 0.5,
    },
    deltaPrinted: diferencia,
  };
}

// ============================================================
// VEROSIMILITUD DE LAS CANTIDADES
// ============================================================

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Señala las pesadas que se salen del orden de magnitud del resto del lote.
 * Un camión carga siempre cantidades parecidas, así que un valor diez veces
 * mayor o menor que la mediana delata un punto decimal o una unidad mal leídos.
 * Necesita al menos 4 líneas para que la mediana signifique algo.
 */
export function checkPlausibility(
  lines: PdfExtractedLine[],
  ids: string[]
): Map<string, AuditFinding> {
  const findings = new Map<string, AuditFinding>();

  // Las devoluciones (negativas) no entran: ni distorsionan la mediana ni tiene
  // sentido compararlas con ella, y ya van señaladas como línea negativa.
  const positivas = lines.filter((l) => l.cantidad > 0);
  if (positivas.length < 4) return findings;

  const med = median(positivas.map((l) => l.cantidad));
  if (med <= 0) return findings;

  lines.forEach((line, i) => {
    if (line.cantidad < 0) return;
    const ratio = line.cantidad / med;
    if (ratio >= 0.25 && ratio <= 2.5) return;

    const esMagnitud = ratio >= 8 || ratio <= 0.125;
    findings.set(ids[i], {
      level: esMagnitud ? "error" : "warning",
      code: "cantidad_atipica",
      message: esMagnitud
        ? `La cantidad (${formatNumber(line.cantidad)}) es ${
            ratio > 1 ? "unas " + Math.round(ratio) + " veces mayor" : "una fracción"
          } que la del resto de pesadas del documento (mediana ${formatNumber(
            med
          )}). Posible error de punto decimal o de unidad.`
        : `La cantidad (${formatNumber(line.cantidad)}) se aparta bastante de la mediana del documento (${formatNumber(
            med
          )}). Compruébala.`,
    });
  });

  return findings;
}

// ============================================================
// RECONCILIACIÓN CONTRA LO YA REGISTRADO
// ============================================================

function cantidadCuadra(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCIA_CANTIDAD;
}

interface MatchAttempt {
  registered: RegisteredMovement;
  key: AuditMatchKey;
  duplicados: number;
}

/**
 * Busca en los movimientos registrados el que corresponde a una línea del PDF.
 * Se intenta por orden de fiabilidad: el ticket es único por pesada, así que
 * manda; si el documento no lo trae, se cae a matrícula + fecha, y se afina con
 * la cantidad cuando hay varias del mismo camión el mismo día.
 */
function findRegistered(
  line: PdfExtractedLine,
  pool: RegisteredMovement[],
  consumidos: Set<string>
): MatchAttempt | null {
  const disponibles = pool.filter((r) => !consumidos.has(r.id));

  const ticket = normTicket(line.ticket);
  if (ticket) {
    const porTicket = disponibles.filter((r) => normTicket(r.ticket) === ticket);
    if (porTicket.length > 0) {
      return { registered: porTicket[0], key: "ticket", duplicados: porTicket.length };
    }
  }

  const matricula = normMatricula(line.matricula);
  if (!matricula) return null;

  const porMatriculaFecha = disponibles.filter(
    (r) => normMatricula(r.matricula) === matricula && r.fecha === line.fecha
  );

  if (porMatriculaFecha.length === 1) {
    return { registered: porMatriculaFecha[0], key: "matricula_fecha", duplicados: 1 };
  }

  if (porMatriculaFecha.length > 1) {
    // Varias salidas del mismo camión ese día: desempata la cantidad.
    const exacta = porMatriculaFecha.filter((r) => cantidadCuadra(r.cantidad, line.cantidad));
    if (exacta.length >= 1) {
      return {
        registered: exacta[0],
        key: "matricula_fecha_cantidad",
        duplicados: exacta.length,
      };
    }
    return {
      registered: porMatriculaFecha[0],
      key: "matricula_fecha",
      duplicados: porMatriculaFecha.length,
    };
  }

  return null;
}

/**
 * Clasifica cada línea del PDF contra los movimientos ya grabados y devuelve
 * también los registros del sistema que ninguna línea ha reclamado.
 *
 * No escribe nada: es una comparación pura.
 */
export function reconcileLines(
  lines: PdfExtractedLine[],
  ids: string[],
  registered: RegisteredMovement[],
  extras: {
    verificacion: PassComparison;
    plausibilidad: Map<string, AuditFinding>;
    sospechas: DigitSuspicion[];
  }
): { results: AuditLineResult[]; sobrantes: RegisteredMovement[] } {
  const consumidos = new Set<string>();
  const sospechasPorLinea = new Map<string, DigitSuspicion>();
  for (const s of extras.sospechas) sospechasPorLinea.set(s.lineId, s);

  const results = lines.map((line, i) => {
    const id = ids[i];
    const findings: AuditFinding[] = [];

    const attempt = findRegistered(line, registered, consumidos);
    if (attempt) consumidos.add(attempt.registered.id);

    let status: AuditLineStatus;
    let diferencia: number | null = null;

    if (!attempt) {
      status = "no_registrada";
    } else if (attempt.duplicados > 1 && attempt.key === "ticket") {
      status = "duplicada";
      diferencia = round3(line.cantidad - attempt.registered.cantidad);
    } else if (!cantidadCuadra(line.cantidad, attempt.registered.cantidad)) {
      status = "cantidad_distinta";
      diferencia = round3(line.cantidad - attempt.registered.cantidad);
    } else if (attempt.registered.fecha !== line.fecha) {
      status = "fecha_distinta";
      diferencia = 0;
    } else {
      status = "ok";
      diferencia = round3(line.cantidad - attempt.registered.cantidad);
    }

    // Segunda lectura discrepante: la cifra no es estable.
    const verificacion = extras.verificacion.byLineId.get(id) ?? null;
    if (verificacion && !verificacion.coincide) {
      findings.push({
        level: "error",
        code: "lectura_inestable",
        message:
          `Las dos lecturas del PDF no coinciden: ${formatNumber(printedValue(line))} ` +
          `frente a ${formatNumber(verificacion.neto)} ${printedUnit(line)}. ` +
          `Comprueba esta cantidad en el documento original.`,
      });
    }

    const sospecha = sospechasPorLinea.get(id);
    if (sospecha) {
      findings.push({
        level: "warning",
        code: "sospecha_digito",
        message:
          `El total del documento cuadraría exactamente si esta pesada fuese ` +
          `${formatNumber(sospecha.propuesto)} en vez de ${formatNumber(sospecha.leido)} ` +
          `${sospecha.unidad} (${
            sospecha.anomaly.kind === "sustitucion"
              ? `posible confusión ${sospecha.anomaly.detail}`
              : sospecha.anomaly.kind === "transposicion"
                ? `posible transposición ${sospecha.anomaly.detail}`
                : `posible error de magnitud ${sospecha.anomaly.detail}`
          }).`,
      });
    }

    const plausibilidad = extras.plausibilidad.get(id);
    if (plausibilidad) findings.push(plausibilidad);

    if (!line.ticket) {
      findings.push({
        level: "info",
        code: "sin_ticket",
        message:
          "El documento no trae nº de ticket para esta línea; se ha reconciliado por matrícula y fecha, que es menos fiable.",
      });
    }

    return {
      id,
      ticket: line.ticket ?? null,
      matricula: line.matricula,
      fecha: line.fecha,
      cliente: line.cliente ?? null,
      cantidad: line.cantidad,
      cantidadOrigen: line.cantidad_origen ?? null,
      unidadOrigen: line.unidad_origen ?? line.unidad ?? null,
      status,
      registered: attempt?.registered ?? null,
      matchedBy: attempt?.key ?? null,
      diferencia,
      verificacion,
      findings,
    } satisfies AuditLineResult;
  });

  const sobrantes = registered.filter((r) => !consumidos.has(r.id));
  return { results, sobrantes };
}
