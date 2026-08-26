import type { PuestaSummary } from "@/types";
import type {
  PdfExtractedLine,
  PdfProposalItem,
  PdfResumenAlert,
  PdfResumenCliente,
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

/** Normaliza un texto genérico: mayúsculas, sin acentos, sin símbolos. */
function normText(value: string | null | undefined): string {
  if (!value) return "";
  return stripAccents(value.toUpperCase())
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Trocea un texto en tokens normalizados. */
function tokensOf(value: string | null | undefined): string[] {
  return normText(value).split(" ").filter(Boolean);
}

/**
 * Quita los prefijos de referencia de contrato que traen algunos informes
 * ("CONT.CLI.-D02600804" → "D02600804").
 */
function stripContratoPrefix(value: string): string {
  return value.replace(/^\s*CONT\.?\s*(CLI|CLIENTE|PROV|PROVEEDOR)?\.?\s*[-–:]?\s*/i, "");
}

/** Normaliza un nº de contrato/puesta: mayúsculas, sin separadores. */
function normContrato(value: string | null | undefined): string {
  if (!value) return "";
  return stripAccents(stripContratoPrefix(value).toUpperCase()).replace(/[^A-Z0-9]/g, "");
}

/**
 * Código base de un contrato: la parte anterior al primer separador de
 * línea/versión. "D02600804_10-3" → "D02600804". Algunos informes (listado de
 * pesadas) solo imprimen el código base, sin la línea ni la versión.
 */
function contratoBase(value: string | null | undefined): string {
  if (!value) return "";
  const clean = stripAccents(stripContratoPrefix(value).toUpperCase());
  return clean.split(/[_/\\]/)[0].replace(/[^A-Z0-9]/g, "");
}

/** Longitud mínima del código base para admitir el emparejamiento por base. */
const MIN_BASE_LEN = 5;

const LEGAL_SUFFIXES = new Set([
  "SA", "SAU", "SL", "SLU", "SLL", "SAL", "SCOOP", "SC", "CB", "SCA", "SLNE",
]);

/** Tokens sin valor discriminante al comparar nombres de empresa/almacén. */
const NOISE_TOKENS = new Set([...LEGAL_SUFFIXES, "S", "A", "L", "U", "DE", "DEL", "LA", "EL", "Y"]);

/**
 * Letras sueltas en las que se descompone una forma jurídica al quitarle los
 * puntos: "PIENSOS SIL, S.L." → "PIENSOS SIL S L".
 */
const LEGAL_LETTERS = new Set(["S", "A", "L", "U", "C", "B"]);

/** Normaliza un nombre de cliente: mayúsculas, sin acentos, sin forma jurídica. */
function normCliente(value: string | null | undefined): string {
  const cleaned = normText(value);
  if (!cleaned) return "";
  const tokens = cleaned.split(" ").filter(Boolean);
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    const isLegal = LEGAL_SUFFIXES.has(last) || (last.length === 1 && LEGAL_LETTERS.has(last));
    if (!isLegal) break;
    tokens.pop();
  }
  return tokens.join(" ");
}

/**
 * Tokens significativos de un nombre de empresa: sin forma jurídica, sin
 * artículos ni preposiciones. Es lo que permite ver que "PIENSOS DEL SIL, S.A."
 * (PDF) y "PIENSOS SIL, S.L." (sistema) son el mismo cliente.
 */
function clienteTokens(value: string | null | undefined): string[] {
  return tokensOf(normCliente(value)).filter((t) => !NOISE_TOKENS.has(t));
}

/** Longitud mínima de un token para admitirlo como prefijo de otro. */
const MIN_PREFIX_LEN = 3;

/**
 * Fuerza de la coincidencia entre el nombre de cliente del PDF y el del
 * sistema. Los informes de almacén recortan los nombres (a 20 caracteres en el
 * listado de pesadas) y añaden u omiten preposiciones y formas jurídicas, así
 * que la comparación literal no basta.
 *
 *  - 4 → nombres idénticos una vez normalizados.
 *  - 3 → mismos tokens significativos: "PIENSOS DEL SIL S.A" ⇄ "PIENSOS SIL, S.L.".
 *  - 2 → los tokens de uno son un subconjunto de los del otro (≥2 tokens):
 *        "DE HEUS NUTRICION A" ⊂ "DE HEUS NUTRICION ANIMAL, S.A.U".
 *  - 1 → coincidencia débil: contención literal, o tokens truncados que son
 *        prefijo de los del otro nombre.
 *  - 0 → sin relación.
 */
export function clienteMatchScore(
  pdfName: string | null | undefined,
  dbName: string | null | undefined
): 0 | 1 | 2 | 3 | 4 {
  const na = normCliente(pdfName);
  const nb = normCliente(dbName);
  if (!na || !nb) return 0;
  if (na === nb) return 4;

  const ta = new Set(clienteTokens(pdfName));
  const tb = new Set(clienteTokens(dbName));

  if (ta.size > 0 && tb.size > 0) {
    if (ta.size === tb.size && [...ta].every((t) => tb.has(t))) return 3;

    const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
    if (small.size >= 2 && [...small].every((t) => big.has(t))) return 2;

    // Nombre recortado por el informe: cada token del corto es el principio de
    // alguno del largo ("DE HEUS NUTRICION AN" ⊂ "DE HEUS NUTRICION ANIMAL").
    const prefixOk = [...small].every((t) =>
      [...big].some((o) => o === t || (t.length >= MIN_PREFIX_LEN && o.startsWith(t)))
    );
    if (small.size >= 2 && prefixOk) return 1;
  }

  if (na.length >= 4 && nb.includes(na)) return 1;
  if (nb.length >= 4 && na.includes(nb)) return 1;
  return 0;
}

/** Coincidencia laxa de cliente (cualquier nivel de la escala anterior). */
function clienteMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  return clienteMatchScore(a, b) > 0;
}

/**
 * Puestas cuyo cliente casa MEJOR con el nombre del PDF. Se queda solo con las
 * del nivel de coincidencia más alto, para que una coincidencia exacta gane a
 * una débil (p. ej. "PIENSOS SIL" frente al resto de "PIENSOS …").
 */
export function bestByCliente(
  puestas: PuestaSummary[],
  cliente: string | null | undefined
): { matches: PuestaSummary[]; score: 0 | 1 | 2 | 3 | 4 } {
  const scored = puestas
    .map((p) => ({ p, score: clienteMatchScore(cliente, p.customer_name) }))
    .filter((s) => s.score > 0);
  if (scored.length === 0) return { matches: [], score: 0 };
  const best = Math.max(...scored.map((s) => s.score)) as 1 | 2 | 3 | 4;
  return { matches: scored.filter((s) => s.score === best).map((s) => s.p), score: best };
}

function productoMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normText(a);
  const nb = normText(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// ============================================================
// COINCIDENCIA DE MAESTROS POR TEXTO (almacenes, productos)
// ============================================================

/**
 * Fuerza de la coincidencia entre un texto del PDF y el nombre de un registro
 * del sistema:
 *  - 3 → nombres idénticos (normalizados).
 *  - 2 → todos los tokens significativos del nombre del sistema aparecen en el
 *        texto del PDF. Cubre "PEREZ TORRES MARITIMA, S.L. - MUELLE SAN DIEGO …
 *        - A CORUÑA" ⇒ "PEREZ TORRES MARITIMA, S.L. - CORUÑA", o "MAIZ GMO" ⇒ "MAIZ".
 *  - 1 → uno contiene al otro (p. ej. el PDF solo trae el puerto: "CORUÑA").
 *  - 0 → sin relación.
 */
export function textMatchScore(
  pdfText: string | null | undefined,
  dbName: string | null | undefined
): 0 | 1 | 2 | 3 {
  const pdf = normText(pdfText);
  const db = normText(dbName);
  if (!pdf || !db) return 0;
  if (pdf === db) return 3;

  const pdfTokens = new Set(tokensOf(pdf));
  const dbTokens = tokensOf(db).filter((t) => !NOISE_TOKENS.has(t));
  if (dbTokens.length > 0 && dbTokens.every((t) => pdfTokens.has(t))) return 2;

  if (pdf.length >= 4 && db.includes(pdf)) return 1;
  if (db.length >= 4 && pdf.includes(db)) return 1;
  return 0;
}

/**
 * Selecciona de una lista los elementos que mejor casan con un texto del PDF,
 * quedándose solo con los del nivel de coincidencia más alto encontrado.
 */
export function filterByText<T>(
  items: T[],
  pdfText: string | null | undefined,
  getName: (item: T) => string | null | undefined
): T[] {
  if (!normText(pdfText)) return [];
  const scored = items
    .map((item) => ({ item, score: textMatchScore(pdfText, getName(item)) }))
    .filter((s) => s.score > 0);
  if (scored.length === 0) return [];
  const best = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === best).map((s) => s.item);
}

// ============================================================
// UNIDADES
// ============================================================

const TONNE_UNITS = new Set([
  "T", "TN", "TNS", "TM", "TON", "TONS", "TONELADA", "TONELADAS", "MT",
]);
const KILO_UNITS = new Set(["KG", "KGS", "KILO", "KILOS", "KILOGRAMO", "KILOGRAMOS"]);

type UnitFamily = "tonne" | "kilo" | "unknown";

function unitFamily(unit: string | null | undefined): UnitFamily {
  const u = normText(unit).replace(/\s+/g, "");
  if (!u) return "unknown";
  if (TONNE_UNITS.has(u)) return "tonne";
  if (KILO_UNITS.has(u)) return "kilo";
  return "unknown";
}

/**
 * Factor para pasar de la unidad del PDF a la unidad del sistema.
 * Devuelve 1 cuando no hay conversión posible o no hace falta.
 */
export function conversionFactor(
  unidadOrigen: string | null | undefined,
  unidadDestino: string | null | undefined
): number {
  const from = unitFamily(unidadOrigen);
  const to = unitFamily(unidadDestino);
  if (from === "unknown" || to === "unknown" || from === to) return 1;
  if (from === "kilo" && to === "tonne") return 0.001;
  if (from === "tonne" && to === "kilo") return 1000;
  return 1;
}

/** Redondeo a 3 decimales — la precisión de las cantidades en base de datos. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface ProductUnitRef {
  name: string;
  unit: string;
}

/** Unidad del sistema para el producto que menciona el PDF. */
export function resolveTargetUnit(
  producto: string | null | undefined,
  products: ProductUnitRef[]
): string | null {
  if (products.length === 0) return null;

  const matches = filterByText(products, producto, (p) => p.name);
  if (matches.length > 0) return matches[0].unit;

  // Producto no identificado: si todos los productos activos comparten familia
  // de unidad, esa es la del sistema y la conversión sigue siendo segura.
  const families = new Set(products.map((p) => unitFamily(p.unit)).filter((f) => f !== "unknown"));
  if (families.size === 1) {
    const family = [...families][0];
    return products.find((p) => unitFamily(p.unit) === family)?.unit ?? null;
  }
  return null;
}

/**
 * Normaliza las cantidades extraídas del PDF a la unidad que usa el sistema
 * para ese producto (p. ej. el listado de pesadas viene en kg y el producto se
 * gestiona en TNS). Conserva el valor original para poder mostrarlo.
 */
export function normalizeLineUnits(
  lineas: PdfExtractedLine[],
  products: ProductUnitRef[]
): PdfExtractedLine[] {
  return lineas.map((line) => {
    const targetUnit = resolveTargetUnit(line.producto, products);
    const factor = conversionFactor(line.unidad, targetUnit);
    if (factor === 1) return line;
    return {
      ...line,
      cantidad: round3(line.cantidad * factor),
      cantidad_origen: line.cantidad,
      unidad_origen: line.unidad ?? null,
      unidad_destino: targetUnit,
    };
  });
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
 * Ordena las puestas candidatas por criterio FIFO: primero las que tienen
 * pendiente suficiente para absorber la salida, y dentro de ellas la más
 * antigua. Así se consume el stock más viejo, que es lo que encarece.
 */
function sortFifo(list: PuestaSummary[], cantidad: number): PuestaSummary[] {
  return [...list].sort((a, b) => {
    const aFits = a.cantidad_pendiente >= cantidad ? 0 : 1;
    const bFits = b.cantidad_pendiente >= cantidad ? 0 : 1;
    if (aFits !== bFits) return aFits - bFits;
    return a.fecha_puesta.localeCompare(b.fecha_puesta);
  });
}

/** Reduce una lista de candidatas aplicando un filtro solo si deja alguna. */
function refine(pool: PuestaSummary[], filtered: PuestaSummary[]): PuestaSummary[] {
  return filtered.length > 0 ? filtered : pool;
}

/**
 * Cruza cada línea extraída del PDF contra las puestas ABIERTAS.
 *
 * Reglas de negocio:
 *  - Una línea SIN cliente/destinatario externo es una salida DIRECTA del
 *    titular del informe (tipo 'normal'), aunque traiga nº de contrato.
 *  - Una línea CON cliente se empareja contra una puesta a disposición:
 *      · por nº de contrato exacto, o por su código base ("D02600804" contra
 *        "D02600804_10-3", que es como lo imprime el listado de pesadas);
 *      · afinando por cliente, almacén y producto;
 *      · desempatando por FIFO cuando siguen quedando varias.
 *
 * Confianza: ALTA solo si el cliente casa y queda una única candidata.
 *
 * No accede a la base de datos: recibe las puestas ya cargadas. La detección
 * de duplicados (que sí requiere DB) se añade en la capa de server action.
 */
export function buildProposals(
  lineas: PdfExtractedLine[],
  puestasAbiertas: PuestaSummary[]
): PdfProposalItem[] {
  const proposals: PdfProposalItem[] = lineas.map((line, index) => {
    const id = `${index}-${line.matricula}-${line.cantidad}`;
    const hasCliente = !!(line.cliente && line.cliente.trim());

    // ── Sin destinatario externo → salida directa ──────────────
    if (!hasCliente) {
      return {
        id,
        tipo: "normal" as const,
        line,
        match: null,
        candidates: [],
        confidence: "nula" as MatchConfidence,
        warnings: [],
      };
    }

    const warnings: string[] = [];
    let match: PuestaMatchRef | null = null;
    let candidates: PuestaMatchRef[] = [];
    let confidence: MatchConfidence = "nula";

    // ── 1. Candidatas por nº de contrato ───────────────────────
    const lineContrato = normContrato(line.numero_puesta);
    const lineBase = contratoBase(line.numero_puesta);

    let porContrato = lineContrato
      ? puestasAbiertas.filter((p) => normContrato(p.numero_contrato) === lineContrato)
      : [];
    let matchedByBase = false;

    if (porContrato.length === 0 && lineBase.length >= MIN_BASE_LEN) {
      porContrato = puestasAbiertas.filter((p) => contratoBase(p.numero_contrato) === lineBase);
      matchedByBase = porContrato.length > 0;
    }

    // ── 2. Afinar candidatas ───────────────────────────────────
    const { matches: porCliente, score: clienteScore } = bestByCliente(puestasAbiertas, line.cliente);

    let pool: PuestaSummary[];
    let clienteOk: boolean;
    /** Puestas ofrecidas como alternativa aunque no sean la propuesta principal. */
    let alternativas: PuestaSummary[] = [];
    /** El contrato y el destinatario del PDF apuntan a clientes distintos. */
    let conflicto = false;

    if (porContrato.length > 0) {
      const conCliente = porContrato.filter((p) => clienteMatches(p.customer_name, line.cliente));

      if (conCliente.length > 0) {
        clienteOk = true;
        pool = conCliente;
      } else if (porCliente.length > 0) {
        // El contrato es de otro cliente: manda el destinatario, pero se dejan
        // las puestas del contrato como alternativa para que el usuario decida.
        clienteOk = true;
        conflicto = true;
        pool = porCliente;
        alternativas = porContrato;
        warnings.push(
          `El contrato del PDF pertenece a "${porContrato[0].customer_name}" pero el destinatario es "${line.cliente}". Se proponen las puestas abiertas del destinatario; revísalo.`
        );
      } else {
        clienteOk = false;
        pool = porContrato;
        warnings.push(
          `El nº de contrato coincide pero el cliente del PDF ("${line.cliente}") no cuadra con "${porContrato[0].customer_name}".`
        );
      }
    } else {
      // Sin contrato reconocible: intentar solo por cliente.
      clienteOk = porCliente.length > 0;
      pool = porCliente;

      if (clienteOk) {
        warnings.push(
          clienteScore >= 3
            ? "No se encontró el nº de contrato exacto; emparejado solo por cliente."
            : `No se encontró el nº de contrato exacto; emparejado solo por el nombre del cliente ("${line.cliente}" ≈ "${porCliente[0].customer_name}").`
        );
      }
    }

    if (pool.length === 0) {
      warnings.push("No se encontró ninguna puesta abierta para este cliente / contrato.");
      return {
        id,
        tipo: "puesta" as const,
        line,
        match: null,
        candidates: [],
        confidence: "nula" as MatchConfidence,
        warnings,
      };
    }

    // Afinar por almacén y por producto (solo si el filtro deja candidatas).
    pool = refine(pool, filterByText(pool, line.almacen, (p) => p.warehouse_name));
    pool = refine(pool, pool.filter((p) => productoMatches(p.product_name, line.producto)));

    // ── 3. Desempate FIFO ──────────────────────────────────────
    const ordered = sortFifo(pool, line.cantidad);
    match = toRef(ordered[0]);

    // Coincidencia de nombre floja: el usuario debe validarla antes de grabar.
    const matchScore = clienteMatchScore(line.cliente, match.customer_name);
    if (matchScore === 1) {
      warnings.push(
        `El cliente del PDF ("${line.cliente}") se ha identificado como "${match.customer_name}" solo por parecido de nombre. Verifícalo.`
      );
    }

    if (ordered.length > 1) {
      warnings.push(
        matchedByBase
          ? `El PDF solo trae el contrato base "${lineBase}" y hay ${ordered.length} puestas abiertas con ese código. Se propone la más antigua con pendiente suficiente; revísala.`
          : "Varias puestas abiertas encajan con esta línea. Revisa la seleccionada."
      );
    }

    // Candidatas seleccionables: las del cruce más las alternativas del conflicto.
    const seleccionables = [
      ...ordered,
      ...alternativas.filter((a) => !ordered.some((o) => o.puesta_id === a.puesta_id)),
    ];
    if (seleccionables.length > 1) candidates = seleccionables.map(toRef);

    confidence =
      clienteOk && !conflicto && ordered.length === 1 && matchScore >= 2 ? "alta" : "media";

    return {
      id,
      tipo: "puesta" as const,
      line,
      match,
      candidates,
      confidence,
      warnings: [...warnings, ...buildWarnings(line, match)],
    };
  });

  // Devoluciones/abonos: el informe las trae en negativo porque la mercancía
  // vuelve al almacén. Se muestran para que no desaparezcan sin dejar rastro
  // (antes se descartaban en silencio y el total no cuadraba), pero no se
  // pueden grabar desde aquí: toda la cadena de salidas parciales, stock y
  // plancha da por hecho que la cantidad es positiva.
  for (const proposal of proposals) {
    if (proposal.line.cantidad < 0) {
      proposal.warnings.unshift(
        "Línea NEGATIVA (devolución o abono): la mercancía vuelve al almacén. " +
          "No se puede grabar desde la importación; anótala a mano en la puesta."
      );
      proposal.confidence = "media";
    }
  }

  return proposals;
}

// ============================================================
// CONTROL CRUZADO CON EL RESUMEN DE SALDOS (página 1 del informe)
// ============================================================

/** Tolerancia al comparar cantidades declaradas contra pesadas sumadas. */
const CANTIDAD_TOLERANCIA = 0.01;

interface ResumenAgregado {
  /** Nombre tal cual viene en el PDF (el primero encontrado). */
  cliente: string;
  /** Kilos retirados sumados de todos los cupos del cliente. */
  kg: number;
  /** Mercancía asociada, para resolver la unidad del sistema. */
  producto: string | null;
}

/** Agrupa las filas del resumen por cliente, descartando las que no retiran. */
function agruparResumen(resumen: PdfResumenCliente[]): ResumenAgregado[] {
  const porCliente = new Map<string, ResumenAgregado>();

  for (const fila of resumen) {
    if (!(fila.kg_retirados > 0)) continue;
    const key = normCliente(fila.cliente);
    if (!key) continue;

    const previo = porCliente.get(key);
    if (previo) {
      previo.kg += fila.kg_retirados;
      previo.producto = previo.producto ?? fila.producto ?? null;
    } else {
      porCliente.set(key, {
        cliente: fila.cliente.trim(),
        kg: fila.kg_retirados,
        producto: fila.producto ?? null,
      });
    }
  }

  return [...porCliente.values()];
}

/**
 * Contrasta el resumen de saldos del informe (bloques "CODIGO CUPO" de la
 * primera página) con lo que hay en el sistema y con las pesadas extraídas.
 *
 * Reglas:
 *  - Todo cliente con KG RETIRADOS > 0 tiene que tener una puesta a disposición
 *    ABIERTA con un nombre igual o parecido. Si no la hay, es un error: esa
 *    mercancía no se podrá imputar.
 *  - Los kilos declarados deben cuadrar con la suma de las pesadas de ese
 *    cliente; si no, la extracción se ha dejado (o duplicado) alguna línea.
 *  - Cuando el nombre del PDF y el del sistema no son idénticos se deja
 *    constancia de la equivalencia aplicada.
 */
export function buildResumenAlerts(
  resumen: PdfResumenCliente[],
  proposals: PdfProposalItem[],
  puestasAbiertas: PuestaSummary[],
  products: ProductUnitRef[]
): PdfResumenAlert[] {
  const alerts: PdfResumenAlert[] = [];

  for (const item of agruparResumen(resumen)) {
    // El resumen viene en kg; las propuestas ya están en la unidad del sistema.
    const targetUnit = resolveTargetUnit(item.producto, products);
    const unidad = targetUnit ?? "kg";
    const declarado = round3(item.kg * conversionFactor("kg", targetUnit));

    const { matches, score } = bestByCliente(puestasAbiertas, item.cliente);

    if (matches.length === 0) {
      alerts.push({
        level: "error",
        cliente: item.cliente,
        message:
          `El informe declara ${formatNumber(declarado)} ${unidad} retirados por "${item.cliente}", ` +
          `pero no hay ninguna puesta a disposición abierta en la aplicación con ese nombre ni uno parecido. ` +
          `Revisa cómo está dado de alta el cliente o abre la puesta antes de grabar.`,
      });
      continue;
    }

    // Equivalencia de nombres aplicada (el informe recorta y varía las razones sociales).
    const nombresSistema = [...new Set(matches.map((m) => m.customer_name))];
    if (score < 4) {
      alerts.push({
        level: score === 1 ? "warning" : "info",
        cliente: item.cliente,
        message:
          `"${item.cliente}" (PDF) se ha asociado a ${nombresSistema
            .map((n) => `"${n}"`)
            .join(" / ")} (aplicación)` +
          (score === 1 ? ". La coincidencia es solo aproximada; verifícala." : "."),
      });
    }

    // Descuadre entre lo declarado y las pesadas extraídas de ese cliente.
    const lineasCliente = proposals.filter(
      (p) => clienteMatchScore(item.cliente, p.line.cliente) > 0
    );
    const sumado = round3(lineasCliente.reduce((acc, p) => acc + p.line.cantidad, 0));

    if (Math.abs(sumado - declarado) > CANTIDAD_TOLERANCIA) {
      alerts.push({
        level: "warning",
        cliente: item.cliente,
        message:
          `El informe declara ${formatNumber(declarado)} ${unidad} retirados por "${item.cliente}", ` +
          `pero las pesadas detectadas suman ${formatNumber(sumado)} ${unidad}. ` +
          `Comprueba que no falte ni sobre ninguna línea.`,
      });
    }

    // Líneas del cliente que no han encontrado puesta pese a existir una abierta.
    const sinAsociar = lineasCliente.filter((p) => p.tipo === "puesta" && !p.match);
    if (sinAsociar.length > 0) {
      alerts.push({
        level: "error",
        cliente: item.cliente,
        message:
          `${sinAsociar.length} pesada(s) de "${item.cliente}" no se han podido asociar a ninguna ` +
          `puesta abierta (matrículas: ${sinAsociar.map((p) => p.line.matricula).join(", ")}).`,
      });
    }
  }

  return alerts;
}
