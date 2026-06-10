import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const recoverRequestEndpoint = process.env.DASHBOARD_RECOVER_REQUEST_ENDPOINT;

  if (!recoverRequestEndpoint) {
    return NextResponse.json(
      {
        ok: false,
        code: "recover_endpoint_not_configured",
        message: "El servidor de recuperación no está configurado correctamente."
      },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Cuerpo JSON inválido." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { ok: false, message: "Payload inválido." },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;
  if (!payload.email || typeof payload.email !== "string" || !payload.email.trim()) {
    return NextResponse.json(
      { ok: false, message: "El correo electrónico es requerido." },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(recoverRequestEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    const text = await upstream.text().catch(() => "");
    let responseBody: unknown = {};
    try {
      responseBody = text ? JSON.parse(text) : {};
    } catch {
      responseBody = { message: text };
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { 
          ok: false, 
          message: (responseBody as Record<string, unknown>)?.message || "Error al solicitar la recuperación en el servidor." 
        },
        { status: upstream.status }
      );
    }

    return NextResponse.json(responseBody, { status: 200 });
  } catch (error) {
    console.error("Error proxying recover request:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Error interno de red en el proxy." },
      { status: 502 }
    );
  }
}
