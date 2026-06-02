"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ─── helpers ─────────────────────────────────────────────────────────────────

function numToDisplay(v: number | null | undefined): string {
  if (v == null || (typeof v === "number" && isNaN(v))) return "";
  return String(v).replace(".", ",");
}

function displayToNum(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

// ─── tipos ───────────────────────────────────────────────────────────────────

interface DecimalInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "onChange" | "onBlur"
  > {
  value?: number | null;
  onChange?: (value: number) => void;
  onBlur?: () => void;
}

// ─── componente ──────────────────────────────────────────────────────────────

export const DecimalInput = React.forwardRef<HTMLInputElement, DecimalInputProps>(
  ({ value, onChange, onBlur, className, ...props }, ref) => {
    const [display, setDisplay] = React.useState(() => numToDisplay(value));
    const isEditingRef = React.useRef(false);

    // Sincronizar cuando el valor cambia desde fuera (form.reset, carga de datos)
    React.useEffect(() => {
      if (!isEditingRef.current) {
        setDisplay(numToDisplay(value));
      }
    }, [value]);

    function handleFocus() {
      isEditingRef.current = true;
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      // Punto del teclado normal o del teclado numérico → insertar coma
      if (e.key !== "." && e.key !== "Decimal") return;
      e.preventDefault();
      if (display.includes(",")) return; // ya tiene decimal
      const el = e.currentTarget;
      const s = el.selectionStart ?? display.length;
      const en = el.selectionEnd ?? display.length;
      const next = display.slice(0, s) + "," + display.slice(en);
      setDisplay(next);
      requestAnimationFrame(() => el.setSelectionRange(s + 1, s + 1));
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      let raw = e.target.value;
      // Solo dígitos y una coma como máximo
      raw = raw.replace(/[^0-9,]/g, "");
      const firstComma = raw.indexOf(",");
      if (firstComma !== -1) {
        raw = raw.slice(0, firstComma + 1) + raw.slice(firstComma + 1).replace(/,/g, "");
      }
      setDisplay(raw);
      onChange?.(displayToNum(raw));
    }

    function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
      isEditingRef.current = false;
      // Limpiar display al perder el foco (ej. "1," → "1")
      const n = displayToNum(display);
      if (display !== "" && display !== ",") {
        setDisplay(numToDisplay(n));
      }
      onBlur?.();
    }

    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={display}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        {...props}
      />
    );
  }
);

DecimalInput.displayName = "DecimalInput";
