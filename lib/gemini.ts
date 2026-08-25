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
          cliente: { type: "string", description: "Cliente/destinatario de la retirada. Vacío si no hay cliente externo." },
          numero_puesta: { type: "string", description: "Nº de contrato de la fila, sin prefijos. Vacío si no hay contrato." },
          almacen: { type: "string", description: "Almacén/puerto de la cabecera del informe. Ejemplo: CORUÑA." },
          producto: { type: "string" },
          fecha: { type: "string", description: "Formato YYYY-MM-DD" },
          matricula: { type: "string", description: "Matrícula del camión (cabeza tractora)." },
          remolque: { type: "string", description: "Matrícula del remolque, si el documento la trae. Vacío si no." },
          ticket: { type: "string", description: "Nº de ticket/pesada, si el documento lo trae. Vacío si no." },
          cantidad: { type: "number" },
          unidad: {
            type: "string",
            description: 'Unidad en la que está expresada "cantidad" en el documento: "kg" o "tns".',
          },
        },
        required: ["cliente", "numero_puesta", "fecha", "matricula", "cantidad", "unidad"],
      },
    },
    resumen_clientes: {
      type: "array",
      description:
        "Resumen de KG RETIRADOS por cliente de los bloques de saldos (FORMATO B). Vacío en el FORMATO A.",
      items: {
        type: "object",
        properties: {
          cliente: { type: "string", description: "Nombre del cliente tal cual figura en la subtabla de saldos." },
          codigo_cupo: { type: "string", description: "Código del cupo al que pertenece la fila. Vacío si no consta." },
          producto: { type: "string", description: "Mercancía del bloque. Ejemplo: MAIZ GMO." },
          kg_retirados: { type: "number", description: "Valor de la columna KG RETIRADOS de esa fila." },
        },
        required: ["cliente", "kg_retirados"],
      },
    },
  },
  required: ["lineas", "resumen_clientes"],
} as const;

const EXTRACTION_PROMPT = `
Eres un asistente experto en leer informes logísticos de almacenaje de mercancías en español.

El PDF adjunto es un informe de SALIDAS / RETIRADAS de mercancía de un almacén portuario.
Puede venir en DOS FORMATOS distintos. Identifica primero de cuál se trata y aplica SOLO las
reglas de ese formato.

════════════════════════════════════════════════════════════════════════════════
FORMATO A — "Informe de Salidas a Vendedor"
Se reconoce porque tiene una tabla de movimientos con una columna "Salidas" y columnas
"Nombre" y "Contrato".
════════════════════════════════════════════════════════════════════════════════
Extrae ÚNICAMENTE las filas cuya columna "Salidas" tenga un valor mayor que 0.

- "cliente": el nombre que aparece en la columna "Nombre" de ESA fila (NO el "Propietario" de la
  cabecera). Ejemplo: "DE HEUS NUTRICION ANIMAL".
  IMPORTANTE: Si la columna "Nombre" contiene el nombre de la propia empresa propietaria
  (el "Propietario" o "Propietario Origen" de la cabecera), o si está vacía, devuelve cliente = "".
- "numero_puesta": el valor de la columna "Contrato" de esa fila. Ejemplo: "D02600632_20-1".
  Si está vacía o no existe, devuelve "".
- "almacen": el puerto o almacén indicado en la cabecera del bloque (campo "Puerto"). Ejemplo: "CORUÑA".
  Si no aparece el campo "Puerto", devuelve "".
- "producto": la mercancía del informe (cabecera, campo "Mercancía"). Ejemplo: "MAIZ".
- "fecha": la fecha de la salida (columna "Fecha", o "Fecha Pase" si no hay "Fecha"), convertida
  SIEMPRE al formato YYYY-MM-DD. Las fechas de este formato vienen en DD/MM/YYYY.
- "matricula": la matrícula del camión de esa fila. Ejemplo: "3946NBP".
- "remolque": "" (este formato no trae remolque).
- "ticket": "" (este formato no trae nº de ticket).
- "cantidad": el valor numérico de la columna "Salidas". Aquí la COMA es el separador DECIMAL
  (ej. "30,08" → 30.08). Devuélvelo como número decimal con punto.
- "unidad": "tns" (las cantidades de este formato están en toneladas).

Reglas del FORMATO A:
- Incluye TODAS las filas con "Salidas" > 0, incluso si "Nombre" o "Contrato" están vacíos o son
  el nombre de la propia empresa. En esos casos devuelve cadena vacía para esos campos.
- Ignora filas de totales, subtotales y existencias.
- Ignora cualquier fila cuya "Salidas" sea 0 o vacía (esas son entradas, no salidas).
- "resumen_clientes": devuelve una lista VACÍA (este formato no trae bloques de saldos).

════════════════════════════════════════════════════════════════════════════════
FORMATO B — "Informe de sus movimientos" con "LISTADO DE PESADAS"
Se reconoce porque contiene bloques "CODIGO CUPO" y una sección "LISTADO DE PESADAS" con
columnas "TICK.", "MATR./REM.", "POR CTA/DESTINAT.", "SIT", "NETO" y "CONTRATO REF.".
Lo emite el almacén portuario (por ejemplo "PEREZ TORRES MARITIMA, S.L.").
════════════════════════════════════════════════════════════════════════════════
MUY IMPORTANTE — de dónde SÍ y de dónde NO extraer:
- Los bloques "CODIGO CUPO" (columnas PLANCHA / POR CUENTA / KG ASIGNADOS / KG RETIRADOS / SALDO)
  y sus subtablas "REAS. / CLIENTE" son SOLO SALDOS INFORMATIVOS.
  NO generes NINGUNA línea de "lineas" a partir de ellos, aunque tengan KG RETIRADOS mayores que 0.
  Esos bloques se vuelcan APARTE, en "resumen_clientes" (ver más abajo).
- Extrae UNA LÍNEA POR CADA FILA de la tabla "LISTADO DE PESADAS". Esas son las retiradas reales
  del día. Procesa TODAS sus filas, en todas las páginas.

Cada fila del "LISTADO DE PESADAS" ocupa DOS renglones:
- "MATR./REM.": renglón 1 = matrícula del CAMIÓN (ej. "3058MGT");
                renglón 2 = matrícula del REMOLQUE (ej. "R9038BD").
- "POR CTA/DESTINAT.": renglón 1 = por cuenta de (ej. "LESA # LEONESA ASTUR");
                renglón 2, que empieza por un guion, = DESTINATARIO (ej. "-DE HEUS NUTRICION A").

Campos del FORMATO B:
- "cliente": el DESTINATARIO, es decir el renglón 2 de "POR CTA/DESTINAT.", sin el guion inicial.
  Ejemplo: "-DE HEUS NUTRICION A" → "DE HEUS NUTRICION A". Si el nombre lleva un prefijo de código
  con almohadilla (ej. "LESA # ..."), quítalo.
  MUY IMPORTANTE: si la fila NO tiene destinatario, o el destinatario es la MISMA empresa que
  figura como titular del informe (la que aparece tras "SRES." o tras "CLIENTE : (nn)", por
  ejemplo "LESA # LEONESA ASTUR DE PIENSOS, S.A."), devuelve cliente = "". Eso significa que la
  retirada es una salida directa del titular y no una entrega a un cliente.
- "numero_puesta": el valor de "CONTRATO REF." QUITANDO el prefijo:
  "CONT.CLI.-D02600804" → "D02600804"; "CONT.PROV.-D02600804" → "D02600804".
  Si la columna está vacía, devuelve "".
- "almacen": la empresa que emite el informe junto con su ciudad, tal como aparecen en la primera
  línea de la cabecera. Ejemplo: de "PEREZ TORRES MARITIMA, S.L. - MUELLE SAN DIEGO s/n - 15006 -
  A CORUÑA." devuelve "PEREZ TORRES MARITIMA, S.L. - A CORUÑA" (nombre de la empresa + ciudad,
  SIN la calle ni el código postal).
- "producto": la mercancía del bloque de pesadas. Ejemplo: "MAIZ GMO".
- "fecha": la fecha del informe en YYYY-MM-DD. Tómala de "LISTADO DE PESADAS: DD-MM-AAAA a ..."
  (usa la PRIMERA fecha) y, si no aparece, de "INFORME DE SUS MOVIMIENTOS DE FECHA DD-MM-AAAA".
  En este formato las fechas vienen en DD-MM-AAAA.
- "matricula": renglón 1 de "MATR./REM.".
- "remolque": renglón 2 de "MATR./REM.". Si no hay, "".
- "ticket": el valor de la columna "TICK.". Ejemplo: "58995".
- "cantidad": el valor de la columna "NETO". En este formato el PUNTO es separador de MILES y NO
  hay decimales: "29.300" → 29300, "295.660" → 295660. Devuélvelo como número entero.
- "unidad": "kg" (las cantidades del LISTADO DE PESADAS están en kilogramos).

Reglas del FORMATO B:
- NO sumes ni agrupes filas: una línea de salida por cada pesada (por cada nº de ticket).
- Ignora los totales ("RET. DIA:", "SALIDAS DIA:", "SALDO:"), las líneas de subtotales de las
  subtablas y los pies de página ("SIT = A (RETIRADO ALMACEN)", "SALUDOS", etc.).
- Incluye las filas tanto si "SIT" es A como si es B.

RESUMEN DE RETIRADAS POR CLIENTE del FORMATO B ("resumen_clientes"):
Además de "lineas", rellena SIEMPRE "resumen_clientes" con las retiradas por cliente que declaran
los bloques de saldos de la PRIMERA PARTE del informe (normalmente la página 1). Cada bloque
"CODIGO CUPO" va seguido de una subtabla con columnas "REAS.", "CLIENTE", "KG ASIGNADOS",
"KG RETIRADOS" y "SALDO", con una fila por cliente.
- Añade UNA ENTRADA por cada fila de esas subtablas cuyo "KG RETIRADOS" sea MAYOR QUE 0.
  Omite las filas con KG RETIRADOS igual a 0 o vacío.
- Recorre TODOS los bloques "CODIGO CUPO" del documento. Si el mismo cliente aparece en varios
  bloques, añade una entrada por cada bloque (NO las sumes).
- "cliente": el nombre de la columna "CLIENTE", tal cual, quitando el número de "REAS." inicial.
  Ejemplo: la fila "2 PIENSOS DEL SIL S.A" → cliente = "PIENSOS DEL SIL S.A".
- "codigo_cupo": el valor "CODIGO CUPO" del bloque al que pertenece la fila. Ejemplo:
  "1165465JL-00". Si no consta, "".
- "producto": la mercancía del bloque, de la cabecera con "RET. DIA:". Ejemplo: "MAIZ GMO".
- "kg_retirados": el valor de "KG RETIRADOS" como número. El PUNTO es separador de MILES y NO hay
  decimales: "226.820" → 226820, "59.420" → 59420, "100" → 100.
- Ignora las líneas de subtotal de la subtabla (las que solo traen una cifra de saldo suelta) y
  los totales de la cabecera del bloque ("RET. DIA:", "SALDO:").

════════════════════════════════════════════════════════════════════════════════
REGLAS GENERALES (aplican a los dos formatos)
════════════════════════════════════════════════════════════════════════════════
- No inventes datos. Si un campo no tiene valor en el documento, devuelve cadena vacía.
- Todas las fechas SIEMPRE en formato YYYY-MM-DD.
- Procesa TODAS las páginas del documento.
- Devuelve las cantidades como números, nunca como texto.

Devuelve el resultado siguiendo el esquema JSON proporcionado.
`.trim();

export interface GeminiRawExtraction {
  lineas: Array<{
    cliente: string;
    numero_puesta: string;
    almacen?: string;
    producto?: string;
    fecha: string;
    matricula: string;
    remolque?: string;
    ticket?: string;
    cantidad: number;
    unidad?: string;
  }>;
  resumen_clientes?: Array<{
    cliente: string;
    codigo_cupo?: string;
    producto?: string;
    kg_retirados: number;
  }>;
}

/**
 * Llama a Gemini con un PDF (base64), un prompt y un responseSchema, y
 * devuelve el JSON crudo ya parseado. Centraliza el manejo de errores HTTP.
 */
async function callGemini(
  pdfBase64: string,
  prompt: string,
  responseSchema: unknown,
  model: string = GEMINI_MODEL
): Promise<unknown> {
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
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  // Reintentos con backoff ante errores transitorios (429 saturación de
  // cuota, 503 modelo sobrecargado). El resto de errores no se reintentan.
  const RETRYABLE = new Set([429, 503]);
  const MAX_ATTEMPTS = 3;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let response: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      response = await fetch(`${GEMINI_ENDPOINT(model)}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
    } catch (err) {
      // Error de red: reintentar si quedan intentos.
      if (attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 1200);
        continue;
      }
      throw new Error(`No se pudo contactar con Gemini: ${(err as Error).message}`);
    }

    if (response.ok) break;

    // Respuesta de error: reintentar solo los transitorios.
    if (RETRYABLE.has(response.status) && attempt < MAX_ATTEMPTS) {
      await sleep(attempt * 1500); // 1.5s, luego 3s
      continue;
    }

    const detail = await response.text().catch(() => "");
    if (response.status === 429) {
      throw new Error("Gemini está saturado por límite de peticiones. Espera unos segundos y reinténtalo.");
    }
    if (response.status === 503) {
      throw new Error("El modelo de Gemini está sobrecargado ahora mismo. Espera un momento y vuelve a intentarlo.");
    }
    throw new Error(`Gemini devolvió ${response.status}: ${detail.slice(0, 300)}`);
  }

  if (!response) {
    throw new Error("No se pudo obtener respuesta de Gemini tras varios intentos.");
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

/**
 * Envía un PDF (en base64) a Gemini y devuelve el JSON crudo extraído.
 * Lanza Error con un mensaje legible si la llamada falla.
 */
export async function extractSalidasFromPdf(pdfBase64: string, model?: string): Promise<unknown> {
  return callGemini(pdfBase64, EXTRACTION_PROMPT, RESPONSE_SCHEMA, model);
}

// ============================================================
// EXTRACCIÓN DE PUESTAS A DISPOSICIÓN (documento "Aplicación")
// ============================================================

/** Esquema de respuesta para el PDF de aplicación / puesta a disposición. */
const PUESTA_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    numero_aplicacion: { type: "string", description: "Campo 'Nº Aplicación', ej. D02600777_10-1" },
    cliente: { type: "string", description: "Campo 'Cliente', ej. NUTRIMENTOS DEZA, S.A." },
    transitario: { type: "string", description: "Campo 'Transitario', ej. NOGUEIRA" },
    puerto: { type: "string", description: "Campo 'Puerto', ej. MARIN" },
    producto: { type: "string", description: "Campo 'Producto', ej. TRIGO GRANEL" },
    cantidad: { type: "number", description: "Campo 'Cantidad' como número, sin la unidad" },
    fecha_aplicacion: { type: "string", description: "Campo 'Fecha aplic.' en formato YYYY-MM-DD" },
    fecha_plancha: { type: "string", description: "Campo 'Plancha' (una fecha) en formato YYYY-MM-DD" },
  },
  required: [
    "numero_aplicacion", "cliente", "transitario", "puerto", "producto",
    "cantidad", "fecha_aplicacion", "fecha_plancha",
  ],
} as const;

const PUESTA_EXTRACTION_PROMPT = `
Eres un asistente experto en leer documentos logísticos de almacenaje en español.

El documento adjunto es una "Aplicación" (puesta a disposición de mercancía). Contiene un único
bloque de datos con etiquetas a la izquierda y valores a la derecha. Extrae estos campos:

- "numero_aplicacion": el valor del campo "Nº Aplicación". Ejemplo: "D02600777_10-1".
- "cliente": el valor del campo "Cliente". Ejemplo: "NUTRIMENTOS DEZA, S.A.".
- "transitario": el valor del campo "Transitario". Ejemplo: "NOGUEIRA".
- "puerto": el valor del campo "Puerto". Ejemplo: "MARIN".
- "producto": el valor del campo "Producto". Ejemplo: "TRIGO GRANEL".
- "cantidad": el valor numérico del campo "Cantidad", SIN la unidad. La coma es separador decimal
  (ej. "150,00 TNS" → 150.00). Devuélvelo como número decimal con punto.
- "fecha_aplicacion": el valor del campo "Fecha aplic.", convertido SIEMPRE a formato YYYY-MM-DD.
  Las fechas del documento vienen en DD/MM/YYYY.
- "fecha_plancha": el valor del campo "Plancha" (que es una FECHA, no un número de días),
  convertido SIEMPRE a formato YYYY-MM-DD.

REGLAS ESTRICTAS:
- NO confundas el campo "Transitario" con el "Cliente".
- NO inventes datos. Si un campo no aparece, devuélvelo como cadena vacía.
- Ignora el texto legal, direcciones de la cabecera y correos electrónicos.

Devuelve el resultado siguiendo el esquema JSON proporcionado.
`.trim();

/**
 * Envía un PDF de "Aplicación" a Gemini y devuelve el JSON crudo de la puesta.
 */
export async function extractPuestaFromPdf(pdfBase64: string): Promise<unknown> {
  return callGemini(pdfBase64, PUESTA_EXTRACTION_PROMPT, PUESTA_RESPONSE_SCHEMA);
}

// ============================================================
// SEGUNDA PASADA DE VERIFICACIÓN (auditoría de cantidades)
// ============================================================

/**
 * Esquema deliberadamente mínimo: solo lo que identifica cada pesada y su
 * cantidad. Cuanto menos tiene que devolver el modelo, menos se distrae de la
 * única cifra que aquí importa.
 */
const VERIFICATION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    pesadas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ticket: { type: "string", description: "Nº de ticket/pesada. Vacío si el documento no lo trae." },
          matricula: { type: "string", description: "Matrícula del camión (cabeza tractora)." },
          neto: { type: "number", description: "Cantidad de la fila, tal cual figura impresa." },
          unidad: { type: "string", description: '"kg" o "tns", según el documento.' },
        },
        required: ["neto", "unidad"],
      },
    },
    totales: {
      type: "array",
      description: "Totales que el documento declara explícitamente.",
      items: {
        type: "object",
        properties: {
          concepto: { type: "string", description: 'Etiqueta del total: "RET. DIA", "SALIDAS DIA"…' },
          producto: { type: "string", description: "Mercancía del bloque, si consta." },
          valor: { type: "number" },
          unidad: { type: "string", description: '"kg" o "tns".' },
        },
        required: ["concepto", "valor"],
      },
    },
  },
  required: ["pesadas", "totales"],
} as const;

const VERIFICATION_PROMPT = `
Tu única tarea es leer CANTIDADES de un informe logístico en español, con la máxima precisión.
No interpretes nada más: no te interesan clientes, contratos, saldos ni cupos.

════════════════════════════════════════════════════════════════════════════════
QUÉ EXTRAER
════════════════════════════════════════════════════════════════════════════════
Localiza la tabla de movimientos de salida del documento:

- Si el documento tiene una sección "LISTADO DE PESADAS" (columnas "TICK.",
  "MATR./REM.", "POR CTA/DESTINAT.", "SIT", "NETO", "CONTRATO REF."):
  extrae UNA ENTRADA POR FILA de esa tabla.
    · "ticket"    = columna "TICK.".
    · "matricula" = PRIMER renglón de "MATR./REM." (el camión, no el remolque).
    · "neto"      = columna "NETO". En este formato el PUNTO es separador de MILES
                    y NO hay decimales: "29.300" → 29300, "1.360" → 1360.
    · "unidad"    = "kg".
  IGNORA por completo los bloques "CODIGO CUPO" y sus subtablas de clientes:
  son saldos, no pesadas.

- Si en cambio el documento es un "Informe de Salidas a Vendedor" (con columnas
  "Nombre", "Contrato" y "Salidas"): extrae una entrada por cada fila cuya
  columna "Salidas" sea mayor que 0.
    · "ticket"    = "" (este formato no trae ticket).
    · "matricula" = la matrícula de esa fila.
    · "neto"      = valor de "Salidas". Aquí la COMA es separador DECIMAL:
                    "30,08" → 30.08.
    · "unidad"    = "tns".

════════════════════════════════════════════════════════════════════════════════
TOTALES DECLARADOS
════════════════════════════════════════════════════════════════════════════════
Rellena "totales" con las cifras de total que el documento imprime de forma
explícita, una entrada por cada una:
- "RET. DIA:" → concepto "RET. DIA", con el valor y la mercancía de su bloque.
- "SALIDAS DIA:" → concepto "SALIDAS DIA".
- Cualquier otra línea de total de la tabla de movimientos.
Aplica las MISMAS reglas de separadores que arriba. Si el documento no imprime
ningún total, devuelve una lista vacía.

════════════════════════════════════════════════════════════════════════════════
PRECISIÓN AL LEER LAS CIFRAS — LO MÁS IMPORTANTE
════════════════════════════════════════════════════════════════════════════════
Estas cifras se van a auditar, así que cada dígito cuenta:
- Lee dígito a dígito. NO redondees, NO estimes, NO completes cifras de memoria.
- Extrema el cuidado con los dígitos que se parecen entre sí en documentos
  escaneados: 6 y 8, 3 y 8, 5 y 6, 0 y 8, 1 y 7, 9 y 8. Si un dígito es
  ambiguo, quédate con la forma que realmente ves impresa.
- No corrijas ni "arregles" una cifra para que cuadre con ningún total: queremos
  la lectura literal del papel, aunque no cuadre.
- Procesa TODAS las filas de TODAS las páginas. No omitas ninguna.
- No inventes filas que no existan.

Devuelve el resultado siguiendo el esquema JSON proporcionado.
`.trim();

/**
 * Segunda lectura del mismo PDF, enfocada solo en las cantidades y en los
 * totales que declara el documento.
 *
 * Existe para auditar: al contrastarla con la extracción principal, cualquier
 * cifra que no coincida entre ambas lecturas señala un dígito que el modelo no
 * lee de forma estable. Usa un prompt distinto a propósito, para que las dos
 * lecturas sean lo más independientes posible.
 */
export async function extractPesadasVerification(
  pdfBase64: string,
  model?: string
): Promise<unknown> {
  return callGemini(pdfBase64, VERIFICATION_PROMPT, VERIFICATION_RESPONSE_SCHEMA, model);
}
