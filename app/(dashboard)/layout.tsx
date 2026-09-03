import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ENV_COOKIE, getEnvModeFromValue } from "@/lib/env-mode";
import { FlaskConical } from "lucide-react";

/**
 * Duración máxima de las funciones de todo el área privada.
 *
 * Los diálogos de "Subir Salidas Puerto (PDF)", "Subir Pta a Disposición
 * (PDF)" y "Revisar Salidas Puerto (PDF)" viven en la barra lateral, así que
 * sus Server Actions se ejecutan bajo la ruta en la que esté el usuario:
 * cualquier página del dashboard. Sin esto valía el valor por defecto de la
 * plataforma (60 s), muy por debajo de lo que las llamadas a Gemini creían
 * tener presupuestado, y la función se moría a media extracción — de ahí el
 * diálogo colgado sin error claro. Ahora el límite es explícito, y los
 * presupuestos de lib/gemini.ts están calculados para caber dentro.
 */
export const maxDuration = 60;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single() as unknown as {
      data: { full_name: string | null; role: "admin" | "user" } | null;
      error: unknown;
    };

  const cookieStore = await cookies();
  const isDev = getEnvModeFromValue(cookieStore.get(ENV_COOKIE)?.value) === "development";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {isDev && (
          <div className="flex items-center justify-center gap-2 bg-amber-400 dark:bg-amber-600 text-amber-950 dark:text-amber-50 text-xs font-semibold py-1.5 px-4 shrink-0">
            <FlaskConical className="h-3.5 w-3.5" />
            ENTORNO DE DESARROLLO — Los datos no afectan a producción
          </div>
        )}
        <Header
          userEmail={user.email}
          userName={profile?.full_name ?? undefined}
          userRole={profile?.role ?? undefined}
        />
        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-[1600px] space-y-6 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
