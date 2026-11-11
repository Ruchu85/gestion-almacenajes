/**
 * Exportaciones a Excel de la ficha almacén/producto ("Ver calendario de
 * stock"): una por pestaña — Calendario, Entradas, Salidas y Puestas.
 *
 * Solo da forma a datos que la página ya tiene cargados; no consulta la BD ni
 * recalcula nada, para que el Excel diga exactamente lo mismo que la pantalla.
 */
import { exportStyledExcel, type ExcelSheet } from "@/utils/export-styled-excel";
import { pendienteDePuesta } from "@/lib/puesta-estado";
import { roundQty } from "@/utils/calculations";

// ─── Tipos de entrada (estructurales: los de la página encajan tal cual) ─────

export interface FichaContext {
  warehouseName: string;
  productName: string;
  productCode: string;
  unit: string;
}

export interface CalendarDayInput {
  dateStr: string;
  inbound: number;
  outbound: number;
  cost: number;
  price: number;
  enPlancha: number;
  invendida: number;
  isEstimated: boolean;
}

export interface CalendarMonthInput {
  yearMonth: string;
  label: string;
  days: CalendarDayInput[];
  totalInbound: number;
  totalOutbound: number;
  totalCost: number;
  hasEstimated: boolean;
  invoices: { amount: number | null; ref: string | null }[];
}

export interface InboundInput {
  movement_date: string;
  quantity: number;
  free_days: number;
  comments: string | null;
  supplier: { name: string } | null;
}

export interface OutboundInput {
  movement_date: string;
  quantity: number;
  comments: string | null;
  matricula: string | null;
  from_puesta: boolean;
  customer: { name: string } | null;
}

export interface PuestaInput {
  numero_contrato: string | null;
  fecha_puesta: string;
  cantidad_inicial: number;
  estado: string;
  dias_plancha: number;
  fecha_fin_plancha: string;
  customer: { name: string } | null;
  salidas_parciales: { cantidad: number; tipo: string }[];
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

/** Nombre de fichero sin caracteres problemáticos en Windows. */
function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function filename(prefix: string, ctx: FichaContext): string {
  return `${prefix}_${slug(ctx.productName)}_${slug(ctx.warehouseName)}_${today()}`;
}

function subtitle(ctx: FichaContext): string {
  return `${ctx.productCode} · ${ctx.productName.trim()} · ${ctx.warehouseName}`;
}

/** Movimiento unificado (entrada o salida) para la hoja "Movimientos". */
interface MovimientoRow {
  fecha: string;
  tipo: "Entrada" | "Salida";
  cantidad: number;
  tercero: string | null;
  origen: string;
  matricula: string | null;
  comentarios: string | null;
}

function origenSalida(o: OutboundInput): string {
  return o.from_puesta ? "Puesta a disposición" : "Salida directa";
}

// ─── Calendario ──────────────────────────────────────────────────────────────

/**
 * Libro del calendario: el día a día completo (todos los meses), el resumen
 * mensual con lo facturado, y todos los movimientos de entrada y salida.
 */
export async function exportCalendarioExcel(
  ctx: FichaContext,
  months: CalendarMonthInput[],
  inbound: InboundInput[],
  outbound: OutboundInput[]
): Promise<void> {
  // La página guarda los meses del más reciente al más antiguo: en Excel se
  // leen mejor en orden cronológico.
  const cronologico = [...months].reverse();
  const dias = cronologico.flatMap((m) => m.days);

  const movimientos: MovimientoRow[] = [
    ...inbound.map<MovimientoRow>((i) => ({
      fecha: i.movement_date,
      tipo: "Entrada",
      cantidad: Number(i.quantity),
      tercero: i.supplier?.name ?? null,
      origen: "Entrada",
      matricula: null,
      comentarios: i.comments,
    })),
    ...outbound.map<MovimientoRow>((o) => ({
      fecha: o.movement_date,
      tipo: "Salida",
      cantidad: -Number(o.quantity),
      tercero: o.customer?.name ?? null,
      origen: origenSalida(o),
      matricula: o.matricula,
      comentarios: o.comments,
    })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tipo.localeCompare(b.tipo));

  const totalIn = roundQty(inbound.reduce((s, i) => s + Number(i.quantity), 0));
  const totalOut = roundQty(outbound.reduce((s, o) => s + Number(o.quantity), 0));
  const totalCost = cronologico.reduce((s, m) => s + m.totalCost, 0);
  const hayEstimados = cronologico.some((m) => m.hasEstimated);

  const sheets: ExcelSheet<unknown>[] = [
    {
      name: "Calendario",
      title: "Calendario diario de stock y almacenaje",
      accent: "2563EB",
      unit: ctx.unit,
      rows: dias,
      columns: [
        { header: "Fecha", type: "date", value: (d: CalendarDayInput) => d.dateStr },
        { header: "Entradas", type: "quantity", value: (d: CalendarDayInput) => d.inbound || null },
        { header: "Salidas", type: "quantity", value: (d: CalendarDayInput) => d.outbound || null },
        { header: "Invendida", type: "quantity", total: false, value: (d: CalendarDayInput) => d.invendida },
        { header: "A disposición", type: "quantity", total: false, value: (d: CalendarDayInput) => d.enPlancha },
        { header: "Precio/día", type: "price", value: (d: CalendarDayInput) => (d.cost > 0 ? d.price : null) },
        { header: "Almacenaje", type: "currency", total: true, value: (d: CalendarDayInput) => (d.cost > 0 ? d.cost : null) },
        { header: "Estimado", value: (d: CalendarDayInput) => (d.isEstimated ? "Sí" : "") },
      ],
    } as ExcelSheet<CalendarDayInput>,
    {
      name: "Resumen mensual",
      title: "Resumen mensual",
      accent: "7C3AED",
      unit: ctx.unit,
      rows: cronologico,
      columns: [
        { header: "Mes", value: (m: CalendarMonthInput) => m.label.charAt(0).toUpperCase() + m.label.slice(1) },
        { header: "Entradas", type: "quantity", value: (m: CalendarMonthInput) => m.totalInbound },
        { header: "Salidas", type: "quantity", value: (m: CalendarMonthInput) => m.totalOutbound },
        { header: "Almacenaje", type: "currency", total: true, value: (m: CalendarMonthInput) => m.totalCost },
        { header: "Incluye estimados", value: (m: CalendarMonthInput) => (m.hasEstimated ? "Sí" : "") },
        {
          header: "Facturado",
          type: "currency",
          total: true,
          value: (m: CalendarMonthInput) => {
            const conImporte = m.invoices.filter((i) => i.amount != null);
            return conImporte.length > 0
              ? conImporte.reduce((s, i) => s + Number(i.amount), 0)
              : null;
          },
        },
        {
          header: "Ref. factura",
          value: (m: CalendarMonthInput) =>
            m.invoices.map((i) => i.ref).filter(Boolean).join(", ") || null,
        },
      ],
    } as ExcelSheet<CalendarMonthInput>,
    {
      name: "Movimientos",
      title: "Todos los movimientos (entradas y salidas)",
      accent: "0F766E",
      unit: ctx.unit,
      rows: movimientos,
      columns: [
        { header: "Fecha", type: "date", value: (r: MovimientoRow) => r.fecha },
        { header: "Tipo", value: (r: MovimientoRow) => r.tipo },
        { header: "Cantidad", type: "quantity", value: (r: MovimientoRow) => r.cantidad },
        { header: "Proveedor / Cliente", value: (r: MovimientoRow) => r.tercero },
        { header: "Origen", value: (r: MovimientoRow) => r.origen },
        { header: "Matrícula", mono: true, value: (r: MovimientoRow) => r.matricula },
        { header: "Comentarios", wrap: true, width: 60, value: (r: MovimientoRow) => r.comentarios },
      ],
    } as ExcelSheet<MovimientoRow>,
  ] as ExcelSheet<unknown>[];

  const notes = [
    "Invendida y A disposición reparten el stock físico de cada día; son informativas y no intervienen en el coste.",
    "En la hoja Movimientos las salidas van en negativo: el total es el saldo de stock (entradas − salidas).",
  ];
  if (hayEstimados) {
    notes.push("Los días marcados como estimados aún no los ha procesado el cálculo diario: precio actual × stock pendiente.");
  }

  await exportStyledExcel({
    filename: filename("calendario", ctx),
    summary: {
      title: "Calendario de stock",
      subtitle: subtitle(ctx),
      filters: [
        { label: "Almacén", value: ctx.warehouseName },
        { label: "Producto", value: `${ctx.productCode} - ${ctx.productName.trim()}` },
        {
          label: "Periodo",
          value: dias.length > 0 ? `${dias[0].dateStr} a ${dias[dias.length - 1].dateStr}` : "—",
        },
        { label: "Total entradas", value: `${totalIn.toLocaleString("es-ES")} ${ctx.unit}` },
        { label: "Total salidas", value: `${totalOut.toLocaleString("es-ES")} ${ctx.unit}` },
        {
          label: "Coste acumulado",
          value: totalCost.toLocaleString("es-ES", { style: "currency", currency: "EUR" }),
        },
      ],
      notes,
    },
    sheets,
  });
}

// ─── Entradas ────────────────────────────────────────────────────────────────

export async function exportEntradasExcel(ctx: FichaContext, rows: InboundInput[]): Promise<void> {
  const ordenadas = [...rows].sort((a, b) => a.movement_date.localeCompare(b.movement_date));
  await exportStyledExcel({
    filename: filename("entradas", ctx),
    sheets: [
      {
        name: "Entradas",
        title: `Entradas — ${subtitle(ctx)}`,
        accent: "16A34A",
        unit: ctx.unit,
        rows: ordenadas,
        columns: [
          { header: "Fecha", type: "date", value: (r) => r.movement_date },
          { header: "Cantidad", type: "quantity", value: (r) => Number(r.quantity) },
          { header: "Proveedor", value: (r) => r.supplier?.name },
          { header: "Días plancha", type: "integer", value: (r) => r.free_days },
          { header: "Comentarios", wrap: true, width: 60, value: (r) => r.comments },
        ],
      } as ExcelSheet<InboundInput>,
    ],
  });
}

// ─── Salidas ─────────────────────────────────────────────────────────────────

export async function exportSalidasExcel(ctx: FichaContext, rows: OutboundInput[]): Promise<void> {
  const ordenadas = [...rows].sort((a, b) => a.movement_date.localeCompare(b.movement_date));
  await exportStyledExcel({
    filename: filename("salidas", ctx),
    sheets: [
      {
        name: "Salidas",
        title: `Salidas — ${subtitle(ctx)}`,
        accent: "DC2626",
        unit: ctx.unit,
        rows: ordenadas,
        columns: [
          { header: "Fecha", type: "date", value: (r) => r.movement_date },
          { header: "Cantidad", type: "quantity", value: (r) => Number(r.quantity) },
          { header: "Cliente", value: (r) => r.customer?.name },
          { header: "Origen", value: (r) => origenSalida(r) },
          { header: "Matrícula", mono: true, value: (r) => r.matricula },
          { header: "Comentarios", wrap: true, width: 60, value: (r) => r.comments },
        ],
      } as ExcelSheet<OutboundInput>,
    ],
  });
}

// ─── Puestas ─────────────────────────────────────────────────────────────────

/** Suma de las salidas parciales de un tipo. */
function sumaTipo(p: PuestaInput, tipo: string): number {
  return roundQty(
    (p.salidas_parciales ?? [])
      .filter((s) => s.tipo === tipo)
      .reduce((s, x) => s + Number(x.cantidad), 0)
  );
}

export async function exportPuestasExcel(ctx: FichaContext, rows: PuestaInput[]): Promise<void> {
  const ordenadas = [...rows].sort((a, b) => a.fecha_puesta.localeCompare(b.fecha_puesta));
  await exportStyledExcel({
    filename: filename("puestas", ctx),
    sheets: [
      {
        name: "Puestas",
        title: `Puestas a disposición — ${subtitle(ctx)}`,
        accent: "D97706",
        unit: ctx.unit,
        rows: ordenadas,
        columns: [
          { header: "Contrato", mono: true, value: (p) => p.numero_contrato },
          { header: "Cliente", value: (p) => p.customer?.name },
          { header: "Fecha puesta", type: "date", value: (p) => p.fecha_puesta },
          { header: "Días plancha", type: "integer", value: (p) => p.dias_plancha },
          { header: "Fin plancha", type: "date", value: (p) => p.fecha_fin_plancha },
          { header: "Cantidad inicial", type: "quantity", value: (p) => Number(p.cantidad_inicial) },
          { header: "Retirado", type: "quantity", value: (p) => sumaTipo(p, "real") },
          { header: "Desaplicado", type: "quantity", value: (p) => sumaTipo(p, "desaplicacion") },
          {
            header: "Pendiente",
            type: "quantity",
            value: (p) => Math.max(0, pendienteDePuesta(p.cantidad_inicial, p.salidas_parciales)),
          },
          { header: "Estado", type: "estado", value: (p) => p.estado },
        ],
      } as ExcelSheet<PuestaInput>,
    ],
  });
}
