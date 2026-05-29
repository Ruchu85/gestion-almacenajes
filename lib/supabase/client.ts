import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { getClientEnvMode, getSupabaseCredentials } from "@/lib/env-mode";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (browserClient) return browserClient;
  const { url, anonKey } = getSupabaseCredentials(getClientEnvMode());
  browserClient = createBrowserClient<Database>(url, anonKey);
  return browserClient;
}
