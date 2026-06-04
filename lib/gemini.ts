/**
 * Cliente mínimo para la API de Google Gemini (Generative Language API).
 *
 * Usa REST puro (fetch) para no añadir dependencias. Aprovecha la salida
 * estructurada (responseSchema) para que el modelo devuelva JSON validable.
 *
 * Requiere la variable de entorno GEMINI_API_KEY (clave gratuita de
 * Google AI Studio: https://aistudio.google.com/app/apikey).
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const GEMINI_ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Esquema de respuesta (subconjunto OpenAPI que entiende Gemini). */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    lineas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cliente: { type: "string" },
          numero_puesta: { type: "string" },
          producto: { type: "string" },
          fecha: { type: "string", description: "Formato YYYY-MM-DD" },
          matricula: { type: "string" },
          cantidad: { type: "number" },
        },
        required: ["cliente", "numero_puesta", "fecha", "matricula", "cantidad"],
      },
    },
  },
  required: ["lineas"],
} as const;

const EXTRACTION_PROMPT = `
Eres un asistente experto en leer informes logísticos de almacenaje de mercancías en español.

El documento adjunto es un "Informe de Salidas a Vendedor" (o similar). Contiene una o varias
páginas con una tabla de movimientos. Tu tarea es extraer ÚNICAMENTE las filas que representan
SALIDAS / RETIRADAS de mercancía (la columna "Salidas" tiene un valor mayor que 0).

Para cada fila de salida, extrae:
- "cliente": el nombre que aparece en la columna "Nombre" de ESA fila (NO el "Propietario" de la
  cabecera). Ejemplo: "DE HEUS NUTRICION ANIMAL".
- "numero_puesta": el valor de la columna "Contrato" de esa fila. Ejemplo: "D02600632_20-1".
- "producto": la mercancía del informe (suele estar en la cabecera, campo "Mercancía"). Ejemplo: "MAIZ".
- "fecha": la fecha de la salida (columna "Fecha", o "Fecha Pase" si no hay "Fecha"), convertida
  SIEMPRE al formato YYYY-MM-DD. Las fechas del documento están en formato DD/MM/YYYY.
- "matricula": la matrícula del camión de esa fila. Ejemplo: "3946NBP".
- "cantidad": el valor numérico de la columna "Salidas". Los números usan la coma como separador
  decimal (ej. "30,08" → 30.08). Devuélvelo como número decimal con punto.

REGLAS ESTRICTAS:
- Ignora filas de totales, subtotales y existencias.
- Ignora cualquier fila cuya "Salidas" sea 0 o vacía (esas son entradas, no salidas).
- Si una matrícula o cliente aparece sin salida, no la incluyas.
- No inventes datos. Si un campo no existe en una fila, no incluyas esa fila.
- Procesa TODAS las páginas del documento.

Devuelve el resultado siguiendo el esquema JSON proporcionado.
`.trim();

export interface GeminiRawExtraction {
  lineas: Array<{
    cliente: string;
    numero_puesta: string;
    producto?: string;
    fecha: string;
    matricula: string;
    cantidad: number;
  }>;
}

/**
 * Envía un PDF (en base64) a Gemini y devuelve el JSON crudo extraído.
 * Lanza Error con un mensaje legible si la llamada falla.
 */
export async function extractSalidasFromPdf(pdfBase64: string): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY no está configurada. Añádela en .env.local (clave gratuita de Google AI Studio)."
    );
  }

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
          { text: EXTRACTION_PROMPT },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  let response: Response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT(GEMINI_MODEL)}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    throw new Error(`No se pudo contactar con Gemini: ${(err as Error).message}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 429) {
      throw new Error("Límite de peticiones de Gemini alcanzado. Espera unos segundos y reinténtalo.");
    }
    throw new Error(`Gemini devolvió ${response.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) {
    throw new Error(`Gemini bloqueó el documento: ${json.promptFeedback.blockReason}`);
  }

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini no devolvió contenido analizable.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("La respuesta de Gemini no es un JSON válido.");
  }
}
