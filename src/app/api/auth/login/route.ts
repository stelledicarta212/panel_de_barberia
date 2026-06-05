import { NextResponse } from "next/server";

const DASHBOARD_LOGIN_ENDPOINT =
  process.env.DASHBOARD_LOGIN_ENDPOINT ??
  process.env.NEXT_PUBLIC_DASHBOARD_LOGIN_ENDPOINT ??
  "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/dashboard/login";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Body JSON invalido" }, { status: 400 });
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
      return NextResponse.json(
        {
          ok: false,
          message: "dashboard/login devolvio respuesta no JSON"
        },
        { status: 502 }
      );
    }

    const response = NextResponse.json(body, { status: upstream.status });

    const upstreamSetCookie = upstream.headers.get("set-cookie");
    if (upstreamSetCookie) {
      const match = upstreamSetCookie.match(/(?:^|;|,\s*)ba_session=([^;,\s]+)/);
      const token = match ? match[1] : "";
      if (token) {
        // Set cookie via standard web headers API
        response.headers.set(
          "Set-Cookie",
          `ba_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`
        );
      }
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Error conectando con dashboard/login"
      },
      { status: 502 }
    );
  }
}
