import type { PuestaSummary } from "@/types";
import type {
  PdfExtractedLine,
  PdfProposalItem,
  PuestaMatchRef,
  MatchConfidence,
} from "@/validations/pdf-import.schema";
import { formatNumber } from "@/utils/format";

// ============================================================
// NORMALIZADORES
// ============================================================

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Normaliza un nº de contrato/puesta: mayúsculas, sin separadores. */
function normContrato(value: string | null | undefined): string {
  if (!value) return "";
  return stripAccents(value.toUpperCase()).replace(/[^A-Z0-9]/g, "");
}

const LEGAL_SUFFIXES = new Set([
  "SA", "SAU", "SL", "SLU", "SLL", "SAL", "SCOOP", "SC", "CB", "SCA", "SLNE",
]);

/** Normaliza un nombre de cliente: mayúsculas, sin acentos, sin forma jurídica. */
function normCliente(value: string | null | undefined): string {
  if (!value) return "";
  const cleaned = stripAccents(value.toUpperCase())
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.split(" ").filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

/** Coincidencia laxa de cliente: igualdad o uno contiene al otro. */
function clienteMatches(a: string, b: string): boolean {
  const na = normCliente(a);
  const nb = normCliente(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;
  return false;
}

function productoMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normCliente(a ?? "");
  const nb = normCliente(b ?? "");
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// ============================================================
// CONSTRUCCIÓN DE PROPUESTAS
// ============================================================

function toRef(p: PuestaSummary): PuestaMatchRef {
  return {
    puesta_id: p.puesta_id,
    numero_contrato: p.numero_contrato,
    customer_name: p.customer_name,
    product_name: p.product_name,
    unit: p.unit,
    cantidad_pendiente: p.cantidad_pendiente,
    fecha_puesta: p.fecha_puesta,
  };
}

function buildWarnings(line: PdfExtractedLine, ref: PuestaMatchRef | null): string[] {
  const warnings: string[] = [];
  if (ref && line.cantidad > ref.cantidad_pendiente) {
    const exceso = line.cantidad - ref.cantidad_pendiente;
    warnings.push(
      `La cantidad (${formatNumber(line.cantidad)}) supera la pendiente (${formatNumber(
        ref.cantidad_pendiente
      )} ${ref.unit}) en ${formatNumber(exceso)} ${ref.unit}.`
    );
  }
  return warnings;
}

/**
 * Cruza cada línea extraída del PDF contra las puestas ABIERTAS.
 *
 * Estrategia (Contrato + Cliente):
 *  - Match por nº de puesta (contrato) Y cliente   → confianza ALTA.
 *  - Match por contrato pero cliente distinto, o solo por cliente → MEDIA.
 *  - Varias candidatas sin desempate claro          → MEDIA + candidatas.
 *  - Sin candidata                                  → NULA.
 *
 * No accede a la base de datos: recibe las puestas ya cargadas. La detección
 * de duplicados (que sí requiere DB) se añade en la capa de server action.
 */
export function buildProposals(
  lineas: PdfExtractedLine[],
  puestasAbiertas: PuestaSummary[]
): PdfProposalItem[] {
  return lineas.map((line, index) => {
    const id = `${index}-${line.matricula}-${line.cantidad}`;

    // 1. Candidatas por nº de puesta (contrato)
    const lineContrato = normContrato(line.numero_puesta);
    const porContrato = lineContrato
      ? puestasAbiertas.filter((p) => normContrato(p.numero_contrato) === lineContrato)
      : [];

    let match: PuestaMatchRef | null = null;
    let candidates: PuestaMatchRef[] = [];
    let confidence: MatchConfidence = "nula";
    const extraWarnings: string[] = [];

    if (porContrato.length > 0) {
      const conCliente = porContrato.filter((p) => clienteMatches(p.customer_name, line.cliente ?? ""));

      if (conCliente.length === 1) {
        match = toRef(conCliente[0]);
        confidence = "alta";
      } else if (conCliente.length > 1) {
        // Desempate por producto
        const conProducto = conCliente.filter((p) => productoMatches(p.product_name, line.producto));
        if (conProducto.length === 1) {
          match = toRef(conProducto[0]);
          confidence = "alta";
        } else {
          match = toRef(conCliente[0]);
          candidates = conCliente.map(toRef);
          confidence = "media";
          extraWarnings.push("Varias puestas coinciden en contrato y cliente; revisa la seleccionada.");
        }
      } else if (porContrato.length === 1) {
        // Contrato coincide pero el cliente no
        match = toRef(porContrato[0]);
        confidence = "media";
        extraWarnings.push(
          `El nº de puesta coincide pero el cliente del PDF ("${line.cliente}") no cuadra con "${porContrato[0].customer_name}".`
        );
      } else {
        match = toRef(porContrato[0]);
        candidates = porContrato.map(toRef);
        confidence = "media";
        extraWarnings.push("Varias puestas con ese nº; el cliente no desempata. Revisa la seleccionada.");
      }
    } else {
      // 2. Sin contrato: intentar solo por cliente (si hay cliente)
      const hasCliente = !!(line.cliente && line.cliente.trim());
      if (hasCliente) {
        const porCliente = puestasAbiertas.filter((p) => clienteMatches(p.customer_name, line.cliente ?? ""));
        if (porCliente.length === 1) {
          match = toRef(porCliente[0]);
          confidence = "media";
          extraWarnings.push("No se encontró el nº de puesta exacto; emparejado solo por cliente.");
        } else if (porCliente.length > 1) {
          const conProducto = porCliente.filter((p) => productoMatches(p.product_name, line.producto));
          const base = conProducto.length > 0 ? conProducto : porCliente;
          match = toRef(base[0]);
          candidates = base.map(toRef);
          confidence = "media";
          extraWarnings.push("Sin nº de puesta exacto; varias puestas de ese cliente. Elige la correcta.");
        } else {
          confidence = "nula";
          extraWarnings.push("No se encontró ninguna puesta abierta para este cliente / contrato.");
        }
      } else {
        // Sin contrato y sin cliente externo → salida directa (outbound_movement)
        confidence = "nula";
      }
    }

    // Determinar tipo: si no hay contrato, ni cliente externo, ni match → salida normal
    const esNormal =
      !lineContrato &&
      !(line.cliente && line.cliente.trim()) &&
      !match;

    return {
      id,
      tipo: esNormal ? "normal" : "puesta",
      line,
      match,
      candidates,
      confidence,
      warnings: esNormal ? [] : [...extraWarnings, ...buildWarnings(line, match)],
    };
  });
}
