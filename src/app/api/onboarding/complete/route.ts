import { NextResponse } from "next/server";
import { getCorsHeaders } from "../../editor/auth";

const SESSION_ME_ENDPOINT = process.env.SESSION_ME_ENDPOINT;
const ONBOARDING_ENDPOINT =
  process.env.ONBOARDING_ENDPOINT ??
  "https://barberagency-n8n.gymh5g.easypanel.host/webhook/registro-barberia";

function readBaSession(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  return match ? match[1] : "";
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);

  if (!SESSION_ME_ENDPOINT) {
    return NextResponse.json(
      {
        ok: false,
        code: "session_me_endpoint_not_configured",
        message: "El servidor no esta configurado correctamente (SESSION_ME_ENDPOINT)."
      },
      { status: 500, headers: corsHeaders }
    );
  }

  const baSession = readBaSession(request.headers.get("cookie") || "");
  if (!baSession) {
    return NextResponse.json(
      {
        ok: false,
        code: "no_autorizado",
        message: "Sesion requerida para completar onboarding."
      },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    // 1. Validar sesion contra el endpoint /session/me
    const sessionRes = await fetch(SESSION_ME_ENDPOINT, {
      method: "GET",
      headers: { Cookie: `ba_session=${baSession}` },
      cache: "no-store"
    });

    if (!sessionRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: "session_invalida",
          message: "Sesion no valida."
        },
        { status: 401, headers: corsHeaders }
      );
    }

    const sessionData = await sessionRes.json().catch(() => ({}));
    if (!sessionData || sessionData.ok !== true) {
      return NextResponse.json(
        {
          ok: false,
          code: "session_invalida",
          message: "Sesion no valida."
        },
        { status: 401, headers: corsHeaders }
      );
    }

    // 2. Parsear el body enviado por el cliente
    let rawBody = "";
    try {
      rawBody = await request.text();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          code: "body_invalido",
          message: "No se pudo leer el body del onboarding"
        },
        { status: 400, headers: corsHeaders }
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json(
        {
          ok: false,
          code: "body_invalido",
          message: "Body JSON invalido"
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Garantizar que no se confie en variables de auth enviadas por el cliente
    const { auth_ok, auth_user_id, auth_message, ...cleanBody } = body;

    // 3. Reenviar al webhook de n8n con la cookie ba_session para su verificacion JWT
    const upstreamRes = await fetch(ONBOARDING_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `ba_session=${baSession}`
      },
      body: JSON.stringify(cleanBody),
      cache: "no-store"
    });

    const text = await upstreamRes.text().catch(() => "");
    let upstreamData: any = {};
    try {
      upstreamData = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        {
          ok: false,
          code: "respuesta_no_json",
          message: "El servidor de onboarding devolvio una respuesta no valida."
        },
        { status: 502, headers: corsHeaders }
      );
    }

    if (!upstreamRes.ok || upstreamData.ok === false) {
      return NextResponse.json(
        {
          ok: false,
          message: upstreamData.message || upstreamData.error || "Error al completar el onboarding."
        },
        {
          status: upstreamRes.status >= 400 && upstreamRes.status < 600 ? upstreamRes.status : 400,
          headers: corsHeaders
        }
      );
    }

    return NextResponse.json(upstreamData, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Error al procesar el onboarding."
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}
