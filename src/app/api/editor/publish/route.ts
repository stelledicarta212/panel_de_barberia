import { NextResponse } from "next/server";
import { getCorsHeaders, parseEditorPayload, validateEditorTenant } from "../auth";

const PUBLISH_ENDPOINT =
  process.env.EDITOR_PUBLISH_ENDPOINT ??
  process.env.PUBLISH_ENDPOINT ??
  process.env.BA_PUBLISH_ENDPOINT;

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  if (!PUBLISH_ENDPOINT) {
    return NextResponse.json(
      {
        ok: false,
        code: "editor_publish_endpoint_not_configured",
        message: "El servidor no esta configurado correctamente."
      },
      { status: 500, headers: corsHeaders }
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
        ? "Sesion requerida para publicar"
        : tenant.body.message;
    return NextResponse.json({ ...tenant.body, message }, { status: tenant.status, headers: corsHeaders });
  }

  try {
    const upstream = await fetch(PUBLISH_ENDPOINT, {
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
