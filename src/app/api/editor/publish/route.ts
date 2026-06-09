import { NextResponse } from "next/server";

const PUBLISH_ENDPOINT =
  process.env.PUBLISH_ENDPOINT ??
  process.env.BA_PUBLISH_ENDPOINT ??
  process.env.NEXT_PUBLIC_BA_PUBLISH_ENDPOINT ??
  "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/dashboard/publicar";

function readBaSession(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  return match ? match[1] : "";
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigins = [
    "https://barberagency-barberagency.gymh5g.easypanel.host",
    "http://localhost:3000",
    "http://localhost:8000"
  ];
  
  let allowedOrigin = "";
  if (allowedOrigins.includes(origin) || origin.endsWith(".easypanel.host")) {
    allowedOrigin = origin;
  } else {
    allowedOrigin = "https://barberagency-barberagency.gymh5g.easypanel.host";
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true"
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  const baSession = readBaSession(request.headers.get("cookie") || "");
  
  if (!baSession) {
    return NextResponse.json(
      {
        ok: false,
        code: "no_autorizado_anonimo",
        message: "Sesion requerida para publicar"
      },
      { status: 401, headers: corsHeaders }
    );
  }

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "body_invalido",
        message: "No se pudo leer el body de la publicacion"
      },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const upstream = await fetch(PUBLISH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
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
      return NextResponse.json(
        {
          ok: false,
          code: "respuesta_no_json",
          message: "El servidor de publicacion devolvio una respuesta no valida"
        },
        { status: 502, headers: corsHeaders }
      );
    }

    return NextResponse.json(body, { status: upstream.status, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "publish_proxy_error",
        message: error instanceof Error ? error.message : "Error de conexion con el servidor de publicacion"
      },
      { status: 502, headers: corsHeaders }
    );
  }
}
