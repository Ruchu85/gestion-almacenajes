/**
 * Icono estilo Excel: hoja verde con la "X" blanca y la rejilla de celdas.
 * Es SVG propio (no el logotipo oficial de Microsoft) para no depender de
 * ningún recurso externo y escalar sin pérdida; mantiene su paleta verde.
 */
export function ExcelIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="Excel"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Hoja con la rejilla de celdas */}
      <rect x="12" y="4" width="17" height="24" rx="2" fill="#FFFFFF" stroke="#107C41" strokeWidth="1.2" />
      <rect x="12" y="4" width="17" height="6" rx="2" fill="#21A366" />
      <rect x="12" y="9" width="17" height="1" fill="#21A366" />
      <g stroke="#107C41" strokeWidth="1" opacity="0.55">
        <line x1="12" y1="14.5" x2="29" y2="14.5" />
        <line x1="12" y1="19" x2="29" y2="19" />
        <line x1="12" y1="23.5" x2="29" y2="23.5" />
        <line x1="20.5" y1="10" x2="20.5" y2="28" />
      </g>
      {/* Bloque verde con la X */}
      <rect x="2" y="8" width="16" height="16" rx="2.5" fill="#107C41" />
      <path
        d="M6.6 12.2h2.5l1.9 3.1 1.9-3.1h2.5l-3.2 4.8 3.3 4.8h-2.6L11 18.5l-2 3.3H6.4l3.3-4.8z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
