const DEFAULT_SESSION_ME_ENDPOINT = process.env.SESSION_ME_ENDPOINT;

function getSessionMeEndpoint(): string | undefined {
  return process.env.SESSION_ME_ENDPOINT || DEFAULT_SESSION_ME_ENDPOINT;
}

export type EditorAuthResult =
  | {
      ok: true;
      baSession: string;
      barberiaId: number;
      slug: string | null;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

type EditorPayloadParseResult =
  | { ok: true; payload: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

export function readBaSession(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  return match ? match[1] : "";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getCorsHeaders(request: Request, methods = "POST, OPTIONS") {
  const origin = request.headers.get("origin") || "";
  const allowedOrigins = [
    "https://barberagency-barberagency.gymh5g.easypanel.host",
    "http://localhost:3000",
    "http://localhost:8000"
  ];

  const allowedOrigin =
    allowedOrigins.includes(origin) || origin.endsWith(".easypanel.host")
      ? origin
      : "https://barberagency-barberagency.gymh5g.easypanel.host";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true"
  };
}

function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseEditorPayload(rawBody: string): EditorPayloadParseResult {
  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return {
      ok: false,
      status: 400,
      body: { ok: false, code: "body_invalido", message: "Body JSON invalido" }
    };
  }

  if (!isRecord(payload)) {
    return {
      ok: false,
      status: 400,
      body: { ok: false, code: "body_invalido", message: "Payload invalido" }
    };
  }

  return { ok: true, payload };
}

export function resolvePayloadBarberiaId(payload: Record<string, unknown>): number | null {
  const innerPayload = isRecord(payload.p_payload) ? payload.p_payload : null;
  const id = Number(
    payload.barberia_id ??
      payload.p_barberia_id ??
      payload.draft_seed_barberia_id ??
      innerPayload?.barberia_id ??
      innerPayload?.p_barberia_id ??
      innerPayload?.draft_seed_barberia_id ??
      0
  );
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function resolvePayloadSlug(payload: Record<string, unknown>): string | null {
  const innerPayload = isRecord(payload.p_payload) ? payload.p_payload : null;
  const slug = safeText(
    payload.slug ??
      payload.biz_slug ??
      payload.draft_seed_slug ??
      innerPayload?.slug ??
      innerPayload?.biz_slug ??
      innerPayload?.draft_seed_slug
  );
  return slug || null;
}

function readAuthorizedBarberias(body: unknown): Array<{ id: number; slug: string | null }> {
  if (!isRecord(body)) return [];
  const rows = Array.isArray(body.barberias) ? body.barberias : [];
  const current = isRecord(body.current_barberia) ? [body.current_barberia] : [];
  return [...rows, ...current]
    .map((item) => {
      if (!isRecord(item)) return null;
      const id = Number(item.id ?? item.barberia_id ?? 0);
      if (!Number.isFinite(id) || id <= 0) return null;
      return {
        id,
        slug: safeText(item.slug) || null
      };
    })
    .filter((item): item is { id: number; slug: string | null } => Boolean(item));
}

export async function validateEditorTenant(request: Request, payload: Record<string, unknown>): Promise<EditorAuthResult> {
  const sessionMeEndpoint = getSessionMeEndpoint();
  if (!sessionMeEndpoint) {
    return {
      ok: false,
      status: 500,
      body: {
        ok: false,
        code: "session_me_endpoint_not_configured",
        message: "El servidor no esta configurado correctamente."
      }
    };
  }

  const baSession = readBaSession(request.headers.get("cookie") || "");
  if (!baSession) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        code: "no_autorizado_anonimo",
        message: "Sesion requerida"
      }
    };
  }

  const requestedBarberiaId = resolvePayloadBarberiaId(payload);
  const slug = resolvePayloadSlug(payload);

  if (!requestedBarberiaId && !slug) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        code: "barberia_id_requerido",
        message: "barberia_id o slug requerido"
      }
    };
  }

  const sessionRes = await fetch(sessionMeEndpoint, {
    method: "GET",
    headers: { Cookie: `ba_session=${baSession}` },
    cache: "no-store"
  });
  const text = await sessionRes.text().catch(() => "");
  let sessionBody: unknown = {};
  try {
    sessionBody = text ? JSON.parse(text) : {};
  } catch {
    return {
      ok: false,
      status: 502,
      body: {
        ok: false,
        code: "session_me_no_json",
        message: "session/me devolvio respuesta no JSON"
      }
    };
  }

  if (!sessionRes.ok || !isRecord(sessionBody) || sessionBody.ok === false) {
    return {
      ok: false,
      status: sessionRes.status === 401 ? 401 : 403,
      body: {
        ok: false,
        code: sessionRes.status === 401 ? "no_autorizado_anonimo" : "sin_permiso",
        message: safeText((sessionBody as Record<string, unknown>)?.message) || "Sesion no autorizada"
      }
    };
  }

  const authorizedList = readAuthorizedBarberias(sessionBody);

  let matched: { id: number; slug: string | null } | undefined;
  if (requestedBarberiaId) {
    matched = authorizedList.find((item) => item.id === requestedBarberiaId);
    if (!matched) {
      return {
        ok: false,
        status: 403,
        body: {
          ok: false,
          code: "barberia_ajena",
          message: "No tienes permisos para esta barberia"
        }
      };
    }
  } else if (slug) {
    matched = authorizedList.find((item) => item.slug === slug);
  }

  if (!matched && !requestedBarberiaId && authorizedList.length === 1) {
    matched = authorizedList[0];
  }

  if (!matched) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        code: "barberia_id_requerido",
        message: "barberia_id requerido"
      }
    };
  }

  if (slug && matched.slug && slug !== matched.slug) {
    return {
      ok: false,
      status: 403,
      body: {
        ok: false,
        code: "slug_mismatch",
        message: "El slug no pertenece a la barberia solicitada"
      }
    };
  }

  return {
    ok: true,
    baSession,
    barberiaId: matched.id,
    slug: matched.slug
  };
}
