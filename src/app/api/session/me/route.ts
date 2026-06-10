import { NextResponse } from "next/server";

const SESSION_ME_ENDPOINT =
  process.env.SESSION_ME_ENDPOINT ??
  "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/session/me";

function jsonResponse(body: unknown, status: number, upstreamSetCookie?: string | null) {
  const response = NextResponse.json(body, { status });
  if (upstreamSetCookie) {
    response.headers.set("Set-Cookie", upstreamSetCookie);
  }
  return response;
}

function readBaSession(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  return match ? match[1] : "";
}

export async function GET(request: Request) {
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
        502
      );
    }
    let setCookieHeader = upstream.headers.get("set-cookie");
    if (!setCookieHeader && body && typeof body === "object") {
      const bodyRecord = body as Record<string, unknown>;
      if (typeof bodyRecord["set_cookie"] === "string" && bodyRecord["set_cookie"]) {
        setCookieHeader = bodyRecord["set_cookie"];
      }
    }

    return jsonResponse(body, upstream.status, setCookieHeader);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Error conectando con session/me",
        next_action: "login"
      },
      502
    );
  }
}
