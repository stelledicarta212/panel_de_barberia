import { NextResponse } from "next/server";

const DASHBOARD_LOGIN_ENDPOINT =
  process.env.DASHBOARD_LOGIN_ENDPOINT ??
  process.env.NEXT_PUBLIC_DASHBOARD_LOGIN_ENDPOINT ??
  "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/dashboard/login";

function jsonResponse(body: unknown, status: number, upstreamSetCookie?: string | null) {
  const response = NextResponse.json(body, { status });
  if (upstreamSetCookie) {
    response.headers.set("Set-Cookie", upstreamSetCookie);
  }
  return response;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, message: "Body JSON invalido" }, 400);
  }

  try {
    const upstream = await fetch(DASHBOARD_LOGIN_ENDPOINT, {
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

    return jsonResponse(body, upstream.status, upstream.headers.get("set-cookie"));
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
