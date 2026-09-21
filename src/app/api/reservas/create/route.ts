import { NextResponse } from "next/server";
import {
  consumeRateLimit,
  getClientIp,
  rateLimitResponse,
  secureAuthHeaders
} from "@/lib/rate-limit";

const RESERVAS_CREATE_ENDPOINT =
  process.env.RESERVAS_CREATE_ENDPOINT ??
  process.env.DASHBOARD_RESERVAS_CREATE_ENDPOINT;

export async function POST(request: Request) {
  if (!RESERVAS_CREATE_ENDPOINT) {
    return NextResponse.json(
      {
        ok: false,
        code: "reservas_create_endpoint_not_configured",
        message: "El servidor no esta configurado correctamente."
      },
      { status: 500, headers: secureAuthHeaders() }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Body JSON invalido" },
      { status: 400, headers: secureAuthHeaders() }
    );
  }

  const clientIp = getClientIp(request);
  const barberiaId =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).barberia_id || (body as Record<string, unknown>).id_barberia || "global"
      : "global";
  const rateLimitKey = `booking_create:${clientIp}:${barberiaId}`;

  // Public booking creation limit: 15 requests / minute / IP+barberia
  const limitCheck = await consumeRateLimit(rateLimitKey, 15, 60, true);
  if (!limitCheck.allowed) {
    return rateLimitResponse(limitCheck.retryAfter);
  }

  try {
    const upstream = await fetch(RESERVAS_CREATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      cache: "no-store"
    });

    const text = await upstream.text().catch(() => "");
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        { ok: false, message: "Respuesta inválida del webhook de creación de citas" },
        { status: 502, headers: secureAuthHeaders() }
      );
    }

    return NextResponse.json(data, { status: upstream.status, headers: secureAuthHeaders() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Error de proxy" },
      { status: 502, headers: secureAuthHeaders() }
    );
  }
}
