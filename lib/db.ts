import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

let _sql: Sql | null = null;
let _connecting: Promise<Sql> | null = null;

/**
 * Extrae password y project-ref de la POSTGRES_URL configurada,
 * o del entorno Supabase como fallback.
 */
function parseConfig(): { password: string; ref: string; region: string } | null {
  const url = process.env.POSTGRES_URL ?? "";

  // ref desde la URL pública de Supabase (https://<ref>.supabase.co)
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const refFromSupa = supaUrl.match(/https:\/\/([^.]+)\.supabase/)?.[1];

  // password y ref desde POSTGRES_URL: postgresql://postgres[.ref]:PASS@host:port/db
  const m = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:/]+)/);
  let password = "";
  let ref = refFromSupa ?? "";
  let region = "eu-central-1"; // confirmado por el rango IPv6 (2a05:d014 = AWS eu-central-1)

  if (m) {
    const user = m[1];          // postgres  ó  postgres.<ref>
    password = decodeURIComponent(m[2]);
    const host = m[3];          // aws-X-<region>.pooler... ó db.<ref>.supabase.co
    const userRef = user.split(".")[1];
    if (userRef) ref = userRef;
    const hostRegion = host.match(/aws-\d+-([a-z0-9-]+)\.pooler/)?.[1];
    if (hostRegion) region = hostRegion;
  }

  if (!password || !ref) return null;
  return { password, ref, region };
}

/**
 * Conecta al pooler de Supabase probando los prefijos aws-1 y aws-0
 * (los proyectos nuevos viven en aws-1). Se queda con el que responde.
 */
async function connect(): Promise<Sql> {
  const cfg = parseConfig();
  if (!cfg) {
    // Fallback: usar POSTGRES_URL tal cual si no pudimos parsear
    const raw = process.env.POSTGRES_URL;
    if (!raw) throw new Error("POSTGRES_URL no está configurado");
    const sql = postgres(raw, { max: 1, idle_timeout: 20, connect_timeout: 10, prepare: false });
    await sql`select 1`;
    return sql;
  }

  const { password, ref, region } = cfg;
  const candidates = [
    `aws-1-${region}.pooler.supabase.com`,
    `aws-0-${region}.pooler.supabase.com`,
  ];

  let lastErr: unknown = null;
  for (const host of candidates) {
    const sql = postgres({
      host,
      port: 6543,
      database: "postgres",
      username: `postgres.${ref}`,
      password,
      ssl: "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false, // obligatorio en transaction mode (puerto 6543)
    });
    try {
      await sql`select 1`;
      return sql; // este host funciona
    } catch (e) {
      lastErr = e;
      try { await sql.end({ timeout: 1 }); } catch {}
    }
  }
  throw lastErr ?? new Error("No se pudo conectar a ningún pooler de Supabase");
}

export async function getDb(): Promise<Sql> {
  if (_sql) return _sql;
  if (!_connecting) {
    _connecting = connect()
      .then((sql) => { _sql = sql; return sql; })
      .catch((e) => { _connecting = null; throw e; });
  }
  return _connecting;
}
