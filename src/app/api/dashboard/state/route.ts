import { NextResponse } from "next/server";

const DASHBOARD_STATE_ENDPOINT =
  process.env.DASHBOARD_STATE_ENDPOINT ??
  process.env.NEXT_PUBLIC_DASHBOARD_STATE_ENDPOINT ??
  "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/dashboard/state";

function readBaSession(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  return match ? match[1] : "";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const baSession = readBaSession(request.headers.get("cookie") || "");
  const cookieHeader = baSession ? `ba_session=${baSession}` : "";

  const queryStr = searchParams.toString();
  const url = `${DASHBOARD_STATE_ENDPOINT}${queryStr ? `?${queryStr}` : ""}`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
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
          message: "dashboard/state devolvió respuesta no JSON"
        },
        { status: 502 }
      );
    }

    return NextResponse.json(body, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Error conectando con dashboard/state"
      },
      { status: 502 }
    );
  }
}
