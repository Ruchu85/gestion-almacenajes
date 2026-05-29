export type EnvMode = "production" | "development";

export const ENV_COOKIE = "gestion-env-mode";

export function getEnvModeFromValue(value: string | undefined): EnvMode {
  return value === "development" ? "development" : "production";
}

/** Browser-only: reads the env mode from document.cookie */
export function getClientEnvMode(): EnvMode {
  if (typeof document === "undefined") return "production";
  const match = document.cookie.match(new RegExp(`${ENV_COOKIE}=([^;]+)`));
  return getEnvModeFromValue(match?.[1]);
}

export function getSupabaseCredentials(mode: EnvMode) {
  if (mode === "development") {
    return {
      url:        process.env.NEXT_PUBLIC_SUPABASE_URL_DEV  ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
      anonKey:    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY_DEV ?? process.env.SUPABASE_SERVICE_ROLE_KEY!,
    };
  }
  return {
    url:        process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey:    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}
