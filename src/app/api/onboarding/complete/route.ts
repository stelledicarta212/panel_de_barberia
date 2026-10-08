import { NextResponse } from "next/server";
import {
  getCorsHeaders,
  isValidCanonicalStorageUrl,
  isValidSlug
} from "../../editor/auth";
import {
  consumeRateLimit,
  getClientIp,
  rateLimitResponse,
  secureAuthHeaders
} from "@/lib/rate-limit";

function getSessionMeEndpoint(): string | null {
  const envVal = process.env.SESSION_ME_ENDPOINT;
  if (envVal && envVal.trim().length > 0) return envVal.trim();
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (base && base.trim().length > 0) {
    return `${base.trim().replace(/\/+$/, "")}/api/session/me`;
  }
  return null;
}

function getOnboardingEndpoint(): string | null {
  const envVal = process.env.ONBOARDING_ENDPOINT;
  if (!envVal || envVal.trim().length === 0) return null;
  const trimmed = envVal.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function readBaSession(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  return match ? match[1] : "";
}

function validateCatalogImageUrls(data: Record<string, unknown>): { ok: true } | { ok: false; code: string; message: string } {
  const candidateServices = Array.isArray(data.servicios)
    ? data.servicios
    : (data.draft && typeof data.draft === "object" && Array.isArray((data.draft as Record<string, unknown>).servicios))
    ? (data.draft as Record<string, unknown>).servicios
    : [];

  if (Array.isArray(candidateServices)) {
    for (let i = 0; i < candidateServices.length; i++) {
      const s = candidateServices[i];
      if (s && typeof s === "object") {
        const imgUrl = (s as Record<string, unknown>).imagen_url ?? (s as Record<string, unknown>).image_url;
        if (typeof imgUrl === "string" && imgUrl.trim().length > 0) {
          if (!isValidCanonicalStorageUrl(imgUrl.trim())) {
            return {
              ok: false,
              code: "imagen_url_invalida",
              message: `La imagen del servicio en posicion ${i + 1} no tiene una URL valida o segura.`
            };
          }
        }
      }
    }
  }

  const candidateBarbers = Array.isArray(data.barberos)
    ? data.barberos
    : (data.draft && typeof data.draft === "object" && Array.isArray((data.draft as Record<string, unknown>).barberos))
    ? (data.draft as Record<string, unknown>).barberos
    : [];

  if (Array.isArray(candidateBarbers)) {
    for (let i = 0; i < candidateBarbers.length; i++) {
      const b = candidateBarbers[i];
      if (b && typeof b === "object") {
        const fotoUrl = (b as Record<string, unknown>).foto_url ?? (b as Record<string, unknown>).foto;
        if (typeof fotoUrl === "string" && fotoUrl.trim().length > 0) {
          if (!isValidCanonicalStorageUrl(fotoUrl.trim())) {
            return {
              ok: false,
              code: "foto_url_invalida",
              message: `La foto del barbero en posicion ${i + 1} no tiene una URL valida o segura.`
            };
          }
        }
      }
    }
  }

  return { ok: true };
}

export async function POST(request: Request) {
  const corsHeaders = secureAuthHeaders(getCorsHeaders(request));
  const sessionMeEndpoint = getSessionMeEndpoint();

  if (!sessionMeEndpoint) {
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
    const sessionRes = await fetch(sessionMeEndpoint, {
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

    // Rate limit: 10 attempts / 15 min / IP+user
    const clientIp = getClientIp(request);
    const userId = Number(sessionData.user_id || 0);
    const rateLimitKey = `onboarding:${clientIp}:${userId}`;
    const limitCheck = await consumeRateLimit(rateLimitKey, 10, 900, true);
    if (!limitCheck.allowed) {
      return rateLimitResponse(limitCheck.retryAfter);
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
    delete body.user_id;
    delete body.email;
    delete body.usuario_id;
    delete body.session;
    delete body.auth;

    // Validar slug si fue proporcionado
    const draftSlug = typeof body.slug === "string" ? body.slug.trim() : "";
    if (draftSlug && !isValidSlug(draftSlug)) {
      return NextResponse.json(
        {
          ok: false,
          code: "slug_invalido",
          message: "El slug de la barberia tiene un formato invalido."
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validar URLs de fotografias de servicios y barberos
    const imgValidation = validateCatalogImageUrls(body);
    if (!imgValidation.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: imgValidation.code,
          message: imgValidation.message
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const onboardingEndpoint = getOnboardingEndpoint();
    if (!onboardingEndpoint) {
      return NextResponse.json(
        {
          ok: false,
          code: "onboarding_endpoint_not_configured",
          message: "El servidor de onboarding no esta configurado."
        },
        { status: 500, headers: corsHeaders }
      );
    }

    // 3. Reenviar al webhook upstream con la cookie de sesion autenticada y timeout controlado
    const controller = new AbortController();
    const timeoutMs = Number(process.env.ONBOARDING_TIMEOUT_MS) || 25000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(onboardingEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `ba_session=${baSession}`
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return NextResponse.json(
          {
            ok: false,
            code: "onboarding_timeout",
            message:
              "El servidor de onboarding tardo demasiado en responder. Si el proceso fue recibido por el webhook, la creacion podria completarse en segundo plano. Verifica tu panel antes de reintentar para evitar registros duplicados.",
            may_have_succeeded: true
          },
          { status: 504, headers: corsHeaders }
        );
      }
      return NextResponse.json(
        {
          ok: false,
          code: "onboarding_proxy_error",
          message: fetchError instanceof Error ? fetchError.message : "Error de conexion con el servidor de onboarding."
        },
        { status: 502, headers: corsHeaders }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    let rawParsed: unknown = {};
    try {
      const text = await upstreamRes.text();
      rawParsed = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        {
          ok: false,
          code: "respuesta_invalida",
          message: "Respuesta invalida del webhook de onboarding."
        },
        { status: 502, headers: corsHeaders }
      );
    }

    // Normalizar respuestas de n8n (p. ej. arreglos [{ ... }] o envelopes con .json)
    let upstreamData: Record<string, unknown> = {};
    if (Array.isArray(rawParsed) && rawParsed.length > 0) {
      const first = rawParsed[0];
      if (first && typeof first === "object") {
        upstreamData =
          (first as Record<string, unknown>).json &&
          typeof (first as Record<string, unknown>).json === "object"
            ? ((first as Record<string, unknown>).json as Record<string, unknown>)
            : (first as Record<string, unknown>);
      }
    } else if (rawParsed && typeof rawParsed === "object") {
      upstreamData =
        (rawParsed as Record<string, unknown>).json &&
        typeof (rawParsed as Record<string, unknown>).json === "object"
          ? ((rawParsed as Record<string, unknown>).json as Record<string, unknown>)
          : (rawParsed as Record<string, unknown>);
    }

    const isError =
      !upstreamRes.ok ||
      upstreamData.ok === false ||
      upstreamData.success === false ||
      Boolean(upstreamData.error && !upstreamData.ok);

    if (isError) {
      const errorMessage =
        (typeof upstreamData.message === "string" && upstreamData.message) ||
        (typeof upstreamData.error === "string" && upstreamData.error) ||
        (typeof upstreamData.detail === "string" && upstreamData.detail) ||
        "Error al completar el onboarding.";
      return NextResponse.json(
        {
          ok: false,
          message: errorMessage
        },
        {
          status: upstreamRes.status >= 400 && upstreamRes.status < 600 ? upstreamRes.status : 400,
          headers: corsHeaders
        }
      );
    }

    if (upstreamData.ok === undefined) {
      upstreamData.ok = true;
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
    headers: secureAuthHeaders(getCorsHeaders(request))
  });
}
