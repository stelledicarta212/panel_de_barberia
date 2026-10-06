import { NextResponse } from "next/server";
import { normalizeSessionSetCookies, sanitizeAuthResponseBody } from "../../session/cookies";
import { secureAuthHeaders } from "@/lib/rate-limit";
import {
  PREAUTH_COOKIE_NAME,
  consumePreauthRegistration,
  buildClearPreauthCookie
} from "@/lib/preauth-registration";

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

function isBrowserNavigation(request: Request): boolean {
  const accept = request.headers.get("accept") || "";
  const secFetchDest = request.headers.get("sec-fetch-dest") || "";
  const secFetchMode = request.headers.get("sec-fetch-mode") || "";

  if (secFetchDest === "document" || secFetchMode === "navigate") {
    return true;
  }
  if (accept.includes("text/html")) {
    return true;
  }
  return false;
}

function sendError(
  request: Request,
  errorCode: string,
  message: string,
  httpStatus = 400
) {
  const clearPreauth = buildClearPreauthCookie();

  if (!isBrowserNavigation(request)) {
    const res = jsonResponse({ ok: false, error: errorCode, message }, httpStatus);
    res.headers.append("Set-Cookie", clearPreauth);
    return res;
  }

  const safeOrigin = resolveSafeRedirectOrigin(request);
  const redirectTarget = new URL(
    `/registro/?auth_error=${encodeURIComponent(errorCode)}`,
    safeOrigin
  );
  const res = NextResponse.redirect(redirectTarget, 303);
  const secHeaders = secureAuthHeaders();
  for (const [k, v] of Object.entries(secHeaders)) {
    res.headers.set(k, v);
  }
  res.headers.append("Set-Cookie", clearPreauth);
  return res;
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
        return sendError(
          request,
          "invalid_body",
          "Cuerpo de solicitud invalido",
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
      return sendError(
        request,
        "invalid_json",
        "JSON invalido",
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
      return sendError(
        request,
        "invalid_body",
        "Cuerpo de solicitud invalido",
        400
      );
    }
  }

  // 1. Missing credential validation
  if (!credential) {
    return sendError(
      request,
      "missing_credential",
      "Credencial de Google ausente",
      400
    );
  }

  // 2. Google double-submit CSRF cookie check
  const cookieCsrfToken = extractCookie(request, "g_csrf_token");
  if (!cookieCsrfToken) {
    return sendError(
      request,
      "missing_csrf_cookie",
      "Cookie CSRF (g_csrf_token) ausente",
      400
    );
  }

  // 3. Google double-submit CSRF body value check
  if (!bodyCsrfToken) {
    return sendError(
      request,
      "missing_csrf_token",
      "Token CSRF (g_csrf_token) ausente en el formulario",
      400
    );
  }

  // 4. Google double-submit CSRF equality check
  if (cookieCsrfToken !== bodyCsrfToken) {
    return sendError(
      request,
      "csrf_mismatch",
      "Token CSRF no coincide con la cookie de sesion",
      400
    );
  }

  // 5. Recover and validate pre-auth registration state if present
  let preauthData: { nombre: string; apellido: string } | null = null;
  const preauthCookie = extractCookie(request, PREAUTH_COOKIE_NAME);
  if (preauthCookie) {
    try {
      const consumption = await consumePreauthRegistration(preauthCookie);
      if (consumption.success && consumption.data) {
        preauthData = {
          nombre: consumption.data.nombre,
          apellido: consumption.data.apellido
        };
      } else if (consumption.reason === "already_consumed_replay") {
        return sendError(
          request,
          "replayed_preauth",
          "Estado de registro ya consumido o reusado",
          400
        );
      } else if (consumption.reason === "expired") {
        return sendError(
          request,
          "expired_preauth",
          "El registro previo ha expirado",
          400
        );
      } else if (consumption.reason === "configuration_error") {
        return sendError(
          request,
          "service_misconfigured",
          "Error de configuracion en el servicio de registro",
          500
        );
      } else if (consumption.reason?.startsWith("db_rpc_")) {
        return sendError(
          request,
          "service_unavailable",
          "Servicio de verificacion no disponible",
          503
        );
      } else {
        return sendError(
          request,
          "invalid_preauth",
          "Estado de registro previo no valido",
          400
        );
      }
    } catch {
      return sendError(
        request,
        "service_misconfigured",
        "Error de configuracion en el servicio de registro",
        500
      );
    }
  }

  // 6. Check upstream endpoint configuration
  const googleSessionEndpoint = getGoogleSessionEndpoint();
  if (!googleSessionEndpoint) {
    return sendError(
      request,
      "endpoint_not_configured",
      "Servicio de autenticacion de Google no configurado",
      500
    );
  }

  // 7. Upstream authentication call preserving name contract
  try {
    const upstreamPayload: Record<string, unknown> = {
      token: credential,
      id_token: credential
    };
    if (preauthData?.nombre) {
      upstreamPayload.nombre = preauthData.nombre;
    }
    if (preauthData?.apellido) {
      upstreamPayload.apellido = preauthData.apellido;
    }

    const upstream = await fetch(googleSessionEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(upstreamPayload),
      cache: "no-store"
    });

    if (upstream.status !== 200) {
      return sendError(
        request,
        "auth_failed",
        "Credencial de Google no valida o rechazada",
        upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502
      );
    }

    const text = await upstream.text().catch(() => "");
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return sendError(
        request,
        "invalid_upstream_response",
        "Respuesta no valida del servidor de autenticacion",
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

    // Always clear pre-auth state cookie upon completion
    response.headers.append("Set-Cookie", buildClearPreauthCookie());

    return response;
  } catch {
    return sendError(
      request,
      "upstream_error",
      "No fue posible conectar con el servicio de autenticacion",
      502
    );
  }
}
