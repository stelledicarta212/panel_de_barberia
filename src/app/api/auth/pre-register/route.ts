import { NextResponse } from "next/server";
import { secureAuthHeaders } from "@/lib/rate-limit";
import { getCorsHeaders } from "../../editor/auth";
import {
  createPreauthRegistrationToken,
  buildPreauthCookie,
  cleanName
} from "@/lib/preauth-registration";

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object") {
      body = raw as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "JSON invalido" },
      {
        status: 400,
        headers: secureAuthHeaders(getCorsHeaders(request, "POST, OPTIONS"))
      }
    );
  }

  const nombre = cleanName(body.nombre);
  const apellido = cleanName(body.apellido);

  if (!nombre || !apellido) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_name",
        message: "Escribe nombre y apellido antes de continuar."
      },
      {
        status: 400,
        headers: secureAuthHeaders(getCorsHeaders(request, "POST, OPTIONS"))
      }
    );
  }

  try {
    const result = createPreauthRegistrationToken(nombre, apellido);
    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_name",
          message: "Nombre o apellido invalido."
        },
        {
          status: 400,
          headers: secureAuthHeaders(getCorsHeaders(request, "POST, OPTIONS"))
        }
      );
    }

    const response = NextResponse.json(
      { ok: true },
      {
        status: 200,
        headers: secureAuthHeaders(getCorsHeaders(request, "POST, OPTIONS"))
      }
    );

    response.headers.append("Set-Cookie", buildPreauthCookie(result.token));
    return response;
  } catch (err) {
    console.error("[pre-register] Configuration or internal error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "service_misconfigured",
        message: "Error interno de configuracion"
      },
      {
        status: 500,
        headers: secureAuthHeaders(getCorsHeaders(request, "POST, OPTIONS"))
      }
    );
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: secureAuthHeaders(getCorsHeaders(request, "POST, OPTIONS"))
  });
}

export async function GET() {
  return new NextResponse(
    JSON.stringify({
      ok: false,
      error: "method_not_allowed",
      message: "Metodo no permitido. Solo se acepta POST."
    }),
    {
      status: 405,
      headers: secureAuthHeaders({
        "Content-Type": "application/json",
        Allow: "POST, OPTIONS"
      })
    }
  );
}
