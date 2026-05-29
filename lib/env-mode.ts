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

/** Returns the Postgres schema name for the given env mode */
export function getDbSchema(mode: EnvMode): string {
  return mode === "development" ? "dev" : "public";
}
