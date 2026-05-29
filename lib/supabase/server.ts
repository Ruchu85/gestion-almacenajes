import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";
import { ENV_COOKIE, getEnvModeFromValue, getDbSchema } from "@/lib/env-mode";

async function resolveSchema(): Promise<{ schema: string; cookieStore: Awaited<ReturnType<typeof cookies>> }> {
  const cookieStore = await cookies();
  const mode = getEnvModeFromValue(cookieStore.get(ENV_COOKIE)?.value);
  return { schema: getDbSchema(mode), cookieStore };
}

export async function createClient() {
  const { schema, cookieStore } = await resolveSchema();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from Server Component — cookies set by middleware
          }
        },
      },
    }
  );
}

/**
 * Cliente con service role key usando @supabase/supabase-js puro.
 * RLS queda completamente desactivado.
 */
export async function createServiceClient() {
  const { schema } = await resolveSchema();

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
