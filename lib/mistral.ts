/**
 * Cliente mínimo para la API de Mistral, usado SOLO como último recurso cuando
 * Gemini no responde (ver lib/pdf-extraction.ts).
 *
 * Por qué Mistral y no otro: el pipeline manda el PDF entero en base64, y muy
 * pocos proveedores aceptan un PDF nativo. Groq y Cerebras tienen cupos
 * gratuitos enormes pero corren modelos de texto/imagen: haría falta un paso
 * extra de PDF→imagen, que es justo la clase de capa nueva que puede fallar por
 * su cuenta al leer tablas de albaranes. Mistral acepta el PDF tal cual y tiene
 * un tramo gratuito muy holgado, así que es el único respaldo que protege de
 * una caída de Google entera y no solo de un modelo.
 *
 * Es OPCIONAL: sin `MISTRAL_API_KEY` la cadena simplemente lo salta, y todo
 * sigue funcionando exactamente igual que antes.
 */

const MISTRAL_ENDPOINT = "https://api.mistral.ai/v1/chat/completions";

/**
 * Modelo de Mistral. Configurable por si hace falta cambiarlo sin tocar código.
 *
 * `small` y no `medium`, medido contra los PDF reales de producción:
 *   · INFORPES (2 págs):  small 2,3 s · medium 3,3 s — los dos exactos.
 *   · Informe 4 págs/27 filas: small 16,1 s y EXACTO (27 filas, suma 756,94);
 *     medium devolvió 503 "high load" en ese mismo momento.
 * Siendo el último recurso, interesa el más rápido y el que menos se atraganta
 * con el documento grande, no el más capaz: esto es transcribir una tabla.
 */
export const MISTRAL_MODEL = process.env.MISTRAL_MODEL ?? "mistral-small-latest";

/**
 * Techo de tokens de salida. El informe de 4 páginas gasta ~3.100, así que
 * 8.000 deja margen de sobra para uno bastante mayor sin que el JSON se corte
 * a medias (un JSON truncado no es recuperable: lo rechaza el Zod y se pierde
 * la lectura entera).
 */
const MAX_OUTPUT_TOKENS = 8_000;

/** ¿Hay clave configurada? Sin ella la cadena salta este proveedor. */
export function mistralConfigurado(): boolean {
  return !!process.env.MISTRAL_API_KEY;
}

export interface MistralCallOptions {
  /** Presupuesto total de reloj para la llamada, igual que en lib/gemini.ts. */
  totalBudgetMs?: number;
}

/**
 * Manda un PDF (base64) a Mistral y devuelve el JSON ya parseado.
 *
 * Sobre el formato de salida: se usa el modo JSON genérico
 * (`response_format: { type: "json_object" }`) y el esquema se le describe al
 * modelo dentro del propio prompt, en lugar del modo `json_schema` estricto.
 * Es deliberado: no se ha podido probar esta ruta contra la API real (hace
 * falta una clave), y el modo genérico es el que menos supuestos hace sobre la
 * forma exacta que espera Mistral. La red de seguridad de verdad está después
 * igualmente — la respuesta pasa por el mismo Zod (`pdfExtractionSchema`) que
 * la de Gemini, así que un JSON con otra forma se rechaza como error, nunca se
 * cuela como dato bueno.
 */
export async function callMistral(
  pdfBase64: string,
  prompt: string,
  responseSchema: unknown,
  options: MistralCallOptions = {}
): Promise<unknown> {
  const { totalBudgetMs = 40_000 } = options;
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY no está configurada.");
  }

  const instrucciones =
    `${prompt}\n\n` +
    "FORMATO DE SALIDA — OBLIGATORIO\n" +
    "Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después y " +
    "sin envolverlo en un bloque de código. Debe seguir EXACTAMENTE este esquema " +
    "(mismos nombres de campo, mismos tipos):\n" +
    JSON.stringify(responseSchema);

  const body = {
    model: MISTRAL_MODEL,
    temperature: 0,
    max_tokens: MAX_OUTPUT_TOKENS,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instrucciones },
          // Formato verificado contra la API real: el data URI va como CADENA
          // directamente en `document_url`. Anidarlo en un objeto `{ url: … }`
          // —la forma que usan otros proveedores— devuelve un 422.
          // El base64 va sin saltos de línea (Buffer.toString('base64') ya los omite).
          { type: "document_url", document_url: `data:application/pdf;base64,${pdfBase64}` },
        ],
      },
    ],
  };

  const deadline = Date.now() + totalBudgetMs;
  const restante = () => Math.max(0, deadline - Date.now());
  /** Por debajo de esto no da tiempo ni a que empiece a responder. */
  const MIN_INTENTO_MS = 8_000;

  let ultimoError = "";
  // Hasta dos intentos: Mistral devuelve 503 "high load" de forma transitoria
  // —ocurrió en las pruebas justo con el PDF grande— y responde en 2-16 s, así
  // que casi siempre queda presupuesto de sobra para reintentar. Al ser el
  // último eslabón de la cadena no hay ningún otro proveedor detrás: si aquí se
  // tira la toalla al primer 503, se pierde la lectura entera.
  for (let intento = 1; intento <= 2; intento++) {
    if (restante() < MIN_INTENTO_MS) break;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), restante());

    try {
      const response = await fetch(MISTRAL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        // 429 (límite) y 5xx (sobrecarga) son transitorios; el resto, no.
        const transitorio = response.status === 429 || response.status >= 500;
        ultimoError =
          response.status === 429
            ? "Mistral ha alcanzado su límite de peticiones."
            : `Mistral devolvió ${response.status}: ${detail.slice(0, 200)}`;
        if (transitorio && intento === 1 && restante() >= MIN_INTENTO_MS) continue;
        throw new Error(ultimoError);
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      };
      const choice = json.choices?.[0];
      const text = choice?.message?.content;
      if (!text) throw new Error("Mistral no devolvió contenido analizable.");
      // Un JSON cortado por el tope de tokens no se puede parsear ni arreglar:
      // mejor decirlo con claridad que dejar un "JSON inválido" ambiguo.
      if (choice?.finish_reason === "length") {
        throw new Error("La respuesta de Mistral se cortó por longitud: el documento es demasiado grande.");
      }

      try {
        return JSON.parse(text);
      } catch {
        throw new Error("La respuesta de Mistral no es un JSON válido.");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new Error(`Mistral no respondió en ${Math.round(totalBudgetMs / 1000)}s.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(ultimoError || "No se pudo obtener respuesta de Mistral.");
}
