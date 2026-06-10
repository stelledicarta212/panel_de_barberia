import { NextResponse } from "next/server";

const CITAS_ADMIN_WEBHOOK =
  process.env.CITAS_ADMIN_WEBHOOK ??
  "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/dashboard/citas";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  const baSession = match ? match[1] : "";
  if (!baSession) {
    return NextResponse.json(
      { ok: false, message: "Sesión requerida" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const upstream = await fetch(CITAS_ADMIN_WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `ba_session=${baSession}`
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
        { ok: false, message: "Respuesta inválida del webhook de citas" },
        { status: 502 }
      );
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Error de proxy" },
      { status: 502 }
    );
  }
}
