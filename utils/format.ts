import { format, parseISO, isValid } from "date-fns";
import { es } from "date-fns/locale";

// ============================================================
// FORMATEADORES DE FECHAS
// ============================================================

export function formatDate(
  date: string | Date | null | undefined,
  pattern = "dd/MM/yyyy"
): string {
  if (!date) return "-";
  try {
    const d = typeof date === "string" ? parseISO(date) : date;
    if (!isValid(d)) return "-";
    return format(d, pattern, { locale: es });
  } catch {
    return "-";
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  return formatDate(date, "dd/MM/yyyy HH:mm");
}

export function formatDateForInput(date: string | Date | null | undefined): string {
  if (!date) return "";
  try {
    const d = typeof date === "string" ? parseISO(date) : date;
    if (!isValid(d)) return "";
    return format(d, "yyyy-MM-dd");
  } catch {
    return "";
  }
}

// ============================================================
// FORMATEADORES DE MONEDA
// ============================================================

const currencyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const currencyShortFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "€0,00";
  return currencyShortFormatter.format(value);
}

export function formatCurrencyLong(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "€0,0000";
  return currencyFormatter.format(value);
}

// ============================================================
// FORMATEADORES DE NÚMEROS
// ============================================================

// Para contadores enteros (nº almacenes, nº productos…)
const intFormatter = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

// Para cantidades decimales (stock, toneladas, kg…)
// Siempre muestra separador de miles y al menos 2 decimales
const quantityFormatter = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
  useGrouping: true,
});

export function formatNumber(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "0";
  // Si es entero puro lo mostramos sin decimales; si tiene decimales, con formato cantidad
  return Number.isInteger(value)
    ? intFormatter.format(value)
    : quantityFormatter.format(value);
}

export function formatQuantity(
  value: number | null | undefined,
  unit?: string
): string {
  if (value == null || isNaN(value)) return unit ? `0,00 ${unit}` : "0,00";
  const formatted = quantityFormatter.format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatPercentage(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

// ============================================================
// FORMATEADORES DE TEXTO
// ============================================================

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
}

export function capitalize(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function formatRole(role: string): string {
  const roles: Record<string, string> = {
    admin: "Administrador",
    user: "Usuario",
  };
  return roles[role] ?? capitalize(role);
}

export function formatBoolean(value: boolean): string {
  return value ? "Activo" : "Inactivo";
}
