import { NextResponse } from "next/server";
import { normalizeSessionSetCookies, sanitizeAuthResponseBody } from "../../session/cookies";
import { secureAuthHeaders } from "@/lib/rate-limit";

function getGoogleSessionEndpoint(): string {
  const sessionMe = process.env.SESSION_ME_ENDPOINT;
  return (
    process.env.GOOGLE_SESSION_ENDPOINT ??
    (sessionMe ? sessionMe.replace("/session/me", "/auth/google-session") : "")
  );
}

function getCanonicalOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "https://barberagency-barberagency.gymh5g.easypanel.host";

  const trimmed = configured.trim().replace(/\/+$/, "");
  if (trimmed && isSafeOrigin(trimmed)) {
    return trimmed;
  }
  return "https://barberagency-barberagency.gymh5g.easypanel.host";
}

function isSafeOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.host.toLowerCase();
    if (
      host.includes("localhost") ||
      host.includes("127.0.0.1") ||
      host.includes("0.0.0.0") ||
      host.includes(":3000") ||
      host.endsWith(".internal") ||
      host.endsWith(".local")
    ) {
      return false;
    }
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isTrustedHost(host: string): boolean {
  const h = host.toLowerCase().trim();
  // Strictly reject internal / localhost / container hostnames
  if (
    h.includes("localhost") ||
    h.includes("127.0.0.1") ||
    h.includes("0.0.0.0") ||
    h.includes(":3000") ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  ) {
    return false;
  }

  // Trusted host whitelist for BarberAgency
  if (
    h === "barberagency-barberagency.gymh5g.easypanel.host" ||
    h === "barberagency-app.gymh5g.easypanel.host" ||
    h === "barberagency.com" ||
    h === "www.barberagency.com"
  ) {
    return true;
  }

  // Allow host matching explicitly configured APP_URL / NEXT_PUBLIC_APP_URL
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (h === url.host.toLowerCase() && isSafeOrigin(configured)) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

function resolveSafeRedirectOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";

  if (forwardedHost && isTrustedHost(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  const host = request.headers.get("host");
  if (host && isTrustedHost(host)) {
    return `${forwardedProto}://${host}`.replace(/\/+$/, "");
  }

  return getCanonicalOrigin();
}

const CANONICAL_POST_LOGIN_PATH = "/inicio/";

function jsonResponse(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: secureAuthHeaders()
  });
}

function extractCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
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
        Allow: "POST"
      })
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: secureAuthHeaders({
      Allow: "POST, OPTIONS",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    })
  });
}

export async function POST(request: Request) {
  let credential = "";
  let bodyCsrfToken = "";

  const contentType = request.headers.get("content-type") || "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    try {
      const formData = await request.formData();
      credential = formData.get("credential")?.toString()?.trim() || "";
      bodyCsrfToken = formData.get("g_csrf_token")?.toString()?.trim() || "";
    } catch {
      try {
        const text = await request.text();
        const params = new URLSearchParams(text);
        credential = params.get("credential")?.trim() || "";
        bodyCsrfToken = params.get("g_csrf_token")?.trim() || "";
      } catch {
        return jsonResponse(
          { ok: false, error: "invalid_body", message: "Cuerpo de solicitud invalido" },
          400
        );
      }
    }
  } else if (contentType.includes("application/json")) {
    try {
      const json = await request.json();
      if (json && typeof json === "object") {
        const record = json as Record<string, unknown>;
        credential = typeof record.credential === "string" ? record.credential.trim() : "";
        bodyCsrfToken = typeof record.g_csrf_token === "string" ? record.g_csrf_token.trim() : "";
      }
    } catch {
      return jsonResponse(
        { ok: false, error: "invalid_json", message: "JSON invalido" },
        400
      );
    }
  } else {
    try {
      const text = await request.text();
      const params = new URLSearchParams(text);
      credential = params.get("credential")?.trim() || "";
      bodyCsrfToken = params.get("g_csrf_token")?.trim() || "";
    } catch {
      return jsonResponse(
        { ok: false, error: "invalid_body", message: "Cuerpo de solicitud invalido" },
        400
      );
    }
  }

  // 1. Missing credential validation
  if (!credential) {
    return jsonResponse(
      { ok: false, error: "missing_credential", message: "Credencial de Google ausente" },
      400
    );
  }

  // 2. Google double-submit CSRF cookie check
  const cookieCsrfToken = extractCookie(request, "g_csrf_token");
  if (!cookieCsrfToken) {
    return jsonResponse(
      { ok: false, error: "missing_csrf_cookie", message: "Cookie CSRF (g_csrf_token) ausente" },
      400
    );
  }

  // 3. Google double-submit CSRF body value check
  if (!bodyCsrfToken) {
    return jsonResponse(
      { ok: false, error: "missing_csrf_token", message: "Token CSRF (g_csrf_token) ausente en el formulario" },
      400
    );
  }

  // 4. Google double-submit CSRF equality check
  if (cookieCsrfToken !== bodyCsrfToken) {
    return jsonResponse(
      { ok: false, error: "csrf_mismatch", message: "Token CSRF no coincide con la cookie de sesion" },
      400
    );
  }

  // 5. Check upstream endpoint configuration
  const googleSessionEndpoint = getGoogleSessionEndpoint();
  if (!googleSessionEndpoint) {
    return jsonResponse(
      {
        ok: false,
        error: "endpoint_not_configured",
        message: "Servicio de autenticacion de Google no configurado"
      },
      500
    );
  }

  // 6. Upstream authentication call
  try {
    const upstream = await fetch(googleSessionEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        token: credential,
        id_token: credential
      }),
      cache: "no-store"
    });

    if (upstream.status !== 200) {
      return jsonResponse(
        {
          ok: false,
          error: "auth_failed",
          message: "Credencial de Google no valida o rechazada"
        },
        upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502
      );
    }

    const text = await upstream.text().catch(() => "");
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: "invalid_upstream_response",
          message: "Respuesta no valida del servidor de autenticacion"
        },
        502
      );
    }

    let setCookieHeader = upstream.headers.get("set-cookie");
    const { extractedCookie } = sanitizeAuthResponseBody(body);
    if (!setCookieHeader && extractedCookie) {
      setCookieHeader = extractedCookie;
    }

    const cookies = normalizeSessionSetCookies(setCookieHeader);

    const safeOrigin = resolveSafeRedirectOrigin(request);
    const destination = new URL(CANONICAL_POST_LOGIN_PATH, safeOrigin);

    const response = NextResponse.redirect(destination, 303);

    const secHeaders = secureAuthHeaders();
    for (const [key, val] of Object.entries(secHeaders)) {
      response.headers.set(key, val);
    }

    for (const cookie of cookies) {
      response.headers.append("Set-Cookie", cookie);
    }

    return response;
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: "upstream_error",
        message: "No fue posible conectar con el servicio de autenticacion"
      },
      502
    );
  }
}
