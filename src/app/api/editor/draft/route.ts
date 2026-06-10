import { NextResponse } from "next/server";
import { getCorsHeaders, parseEditorPayload, validateEditorTenant } from "../auth";

const DRAFT_ENDPOINT =
  process.env.DRAFT_SAVE_ENDPOINT ??
  process.env.BA_DRAFT_SAVE_ENDPOINT ??
  "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/landing/draft/save";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "body_invalido",
        message: "No se pudo leer el body del borrador"
      },
      { status: 400, headers: corsHeaders }
    );
  }

  const parsed = parseEditorPayload(rawBody);
  if (!parsed.ok) {
    return NextResponse.json(parsed.body, { status: parsed.status, headers: corsHeaders });
  }

  let tenant;
  try {
    tenant = await validateEditorTenant(request, parsed.payload);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "session_validation_error",
        message: error instanceof Error ? error.message : "Error validando sesion"
      },
      { status: 502, headers: corsHeaders }
    );
  }

  if (!tenant.ok) {
    const message =
      tenant.body.code === "no_autorizado_anonimo"
        ? "Sesion requerida para guardar borrador"
        : tenant.body.message;
    return NextResponse.json({ ...tenant.body, message }, { status: tenant.status, headers: corsHeaders });
  }

  try {
    const upstream = await fetch(DRAFT_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: `ba_session=${tenant.baSession}`
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
          message: "El servidor de borrador devolvio una respuesta no valida"
        },
        { status: 502, headers: corsHeaders }
      );
    }

    return NextResponse.json(body, { status: upstream.status, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "draft_proxy_error",
        message: error instanceof Error ? error.message : "Error de conexion con el servidor de borrador"
      },
      { status: 502, headers: corsHeaders }
    );
  }
}
