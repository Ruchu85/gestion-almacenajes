import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { getClientEnvMode, getDbSchema } from "@/lib/env-mode";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (browserClient) return browserClient;
  const schema = getDbSchema(getClientEnvMode());
  browserClient = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema } }
  );
  return browserClient;
}
