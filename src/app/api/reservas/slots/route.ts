import { NextResponse } from "next/server";

const RESERVAS_SLOTS_ENDPOINT =
  process.env.RESERVAS_SLOTS_ENDPOINT ??
  process.env.DASHBOARD_RESERVAS_SLOTS_ENDPOINT;

export async function GET(request: Request) {
  if (!RESERVAS_SLOTS_ENDPOINT) {
    return NextResponse.json(
      {
        ok: false,
        code: "reservas_slots_endpoint_not_configured",
        message: "El servidor no esta configurado correctamente."
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const targetUrl = new URL(RESERVAS_SLOTS_ENDPOINT);
  searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    const text = await upstream.text().catch(() => "");
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        { ok: false, message: "Respuesta inválida del webhook de disponibilidad" },
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
