import { NextResponse } from "next/server";

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
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
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
