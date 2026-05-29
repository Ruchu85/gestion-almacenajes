import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";
import { ENV_COOKIE, getEnvModeFromValue, getSupabaseCredentials } from "@/lib/env-mode";

async function resolveCredentials() {
  const cookieStore = await cookies();
  const mode = getEnvModeFromValue(cookieStore.get(ENV_COOKIE)?.value);
  return { creds: getSupabaseCredentials(mode), cookieStore };
}

export async function createClient() {
  const { creds, cookieStore } = await resolveCredentials();

  return createServerClient<Database>(creds.url, creds.anonKey, {
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
  });
}

/**
 * Cliente con service role key usando @supabase/supabase-js puro.
 * RLS queda completamente desactivado.
 */
export async function createServiceClient() {
  const { creds } = await resolveCredentials();

  return createSupabaseClient<Database>(creds.url, creds.serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
