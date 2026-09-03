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

/** Modelo de Mistral. Configurable por si hace falta cambiarlo sin tocar código. */
export const MISTRAL_MODEL = process.env.MISTRAL_MODEL ?? "mistral-medium-latest";

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
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instrucciones },
          // El base64 va sin saltos de línea (Buffer.toString('base64') ya los omite).
          { type: "document_url", document_url: `data:application/pdf;base64,${pdfBase64}` },
        ],
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), totalBudgetMs);

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
      if (response.status === 429) {
        throw new Error("Mistral ha alcanzado su límite de peticiones.");
      }
      throw new Error(`Mistral devolvió ${response.status}: ${detail.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content;
    if (!text) throw new Error("Mistral no devolvió contenido analizable.");

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
