import { NextResponse } from "next/server";
import { getCorsHeaders } from "../../editor/auth";
import { normalizeSessionSetCookies } from "../cookies";

const SESSION_ME_ENDPOINT =
  process.env.SESSION_ME_ENDPOINT;

function jsonResponse(body: unknown, status: number, request: Request, upstreamSetCookie?: string | null) {
  const response = NextResponse.json(body, { status, headers: getCorsHeaders(request, "GET, OPTIONS") });
  for (const cookie of normalizeSessionSetCookies(upstreamSetCookie)) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
}

function readBaSession(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  return match ? match[1] : "";
}

export async function GET(request: Request) {
  if (!SESSION_ME_ENDPOINT) {
    return jsonResponse(
      {
        ok: false,
        code: "session_me_endpoint_not_configured",
        message: "El servidor no esta configurado correctamente.",
        next_action: "login"
      },
      500,
      request
    );
  }

  const baSession = readBaSession(request.headers.get("cookie") || "");
  const cookieHeader = baSession ? `ba_session=${baSession}` : "";

  try {
    const upstream = await fetch(SESSION_ME_ENDPOINT, {
      method: "GET",
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
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
          message: "session/me devolvio respuesta no JSON",
          next_action: "login"
        },
        502,
        request
      );
    }
    let setCookieHeader = upstream.headers.get("set-cookie");
    if (!setCookieHeader && body && typeof body === "object") {
      const bodyRecord = body as Record<string, unknown>;
      if (typeof bodyRecord["set_cookie"] === "string" && bodyRecord["set_cookie"]) {
        setCookieHeader = bodyRecord["set_cookie"];
      }
    }

    return jsonResponse(body, upstream.status, request, setCookieHeader);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Error conectando con session/me",
        next_action: "login"
      },
      502,
      request
    );
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request, "GET, OPTIONS")
  });
}
