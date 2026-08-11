import { NextResponse } from "next/server";
import { normalizeSessionSetCookies } from "../cookies";

function jsonResponse(body: unknown, status: number, upstreamSetCookie?: string | null) {
  const response = NextResponse.json(body, { status });
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
        message: error instanceof Error ? error.message : "Error conectando con dashboard/login"
      },
      502
    );
  }
}
