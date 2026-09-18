import { NextResponse } from "next/server";
import { normalizeSessionSetCookies, sanitizeAuthResponseBody } from "../../session/cookies";
import { getCorsHeaders } from "../../editor/auth";

export { sanitizeAuthResponseBody };

const SESSION_ME_ENDPOINT = process.env.SESSION_ME_ENDPOINT;
const GOOGLE_SESSION_ENDPOINT =
  process.env.GOOGLE_SESSION_ENDPOINT ??
  (SESSION_ME_ENDPOINT ? SESSION_ME_ENDPOINT.replace("/session/me", "/auth/google-session") : "");

function jsonResponse(body: unknown, status: number, request: Request, upstreamSetCookie?: string | null) {
  const response = NextResponse.json(body, { status, headers: getCorsHeaders(request, "POST, OPTIONS") });
  for (const cookie of normalizeSessionSetCookies(upstreamSetCookie)) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, message: "Body JSON invalido" }, 400, request);
  }

  try {
    const upstream = await fetch(GOOGLE_SESSION_ENDPOINT, {
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
          message: "google-session devolvio respuesta no JSON"
        },
        502,
        request
      );
    }

    let setCookieHeader = upstream.headers.get("set-cookie");
    const { sanitizedBody, extractedCookie } = sanitizeAuthResponseBody(body);
    if (!setCookieHeader && extractedCookie) {
      setCookieHeader = extractedCookie;
    }

    return jsonResponse(sanitizedBody, upstream.status, request, setCookieHeader);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Error conectando con google-session"
      },
      502,
      request
    );
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request, "POST, OPTIONS")
  });
}
