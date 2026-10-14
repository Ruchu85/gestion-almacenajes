// PostgREST corta cada respuesta en `max-rows` (1000 en Supabase), así que los
// listados que necesitan TODO el resultado leen por tandas. La consulta que se
// pase debe llevar un orden total (fecha + `id` como desempate): con solo la
// fecha hay muchas filas del mismo día y el orden entre tandas no es estable
// (se saltarían o repetirían filas).
const FETCH_ALL_BATCH = 1000;

export async function fetchAllBatches<T>(
  label: string,
  fetchBatch: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += FETCH_ALL_BATCH) {
    const { data, error } = await fetchBatch(from, from + FETCH_ALL_BATCH - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < FETCH_ALL_BATCH) return rows;
  }
}
