interface HeroBannerProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

/**
 * Cabecera con la foto del puerto (carga de cereal a granel en un buque).
 * Foto: Fabrizio Zini, Pexels (licencia libre, sin atribución obligatoria).
 *
 * El degradado azul marino por la izquierda garantiza que el título se lea
 * sobre cualquier zona de la foto, tanto en modo claro como en oscuro; por eso
 * el texto y los controles de este banner van siempre en blanco.
 */
export function HeroBanner({ title, description, actions }: HeroBannerProps) {
  return (
    <div
      className="relative flex min-h-[120px] items-end justify-between gap-4 overflow-hidden rounded-xl border p-5 shadow-sm"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgba(12,24,58,0.9) 0%, rgba(12,24,58,0.62) 55%, rgba(12,24,58,0.28) 100%), url('/images/puerto-granel.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center 40%",
      }}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        {description && <p className="mt-1 text-sm text-white/80">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
