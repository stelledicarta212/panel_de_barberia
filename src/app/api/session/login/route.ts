import { NextResponse } from "next/server";
import { normalizeSessionSetCookies, sanitizeAuthResponseBody } from "../cookies";
import {
  consumeRateLimit,
  getClientIp,
  rateLimitResponse,
  resetRateLimit,
  secureAuthHeaders
} from "@/lib/rate-limit";

export { sanitizeAuthResponseBody };

function jsonResponse(body: unknown, status: number, upstreamSetCookie?: string | null) {
  const response = NextResponse.json(body, {
    status,
    headers: secureAuthHeaders()
  });
  for (const cookie of normalizeSessionSetCookies(upstreamSetCookie)) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
}

export async function POST(request: Request) {
  const loginEndpoint = process.env.DASHBOARD_LOGIN_ENDPOINT;
  if (!loginEndpoint) {
    return jsonResponse(
      {
        ok: false,
        code: "dashboard_login_endpoint_not_configured",
        message: "El servidor no esta configurado correctamente."
      },
      500
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, message: "Body JSON invalido" }, 400);
  }

  const clientIp = getClientIp(request);
  const email =
    payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).email === "string"
      ? ((payload as Record<string, unknown>).email as string).toLowerCase().trim()
      : "anonymous";

  const rateLimitKey = `login:${clientIp}:${email}`;

  // Check if IP + account is currently in lockout cooldown (5 failed attempts / 15 min)
  const currentCheck = await consumeRateLimit(rateLimitKey, 5, 900, false);
  if (!currentCheck.allowed) {
    return rateLimitResponse(currentCheck.retryAfter);
  }

  try {
    const upstream = await fetch(loginEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    const text = await upstream.text().catch(() => "");
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return jsonResponse(
        {
          ok: false,
          message: "dashboard/login devolvio respuesta no JSON"
        },
        502
      );
    }

    if (upstream.status === 200) {
      // Clear failure counter on successful login
      await resetRateLimit(rateLimitKey);
    } else if (upstream.status === 401) {
      // Increment failure counter on invalid credentials
      const failureCheck = await consumeRateLimit(rateLimitKey, 5, 900, true);
      if (!failureCheck.allowed) {
        return rateLimitResponse(failureCheck.retryAfter);
      }
    }

    let setCookieHeader = upstream.headers.get("set-cookie");
    const { sanitizedBody, extractedCookie } = sanitizeAuthResponseBody(body);
    if (!setCookieHeader && extractedCookie) {
      setCookieHeader = extractedCookie;
    }

    return jsonResponse(sanitizedBody, upstream.status, setCookieHeader);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Error conectando con dashboard/login"
      },
      502
    );
  }
}
