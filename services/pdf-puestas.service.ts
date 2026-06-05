import type {
  PuestaPdfExtraction,
  PuestaProposal,
  MasterRef,
  MasterResolution,
} from "@/validations/pdf-puestas.schema";

// ============================================================
// MAESTROS (forma mínima que necesita el cruce)
// ============================================================

export interface MasterWarehouse { id: string; code: string | null; name: string; }
export interface MasterProduct { id: string; code: string | null; name: string; }
export interface MasterCustomer { id: string; codigo: string | null; name: string; }

export interface MasterData {
  warehouses: MasterWarehouse[];
  products: MasterProduct[];
  customers: MasterCustomer[];
}

// ============================================================
// NORMALIZADORES (mismos criterios que el importador de salidas)
// ============================================================

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Normaliza un texto genérico: mayúsculas, sin acentos, sin símbolos. */
function normText(value: string | null | undefined): string {
  if (!value) return "";
  return stripAccents(value.toUpperCase())
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LEGAL_SUFFIXES = new Set([
  "SA", "SAU", "SL", "SLU", "SLL", "SAL", "SCOOP", "SC", "CB", "SCA", "SLNE",
]);

/** Normaliza un nombre de cliente quitando la forma jurídica (SA, SL, …). */
function normCliente(value: string | null | undefined): string {
  const cleaned = normText(value);
  if (!cleaned) return "";
  const tokens = cleaned.split(" ").filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

/** Coincidencia laxa: igualdad, o uno contiene al otro (con longitud mínima). */
function looseMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.includes(a)) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  return false;
}

// ============================================================
// RESOLUCIÓN GENÉRICA DE UN MAESTRO
// ============================================================

interface Candidate { id: string; code: string | null; name: string; }

/**
 * Resuelve un texto del PDF contra una lista de maestros.
 * Estrategia: código exacto → nombre exacto → coincidencia laxa (candidatas).
 */
function resolveMaster(
  raw: string | null | undefined,
  items: Candidate[],
  normFn: (v: string | null | undefined) => string
): MasterResolution {
  const rawText = raw ?? null;
  const query = normFn(raw);
  if (!query) return { raw: rawText, match: null, candidates: [] };

  const toRef = (c: Candidate): MasterRef => ({
    id: c.id,
    label: c.code ? `[${c.code}] ${c.name}` : c.name,
  });

  // 1) Código exacto
  const byCode = items.filter((c) => c.code && normText(c.code) === normText(raw));
  if (byCode.length === 1) return { raw: rawText, match: toRef(byCode[0]), candidates: [] };

  // 2) Nombre exacto (normalizado)
  const byNameExact = items.filter((c) => normFn(c.name) === query);
  if (byNameExact.length === 1) return { raw: rawText, match: toRef(byNameExact[0]), candidates: [] };

  // 3) Coincidencia laxa
  const loose = items.filter((c) => looseMatch(normFn(c.name), query));
  if (loose.length === 1) return { raw: rawText, match: toRef(loose[0]), candidates: [] };
  if (loose.length > 1) {
    return { raw: rawText, match: toRef(loose[0]), candidates: loose.map(toRef) };
  }

  return { raw: rawText, match: null, candidates: [] };
}

/** Trocea un texto en tokens normalizados. */
function tokensOf(value: string | null | undefined): string[] {
  return normText(value).split(" ").filter(Boolean);
}

/**
 * Resuelve el ALMACÉN como la combinación de transitario + puerto.
 * Un almacén coincide si su nombre/código contiene TODOS los tokens
 * (de transitario y de puerto), en cualquier orden. Ej.: transitario
 * "NOGUEIRA" + puerto "MARIN" → almacén que contenga ambos términos.
 */
function resolveWarehouse(
  transitario: string | null | undefined,
  puerto: string | null | undefined,
  warehouses: MasterWarehouse[]
): MasterResolution {
  const raw = [transitario, puerto].filter(Boolean).join(" · ") || null;
  const needle = [...tokensOf(transitario), ...tokensOf(puerto)];
  if (needle.length === 0) return { raw, match: null, candidates: [] };

  const toRef = (w: MasterWarehouse): MasterRef => ({
    id: w.id,
    label: w.code ? `[${w.code}] ${w.name}` : w.name,
  });

  const matches = warehouses.filter((w) => {
    const hay = [...tokensOf(w.name), ...tokensOf(w.code)];
    return needle.every((t) => hay.includes(t));
  });

  if (matches.length === 1) return { raw, match: toRef(matches[0]), candidates: [] };
  if (matches.length > 1) return { raw, match: toRef(matches[0]), candidates: matches.map(toRef) };
  return { raw, match: null, candidates: [] };
}

// ============================================================
// CÁLCULO DE DÍAS DE PLANCHA
// ============================================================

/** Días entre fecha_aplicacion y fecha_plancha (fin de plancha). */
function diffDays(desde: string, hasta: string): number {
  const ms = 1000 * 60 * 60 * 24;
  const a = new Date(desde + "T00:00:00Z").getTime();
  const b = new Date(hasta + "T00:00:00Z").getTime();
  return Math.round((b - a) / ms);
}

// ============================================================
// CONSTRUCCIÓN DE LA PROPUESTA
// ============================================================

/**
 * Cruza la extracción del PDF contra los maestros y arma la propuesta.
 * No accede a la BD: recibe los maestros ya cargados. La detección de
 * duplicados (nº de contrato existente) se añade en la server action.
 */
export function buildPuestaProposal(
  extraction: PuestaPdfExtraction,
  masters: MasterData
): PuestaProposal {
  const warnings: string[] = [];
  const errors: string[] = [];

  // ── Resolver maestros ──────────────────────────────────────
  // El almacén es la combinación de transitario + puerto.
  const warehouse = resolveWarehouse(extraction.transitario, extraction.puerto, masters.warehouses);
  const product = resolveMaster(extraction.producto, masters.products, normText);
  // Los clientes usan `codigo`; lo mapeamos a `code` para el resolutor genérico.
  const customer = resolveMaster(
    extraction.cliente,
    masters.customers.map((c) => ({ id: c.id, code: c.codigo, name: c.name })),
    normCliente
  );

  // ── Valores directos ───────────────────────────────────────
  const numero_contrato = extraction.numero_aplicacion?.trim() || null;
  const cantidad_inicial =
    typeof extraction.cantidad === "number" && extraction.cantidad > 0
      ? extraction.cantidad
      : null;
  const fecha_puesta = extraction.fecha_aplicacion || null;

  // ── Días de plancha (calculado a partir de las dos fechas) ──
  let dias_plancha: number | null = null;
  if (fecha_puesta && extraction.fecha_plancha) {
    const d = diffDays(fecha_puesta, extraction.fecha_plancha);
    if (d < 0) {
      dias_plancha = 0;
      warnings.push(
        `La fecha de plancha (${extraction.fecha_plancha}) es anterior a la de aplicación; se ponen 0 días.`
      );
    } else {
      dias_plancha = d;
    }
  } else {
    dias_plancha = 0;
    warnings.push("No se detectó la fecha de plancha; se ponen 0 días (revísalo).");
  }

  // ── Comentarios (traza del origen) ─────────────────────────
  const comentarioParts = ["Importada desde PDF de aplicación"];
  if (extraction.fecha_plancha) comentarioParts.push(`Plancha: ${extraction.fecha_plancha}`);
  const comentarios = comentarioParts.join(" · ");

  // ── Errores bloqueantes ────────────────────────────────────
  if (!warehouse.match) {
    const combo = [extraction.transitario, extraction.puerto].filter(Boolean).join(" + ") || "—";
    errors.push(`Almacén (transitario + puerto) no encontrado: "${combo}".`);
  }
  if (!product.match) errors.push(`Producto no encontrado: "${extraction.producto ?? ""}".`);
  if (!cantidad_inicial) errors.push("Cantidad inválida o ausente.");
  if (!fecha_puesta) errors.push("Falta la fecha de aplicación.");

  // ── Avisos / dudas ─────────────────────────────────────────
  if (warehouse.candidates.length > 1) warnings.push("Varios almacenes posibles; revisa el seleccionado.");
  if (product.candidates.length > 1) warnings.push("Varios productos posibles; revisa el seleccionado.");
  if (extraction.cliente && !customer.match) {
    warnings.push(`Cliente no encontrado: "${extraction.cliente}". Selecciónalo o déjalo sin cliente.`);
  }
  if (customer.candidates.length > 1) warnings.push("Varios clientes posibles; revisa el seleccionado.");

  // ── Estado global ──────────────────────────────────────────
  let state: PuestaProposal["state"];
  if (errors.length > 0) {
    state = "error";
  } else if (warnings.length > 0 || !customer.match) {
    state = "dudoso";
  } else {
    state = "listo";
  }

  return {
    extraction,
    numero_contrato,
    cantidad_inicial,
    fecha_puesta,
    dias_plancha,
    comentarios,
    warehouse,
    product,
    customer,
    state,
    warnings,
    errors,
  };
}
