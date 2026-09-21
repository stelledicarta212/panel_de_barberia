import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  consumeRateLimit,
  getClientIp,
  rateLimitResponse,
  secureAuthHeaders
} from "@/lib/rate-limit";

const UNIFORM_SUCCESS_RESPONSE = {
  ok: true,
  message: "Si la cuenta existe, enviaremos instrucciones."
};

export async function POST(request: Request) {
  const recoverRequestEndpoint = process.env.DASHBOARD_RECOVER_REQUEST_ENDPOINT;

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
  const rawEmail = typeof payload.email === "string" ? payload.email.trim() : "";
  if (!rawEmail) {
    return NextResponse.json(
      { ok: false, message: "El correo electrónico es requerido." },
      { status: 400, headers: secureAuthHeaders() }
    );
  }

  const clientIp = getClientIp(request);
  const normalizedEmail = rawEmail.toLowerCase();
  const rateLimitKey = `reset_req:${clientIp}:${normalizedEmail}`;

  // Rate limit: 3 requests / hour / account+IP
  const limitCheck = await consumeRateLimit(rateLimitKey, 3, 3600, true);
  if (!limitCheck.allowed) {
    return rateLimitResponse(limitCheck.retryAfter);
  }

  const correlationId = randomUUID();

  if (!recoverRequestEndpoint) {
    console.error(`[RECOVER_REQUEST] correlation_id=${correlationId} error=endpoint_not_configured`);
    // Return uniform success to browser to prevent operational leakage
    return NextResponse.json(UNIFORM_SUCCESS_RESPONSE, {
      status: 200,
      headers: secureAuthHeaders()
    });
  }

  try {
    const upstream = await fetch(recoverRequestEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    if (!upstream.ok) {
      const errorText = await upstream.text().catch(() => "");
      console.error(
        `[RECOVER_REQUEST] correlation_id=${correlationId} upstream_status=${upstream.status} error=${errorText}`
      );
    }

    // Always return uniform 200 OK contract to the caller
    return NextResponse.json(UNIFORM_SUCCESS_RESPONSE, {
      status: 200,
      headers: secureAuthHeaders()
    });
  } catch (error) {
    console.error(
      `[RECOVER_REQUEST] correlation_id=${correlationId} network_error=${error instanceof Error ? error.message : String(error)}`
    );
    // Fail-closed to attacker by returning uniform response, preserving privacy
    return NextResponse.json(UNIFORM_SUCCESS_RESPONSE, {
      status: 200,
      headers: secureAuthHeaders()
    });
  }
}
