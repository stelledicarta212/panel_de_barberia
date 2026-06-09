import { NextResponse } from "next/server";

const CONFIG_UPDATE_ENDPOINT =
  process.env.CONFIG_UPDATE_ENDPOINT ??
  process.env.BA_CONFIG_UPDATE_ENDPOINT ??
  process.env.NEXT_PUBLIC_BA_CONFIG_UPDATE_ENDPOINT ??
  "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/configuracion/update";

function readBaSession(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  return match ? match[1] : "";
}

function jsonResponse(body: unknown, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  const baSession = readBaSession(request.headers.get("cookie") || "");
  if (!baSession) {
    return jsonResponse(
      {
        ok: false,
        code: "no_autorizado_anonimo",
        message: "Sesion requerida para actualizar configuracion"
      },
      401
    );
  }

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse(
      {
        ok: false,
        code: "body_invalido",
        message: "No se pudo leer el body de configuracion"
      },
      400
    );
  }

  try {
    const upstream = await fetch(CONFIG_UPDATE_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "text/plain;charset=UTF-8",
        Cookie: `ba_session=${baSession}`
      },
      body: rawBody,
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
          code: "respuesta_no_json",
          message: "configuracion/update devolvio respuesta no JSON"
        },
        502
      );
    }

    return jsonResponse(body, upstream.status);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        code: "configuracion_update_proxy_error",
        message: error instanceof Error ? error.message : "Error conectando con configuracion/update"
      },
      502
    );
  }
}
