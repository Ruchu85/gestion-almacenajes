import { NextResponse } from "next/server";

/**
 * Valida la API Key de Business Central en el header Authorization.
 * Retorna un NextResponse de error si la clave es inválida, o null si es correcta.
 *
 * BC debe enviar: Authorization: Bearer <BC_API_KEY>
 */
export function validateBcApiKey(request: Request): NextResponse | null {
  const apiKey = process.env.BC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "server_configuration_error", detail: "BC_API_KEY not set" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: "Missing Authorization: Bearer <key>" },
      { status: 401 }
    );
  }

  if (authHeader.slice(7) !== apiKey) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", detail: "Invalid API key" },
      { status: 401 }
    );
  }

  return null;
}

/** Respuesta estándar para errores de validación Zod */
export function validationError(message: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: "validation_error", detail: message },
    { status: 400 }
  );
}

/** Respuesta estándar cuando una referencia FK no existe en la BD */
export function referenceError(detail: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: "reference_not_found", detail },
    { status: 422 }
  );
}

/** Respuesta estándar para errores de base de datos */
export function dbError(message: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: "database_error", detail: message },
    { status: 500 }
  );
}
