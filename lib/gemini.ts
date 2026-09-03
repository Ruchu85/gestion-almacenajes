/**
 * Lectura de PDF con IA: prompts, esquemas y la CADENA de proveedores.
 *
 * El proveedor es Google Gemini (Generative Language API, REST puro para no
 * añadir dependencias), pero no se depende de un solo modelo: si uno falla
 * —cupo diario agotado, 503, o retirada del modelo— se pasa al siguiente. Ver
 * CADENA_EXTRACCION más abajo.
 *
 * Hay además un motor alternativo de otro proveedor (Mistral, en
 * lib/mistral.ts) que NO forma parte de esa cadena: solo se usa cuando el
 * usuario lo acepta expresamente tras un fallo de Gemini. Ver el tipo `Motor`.
 *
 * Usa REST puro (fetch) para no añadir dependencias. Aprovecha la salida
 * estructurada (responseSchema) para que el modelo devuelva JSON validable.
 *
 * Requiere la variable de entorno GEMINI_API_KEY (clave gratuita de
 * Google AI Studio: https://aistudio.google.com/app/apikey).
 */

import { callMistral, mistralConfigurado, MISTRAL_MODEL } from "@/lib/mistral";

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
Extrae TODAS las filas cuya columna "Salidas" tenga un valor DISTINTO de 0, incluidas las
NEGATIVAS. Una cantidad negativa (ej. "-13,40") es una devolución o abono: mercancía que vuelve
al almacén, normalmente con un nº de albarán que empieza por "V" (ej. "VCLA/228"). Cuentan para
el total del bloque, así que NO se pueden omitir.

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
  CONSERVA EL SIGNO: si la cifra viene con un menos delante ("-13,40"), devuélvela negativa
  (-13.40). No la conviertas a positiva ni la descartes.
- "unidad": "tns" (las cantidades de este formato están en toneladas).

Reglas del FORMATO A:
- Incluye TODAS las filas con "Salidas" distinto de 0 (positivas Y negativas), incluso si "Nombre"
  o "Contrato" están vacíos o son el nombre de la propia empresa. En esos casos devuelve cadena
  vacía para esos campos.
- Ignora filas de totales, subtotales y existencias.
- Ignora únicamente las filas cuya "Salidas" sea 0 o esté vacía (esas son entradas, no salidas).
- Comprobación final: la suma de las cantidades que devuelvas, respetando los signos, debe dar
  exactamente el valor de la fila "Totales" de la columna "Salidas" de ese bloque. Si no cuadra,
  repasa el bloque: te has dejado alguna fila o has perdido un signo negativo.
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
export interface GeminiCallOptions {
  /** undefined = no tocar el default del modelo. 0 desactiva el "thinking". */
  thinkingBudget?: number;
  /**
   * Presupuesto TOTAL de reloj para la llamada entera, reintentos y esperas
   * incluidos. Es el único número que de verdad importa: la función que
   * envuelve esta llamada tiene un límite de duración en la plataforma
   * (ver `maxDuration`), y pasarse de ahí no da un error legible sino que
   * mata el proceso y deja al usuario mirando un diálogo colgado.
   */
  totalBudgetMs?: number;
  /** Techo del timeout de un intento individual. Se recorta al tiempo que quede. */
  fetchTimeoutMs?: number;
  /** Nº máximo de intentos. Por defecto 3. */
  maxAttempts?: number;
}

/**
 * Por debajo de esto no merece la pena lanzar otro intento: no daría tiempo
 * ni a que Gemini empiece a responder, y se consumiría el poco margen que
 * queda para devolver un error legible.
 */
const MIN_ATTEMPT_MS = 8_000;

// ============================================================
// PRESETS DE LLAMADA — un solo sitio donde ajustarlos
// ============================================================
//
// El modelo y el "thinking" de la extracción principal son la diferencia
// entre que esto funcione y que no. Medido sobre los PDF reales de
// producción (informe de 4 páginas / 27 retiradas, y listado de pesadas de
// 2 páginas):
//
//   gemini-3.5-flash + thinking por defecto → 135 s y 19 s  ← lo que había
//   gemini-2.5-flash + thinkingBudget 0     →  13 s y  3 s
//
// Con idéntico resultado: mismas 27 filas, mismas matrículas y contratos, y
// suma exacta contra los "Totales" impresos en el documento, estable en
// varias repeticiones. Los 135 s no cabían en NINGÚN presupuesto razonable
// de función serverless, así que la extracción se cortaba a medias y el
// usuario veía el diálogo colgado o un error de Gemini.
//
// Leer una tabla ya impresa es transcripción, no razonamiento: el "thinking"
// aquí no compraba exactitud, solo tiempo. Como efecto secundario se sale
// del cupo gratuito de 3.5-flash (20 peticiones/DÍA para todo el proyecto),
// que era otra fuente de errores intermitentes al agotarse.

/** Modelo de la extracción principal (salidas y auditoría). */
export const GEMINI_MODEL_EXTRACCION = "gemini-2.5-flash";

/**
 * Modelo de la segunda lectura de verificación. DISTINTO al de la extracción,
 * y esto no es un detalle: la capa gratuita limita a 20 peticiones por DÍA
 * **por modelo** (quotaId `GenerateRequestsPerDayPerProjectPerModel-FreeTier`,
 * comprobado en el error real de Google). Como cada PDF gasta dos peticiones,
 * poner las dos en el mismo modelo dejaría el sistema en 10 PDF al día;
 * repartidas, cada una tiene su propio cupo de 20 y el techo lo marca la
 * extracción: 20 PDF al día.
 *
 * `gemini-3.1-flash-lite` con thinking desactivado hace esta relectura en
 * 7-10 s y clavó las 27 pesadas y la suma exacta del PDF real en las tres
 * pruebas. Ojo al elegir alternativas: `gemini-2.5-flash-lite` responde 404
 * ("no longer available") y `gemini-3.5-flash-lite` responde 400.
 */
export const GEMINI_MODEL_VERIFICACION = "gemini-3.1-flash-lite";

/**
 * Presupuestos pensados para caber, con las dos llamadas en paralelo y las
 * consultas a la base de datos por detrás, dentro del `maxDuration` de 60 s
 * de la función (ver app/(dashboard)/layout.tsx).
 */
export const GEMINI_OPTIONS_EXTRACCION: GeminiCallOptions = {
  thinkingBudget: 0,
  // Lo medido sobre los PDF reales es 3-22 s. El presupuesto deja margen de
  // sobra para eso y, aun agotándolo entero, quedan ~20 s de los 60 de la
  // función para las consultas a la base de datos y para devolver la
  // respuesta (o un error legible) en vez de morir a medias.
  totalBudgetMs: 40_000,
  fetchTimeoutMs: 35_000,
  maxAttempts: 3,
};

/**
 * La verificación es una relectura mecánica de cifras (7-10 s medidos). Que
 * falle no impide importar: se degrada a un aviso ("no se han podido
 * contrastar las cantidades"), así que su presupuesto es ajustado a
 * propósito. Corre en paralelo con la extracción, de modo que no alarga el
 * total mientras se mantenga por debajo del presupuesto de aquella.
 */
export const GEMINI_OPTIONS_VERIFICACION: GeminiCallOptions = {
  thinkingBudget: 0,
  // 7-10 s en caliente, pero la primera llamada del día al modelo se ha visto
  // llegar a 23 s. El margen cubre ese arranque en frío sin descartar por
  // impaciencia una verificación que iba a llegar bien.
  totalBudgetMs: 35_000,
  fetchTimeoutMs: 30_000,
  maxAttempts: 2,
};

async function callGemini(
  pdfBase64: string,
  prompt: string,
  responseSchema: unknown,
  model: string = GEMINI_MODEL,
  options: GeminiCallOptions = {}
): Promise<unknown> {
  const {
    thinkingBudget,
    totalBudgetMs = 45_000,
    fetchTimeoutMs = totalBudgetMs,
    maxAttempts = 3,
  } = options;
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
      ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {}),
    },
  };

  // Reintentos con backoff ante errores transitorios (429 saturación de
  // cuota, 503 modelo sobrecargado, o que Gemini se quede sin responder). El
  // resto de errores no se reintentan.
  const RETRYABLE = new Set([429, 503]);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // fetch() no tiene timeout propio: si Gemini se queda sin responder (la
  // conexión se abre pero nunca llega la respuesta), la promesa no se resuelve
  // NI se rechaza. Por eso cada intento se aborta a su plazo.
  //
  // El plazo NO es fijo: se calcula sobre un DEADLINE absoluto común a toda la
  // llamada. La versión anterior derivaba el techo total del propio
  // fetchTimeoutMs (`fetchTimeoutMs * maxAttempts + 20s`), con lo que la
  // comprobación no podía saltar nunca —el presupuesto siempre daba de sobra
  // para todos los intentos que el bucle iba a hacer— y dos intentos de 100 s
  // se comían 200 s dentro de una función que la plataforma corta mucho antes.
  // Ahora manda el reloj: cada intento recibe lo que queda hasta el deadline y
  // no se empieza ninguno que no quepa, así que el peor caso es siempre un
  // error legible dentro del presupuesto, nunca un proceso muerto a medias.
  const deadline = Date.now() + totalBudgetMs;
  /** Tiempo restante, o 0 si ya se agotó. */
  const restante = () => Math.max(0, deadline - Date.now());

  let response: Response | null = null;
  let ultimoFalloTransitorio = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Un intento solo se lanza si le queda margen real para completarse.
    const margen = restante();
    if (margen < MIN_ATTEMPT_MS) {
      throw new Error(
        ultimoFalloTransitorio
          ? "Gemini está saturado ahora mismo y no ha respondido a tiempo. Espera un momento y reinténtalo."
          : `Gemini no respondió en ${Math.round(totalBudgetMs / 1000)}s. Puede que el servicio esté lento o el PDF sea muy grande; reinténtalo.`
      );
    }

    const attemptTimeoutMs = Math.min(fetchTimeoutMs, margen);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);
    let timedOut = false;
    let bodyJson: unknown;

    try {
      response = await fetch(`${GEMINI_ENDPOINT(model)}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      // Se lee el cuerpo bajo el mismo `signal`: si Gemini manda las
      // cabeceras pero se para a medio enviar el JSON, el timeout corta
      // también esa espera, no solo la conexión inicial.
      if (response.ok) {
        bodyJson = await response.json();
      }
    } catch (err) {
      timedOut = (err as Error).name === "AbortError";
      // Un timeout que se ha comido todo el presupuesto no se reintenta: si el
      // modelo ha necesitado más de lo que quedaba, repetir la misma petición
      // solo sirve para agotar el margen y acabar igual, pero más tarde. Los
      // fallos de red rápidos sí merecen otro intento.
      const puedeReintentar = attempt < maxAttempts && restante() >= MIN_ATTEMPT_MS;
      if (puedeReintentar) {
        await sleep(Math.min(attempt * 1200, restante()));
        continue;
      }
      throw timedOut
        ? new Error(
            `Gemini no respondió en ${Math.round(totalBudgetMs / 1000)}s. Puede que el PDF sea muy grande o el servicio esté lento; reinténtalo.`
          )
        : new Error(`No se pudo contactar con Gemini: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) {
      return parseGeminiBody(bodyJson);
    }

    // Respuesta de error: reintentar solo los transitorios, y solo si queda
    // presupuesto para que el reintento llegue a completarse.
    if (RETRYABLE.has(response.status)) {
      ultimoFalloTransitorio = true;
      const espera = Math.min(attempt * 1500, restante()); // 1.5s, luego 3s
      if (attempt < maxAttempts && restante() - espera >= MIN_ATTEMPT_MS) {
        await sleep(espera);
        continue;
      }
    }

    const detail = await response.text().catch(() => "");
    if (response.status === 429) {
      // El 429 de la capa gratuita cubre dos casos muy distintos: demasiadas
      // peticiones seguidas (se pasa en segundos) y cupo DIARIO agotado (no se
      // arregla esperando un rato). Como el mensaje de Google distingue el
      // segundo con "per day", se refleja aquí para no mandar al usuario a
      // reintentar en bucle algo que no va a funcionar hasta mañana.
      const cupoDiario = /per\s*day|daily/i.test(detail);
      throw new Error(
        cupoDiario
          ? "Se ha agotado el cupo diario gratuito de Gemini. No se podrán analizar más PDF hasta que se renueve (a medianoche, hora del Pacífico)."
          : "Gemini está recibiendo demasiadas peticiones seguidas. Espera unos segundos y reinténtalo."
      );
    }
    if (response.status === 503) {
      throw new Error("El modelo de Gemini está sobrecargado ahora mismo. Espera un momento y vuelve a intentarlo.");
    }
    throw new Error(`Gemini devolvió ${response.status}: ${detail.slice(0, 300)}`);
  }

  throw new Error("No se pudo obtener respuesta de Gemini tras varios intentos.");
}

/** Valida y extrae el JSON de la respuesta ya leída de Gemini. */
function parseGeminiBody(bodyJson: unknown): unknown {
  const json = bodyJson as {
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
export async function extractSalidasFromPdf(
  pdfBase64: string,
  motor: Motor = "gemini"
): Promise<unknown> {
  return ejecutarCadena(
    motor === "mistral" ? CADENA_SOLO_MISTRAL : CADENA_EXTRACCION,
    pdfBase64,
    EXTRACTION_PROMPT,
    RESPONSE_SCHEMA,
    { ...GEMINI_OPTIONS_EXTRACCION, etiqueta: "la extracción del PDF" }
  );
}

// ============================================================
// CADENA DE RESPALDO ENTRE MODELOS Y PROVEEDORES
// ============================================================

/** Un eslabón de la cadena: un modelo de Gemini, o Mistral. */
type Proveedor = { tipo: "gemini"; model: string } | { tipo: "mistral" };

/**
 * Orden en el que se intenta leer un PDF de salidas.
 *
 * La razón de que esto sea una CADENA y no un modelo fijo es el cupo: la capa
 * gratuita da 20 peticiones al día **por modelo**, no por proyecto. Cada
 * eslabón aporta su propio cupo, así que el techo diario sube de 20 PDF a 60
 * sin pagar nada. De paso cubre otras dos cosas:
 *  · los 503 puntuales ("modelo sobrecargado"), que son frecuentes;
 *  · la retirada de un modelo. `gemini-2.5-flash` sigue GA en el changelog
 *    oficial, pero las páginas de ciclo de vida apuntan al 16/10/2026 como
 *    fecha más temprana, y `gemini-2.5-flash-lite` ya responde 404. Con la
 *    cadena, el día que caiga uno la app sigue funcionando sola.
 *
 * Los dos primeros están verificados contra los PDF reales de producción, con
 * resultado exacto. El tercero no: está de red de seguridad, y solo entra en
 * juego cuando los anteriores ya han fallado.
 *
 * Mistral NO está aquí a propósito: cambiar de proveedor lo decide el usuario
 * (ver `Motor`).
 */
export const CADENA_EXTRACCION: Proveedor[] = [
  { tipo: "gemini", model: "gemini-2.5-flash" }, // verificado exacto
  { tipo: "gemini", model: "gemini-3.1-flash-lite" }, // verificado exacto
  { tipo: "gemini", model: "gemini-3.8-flash" }, // sin verificar
];

/**
 * La verificación es un control de calidad opcional: si falla, la importación
 * sigue con un aviso. Por eso su cadena es corta — no merece gastar
 * presupuesto ni cupo de más en algo que no bloquea.
 */
export const CADENA_VERIFICACION: Proveedor[] = [
  { tipo: "gemini", model: "gemini-3.1-flash-lite" },
  { tipo: "gemini", model: "gemini-2.5-flash" },
];

/** Cadena del PDF de "Aplicación" (puestas a disposición). */
export const CADENA_PUESTAS: Proveedor[] = [
  { tipo: "gemini", model: "gemini-2.5-flash" },
  { tipo: "gemini", model: "gemini-3.1-flash-lite" },
];

/**
 * Motor de lectura. Mistral NUNCA entra solo: se usa exclusivamente cuando el
 * usuario lo pide a mano, después de que Gemini haya fallado y el diálogo se lo
 * haya ofrecido. Decisión del usuario (03/09/2026): el motor por defecto es
 * Gemini, y cambiar de proveedor es algo que se acepta a conciencia, no un
 * automatismo silencioso — entre otras cosas porque la segunda lectura de
 * verificación no puede contrastar lo que lee Mistral.
 */
export type Motor = "gemini" | "mistral";

/** Cadena de un solo eslabón para la lectura manual con Mistral. */
const CADENA_SOLO_MISTRAL: Proveedor[] = [{ tipo: "mistral" }];

interface OpcionesCadena extends GeminiCallOptions {
  /** Cómo nombrar la operación en el mensaje de error final. */
  etiqueta: string;
}

/**
 * Recorre la cadena hasta que un proveedor responde, o hasta que se agota el
 * presupuesto.
 *
 * El presupuesto es de la CADENA ENTERA, no de cada intento: lo que manda es
 * que todo quepa en el `maxDuration` de la función. A cada eslabón se le da lo
 * que queda hasta el plazo, y no se empieza ninguno que no quepa. Esto encaja
 * especialmente bien con el fallo más habitual —el 429 por cupo agotado, que
 * responde en ~100 ms—: cuando el primero está sin cupo, el segundo se
 * encuentra el presupuesto casi intacto.
 */
async function ejecutarCadena(
  cadena: Proveedor[],
  pdfBase64: string,
  prompt: string,
  responseSchema: unknown,
  opciones: OpcionesCadena
): Promise<unknown> {
  // Presupuesto de la CADENA ENTERA (no de cada eslabón), para que todo quepa
  // en el maxDuration de la función aunque se recorra entera.
  const { etiqueta, totalBudgetMs = 45_000, ...restoGemini } = opciones;
  const deadline = Date.now() + totalBudgetMs;
  const restante = () => Math.max(0, deadline - Date.now());

  /** Proveedores que ni siquiera se han podido intentar, para el diagnóstico. */
  const saltados: string[] = [];
  const fallos: string[] = [];

  for (const proveedor of cadena) {
    if (proveedor.tipo === "mistral" && !mistralConfigurado()) {
      saltados.push("Mistral (sin MISTRAL_API_KEY)");
      continue;
    }
    if (restante() < MIN_ATTEMPT_MS) {
      saltados.push(proveedor.tipo === "gemini" ? proveedor.model : "Mistral");
      continue;
    }

    const nombre = proveedor.tipo === "gemini" ? proveedor.model : `Mistral (${MISTRAL_MODEL})`;
    try {
      if (proveedor.tipo === "gemini") {
        return await callGemini(pdfBase64, prompt, responseSchema, proveedor.model, {
          ...restoGemini,
          totalBudgetMs: restante(),
          // UN SOLO intento por modelo: la redundancia la da la cadena, y
          // cambiar de modelo es estrictamente mejor que repetir con el mismo.
          // Reintentar aquí era además contraproducente: ante un 429 por cupo
          // diario —el fallo más habitual— se gastaban tres peticiones inútiles
          // (el cupo no se recupera en segundos) antes de pasar al siguiente.
          maxAttempts: 1,
          // Tope por intento para que un modelo colgado no se coma el
          // presupuesto de toda la cadena. Una extracción legítima tarda
          // 3-22 s, así que 25 s no corta ninguna buena.
          fetchTimeoutMs: Math.min(restoGemini.fetchTimeoutMs ?? 25_000, 25_000),
        });
      }
      return await callMistral(pdfBase64, prompt, responseSchema, {
        totalBudgetMs: restante(),
      });
    } catch (err) {
      // Cualquier fallo de un proveedor pasa al siguiente: los motivos típicos
      // (cupo agotado, modelo sobrecargado, modelo retirado, respuesta ilegible)
      // son todos específicos de ESE proveedor, y el siguiente puede resolverlo.
      fallos.push(`${nombre}: ${(err as Error).message}`);
    }
  }

  const detalle = [...fallos, ...saltados.map((s) => `${s}: no intentado`)].join(" | ");
  throw new Error(
    `No se pudo completar ${etiqueta}: han fallado todos los modelos disponibles. ${detalle}`
  );
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
 *
 * Va con `thinkingBudget: 0` por defecto: es leer ocho campos etiquetados de
 * un formulario de una página, no una tarea que necesite razonamiento. Con el
 * "thinking" por defecto activado, este documento trivial llegaba a tardar más
 * que el presupuesto de la función y fallaba con el mismo error que las
 * salidas.
 */
export async function extractPuestaFromPdf(
  pdfBase64: string,
  motor: Motor = "gemini"
): Promise<unknown> {
  return ejecutarCadena(
    motor === "mistral" ? CADENA_SOLO_MISTRAL : CADENA_PUESTAS,
    pdfBase64,
    PUESTA_EXTRACTION_PROMPT,
    PUESTA_RESPONSE_SCHEMA,
    { thinkingBudget: 0, totalBudgetMs: 40_000, fetchTimeoutMs: 35_000, etiqueta: "la lectura de la puesta a disposición" }
  );
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
  columna "Salidas" sea DISTINTA de 0, incluidas las NEGATIVAS.
    · "ticket"    = "" (este formato no trae ticket).
    · "matricula" = la matrícula de esa fila.
    · "neto"      = valor de "Salidas". Aquí la COMA es separador DECIMAL:
                    "30,08" → 30.08. CONSERVA EL SIGNO: "-13,40" → -13.40.
                    Las negativas son devoluciones y cuentan para el total.
    · "unidad"    = "tns".

════════════════════════════════════════════════════════════════════════════════
TOTALES DECLARADOS
════════════════════════════════════════════════════════════════════════════════
Rellena "totales" con las cifras de total que el documento imprime de forma
explícita, una entrada por cada una:
- "RET. DIA:" → concepto "RET. DIA", con el valor y la mercancía de su bloque.
- "SALIDAS DIA:" → concepto "SALIDAS DIA".
- "Totales" (fila final de cada bloque del "Informe de Salidas a Vendedor") →
  concepto "Totales", tomando el valor de la columna "Salidas" de esa fila y la
  mercancía de la cabecera del bloque. Hay una por bloque: devuélvelas TODAS.
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
export async function extractPesadasVerification(pdfBase64: string): Promise<unknown> {
  return ejecutarCadena(
    CADENA_VERIFICACION,
    pdfBase64,
    VERIFICATION_PROMPT,
    VERIFICATION_RESPONSE_SCHEMA,
    { ...GEMINI_OPTIONS_VERIFICACION, etiqueta: "la segunda lectura de verificación" }
  );
}
