"use client";

import { useState, useEffect, useTransition } from "react";
import { FlaskConical, ShieldCheck, Loader2 } from "lucide-react";
import { setEnvMode } from "@/lib/actions/env-mode";
import { getClientEnvMode, type EnvMode } from "@/lib/env-mode";
import { cn } from "@/lib/utils";

export function EnvSwitcher() {
  const [mode, setMode] = useState<EnvMode>("production");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMode(getClientEnvMode());
  }, []);

  function handleToggle() {
    const next: EnvMode = mode === "production" ? "development" : "production";
    startTransition(async () => {
      await setEnvMode(next);
      window.location.reload();
    });
  }

  const isDev = mode === "development";

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      title={isDev ? "Cambiar a Producción" : "Cambiar a Desarrollo"}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all",
        isDev
          ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/70"
          : "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/70"
      )}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isDev ? (
        <FlaskConical className="h-3.5 w-3.5" />
      ) : (
        <ShieldCheck className="h-3.5 w-3.5" />
      )}
      {isDev ? "Desarrollo" : "Producción"}
    </button>
  );
}
