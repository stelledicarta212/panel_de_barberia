import { NextResponse } from "next/server";
import {
  consumeRateLimit,
  getClientIp,
  rateLimitResponse,
  secureAuthHeaders
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  const recoverResetEndpoint = process.env.DASHBOARD_RECOVER_RESET_ENDPOINT;

  if (!recoverResetEndpoint) {
    return NextResponse.json(
      {
        ok: false,
        code: "recover_endpoint_not_configured",
        message: "El servidor de recuperación no está configurado correctamente."
      },
      { status: 500, headers: secureAuthHeaders() }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Cuerpo JSON inválido." },
      { status: 400, headers: secureAuthHeaders() }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { ok: false, message: "Payload inválido." },
      { status: 400, headers: secureAuthHeaders() }
    );
  }

  const payload = body as Record<string, unknown>;
  const rawToken = typeof payload.token === "string" ? payload.token.trim() : "";
  if (!rawToken) {
    return NextResponse.json(
      { ok: false, message: "El token de recuperación es requerido." },
      { status: 400, headers: secureAuthHeaders() }
    );
  }

  if (!payload.new_password || typeof payload.new_password !== "string" || payload.new_password.length < 6) {
    return NextResponse.json(
      { ok: false, message: "La nueva contraseña es requerida y debe tener al menos 6 caracteres." },
      { status: 400, headers: secureAuthHeaders() }
    );
  }

  const clientIp = getClientIp(request);
  const tokenPrefix = rawToken.substring(0, 16);
  const rateLimitKey = `reset_confirm:${clientIp}:${tokenPrefix}`;

  // Rate limit: 5 attempts / 30 min (1800s)
  const limitCheck = await consumeRateLimit(rateLimitKey, 5, 1800, true);
  if (!limitCheck.allowed) {
    return rateLimitResponse(limitCheck.retryAfter);
  }

  try {
    const upstream = await fetch(recoverResetEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    const text = await upstream.text().catch(() => "");
    let responseBody: unknown = {};
    try {
      responseBody = text ? JSON.parse(text) : {};
    } catch {
      responseBody = { message: text };
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { 
          ok: false, 
          message: (responseBody as Record<string, unknown>)?.message || "Error al restablecer la contraseña en el servidor." 
        },
        { status: upstream.status, headers: secureAuthHeaders() }
      );
    }

    return NextResponse.json(responseBody, { status: 200, headers: secureAuthHeaders() });
  } catch (error) {
    console.error("Error proxying recover reset:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Error interno de red en el proxy." },
      { status: 502, headers: secureAuthHeaders() }
    );
  }
}
