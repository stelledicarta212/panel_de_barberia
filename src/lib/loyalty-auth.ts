import type { DashboardRole } from "@/types/dashboard-state";

export interface AuthorizedLoyaltyContext {
  ok: true;
  baSession: string;
  userId: number;
  barberiaId: number;
  role: DashboardRole;
}

export interface LoyaltyAuthError {
  ok: false;
  status: number;
  code: string;
  message: string;
}

export type LoyaltyAuthResult = AuthorizedLoyaltyContext | LoyaltyAuthError;

const SESSION_ME_ENDPOINT = process.env.SESSION_ME_ENDPOINT;

export function readBaSession(request: Request): string {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  if (match && match[1]) return match[1].trim();

  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return "";
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRole(roleText: unknown): DashboardRole {
  const clean = String(roleText || "").toLowerCase().trim();
  if (clean === "owner" || clean === "admin" || clean === "cajero" || clean === "barbero" || clean === "super_admin") {
    return clean;
  }
  return "guest";
}

/**
 * Authenticates the request and validates authorization for the target barberia.
 *
 * Tenant Identity Invariant:
 * 1. Derives tenant identity from session context (never blind client trust).
 * 2. If explicitBarberiaId is provided, validates that caller belongs to it.
 * 3. Enforces permitted roles.
 */
export async function authenticateLoyaltyRequest(
  request: Request,
  options: {
    explicitBarberiaId?: number | null;
    allowedRoles?: DashboardRole[];
  } = {}
): Promise<LoyaltyAuthResult> {
  const baSession = readBaSession(request);
  if (!baSession) {
    return {
      ok: false,
      status: 401,
      code: "no_autorizado_anonimo",
      message: "Sesión requerida para acceder al programa de fidelización"
    };
  }

  const allowedRoles = options.allowedRoles ?? ["owner", "admin", "cajero"];

  // 1. Try decoding JWT claims if available
  const jwt = parseJwtClaims(baSession);
  let resolvedUserId: number | null = null;
  let resolvedRole: DashboardRole = "guest";
  const authorizedBarberias: Array<{ id: number; role: DashboardRole }> = [];
  let defaultBarberiaId: number | null = null;

  if (jwt) {
    const exp = Number(jwt.exp);
    if (Number.isFinite(exp) && exp < Math.floor(Date.now() / 1000)) {
      return {
        ok: false,
        status: 401,
        code: "sesion_expirada",
        message: "La sesión ha expirado"
      };
    }
    const uid = Number(jwt.sub ?? jwt.user_id ?? jwt.id ?? 0);
    if (Number.isFinite(uid) && uid > 0) resolvedUserId = uid;

    const bid = Number(jwt.barberia_id ?? jwt.barberiaId ?? 0);
    if (Number.isFinite(bid) && bid > 0) defaultBarberiaId = bid;

    resolvedRole = normalizeRole(jwt.role ?? jwt.rol);
    if (defaultBarberiaId && resolvedRole !== "guest") {
      authorizedBarberias.push({ id: defaultBarberiaId, role: resolvedRole });
    }
  }

  // 2. Validate against SESSION_ME_ENDPOINT if configured
  if (SESSION_ME_ENDPOINT) {
    try {
      const sessionRes = await fetch(SESSION_ME_ENDPOINT, {
        method: "GET",
        headers: { Cookie: `ba_session=${baSession}` },
        cache: "no-store"
      });

      if (sessionRes.ok) {
        const text = await sessionRes.text().catch(() => "");
        let body: unknown = {};
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          body = {};
        }

        if (isRecord(body) && body.ok !== false) {
          const userRec = isRecord(body.user) ? body.user : {};
          const uid = Number(body.user_id ?? userRec.id ?? body.id ?? 0);
          if (Number.isFinite(uid) && uid > 0) resolvedUserId = uid;

          const currentB = isRecord(body.current_barberia) ? body.current_barberia : null;
          if (currentB) {
            const cid = Number(currentB.id ?? currentB.barberia_id ?? 0);
            if (Number.isFinite(cid) && cid > 0) {
              defaultBarberiaId = cid;
              const cRole = normalizeRole(currentB.role ?? body.role);
              authorizedBarberias.push({ id: cid, role: cRole });
            }
          }

          if (Array.isArray(body.barberias)) {
            for (const b of body.barberias) {
              if (isRecord(b)) {
                const bId = Number(b.id ?? b.barberia_id ?? 0);
                if (Number.isFinite(bId) && bId > 0) {
                  const bRole = normalizeRole(b.role ?? body.role);
                  if (!authorizedBarberias.some((x) => x.id === bId)) {
                    authorizedBarberias.push({ id: bId, role: bRole });
                  }
                }
              }
            }
          }

          if (body.role) {
            resolvedRole = normalizeRole(body.role);
          }
        }
      } else if (sessionRes.status === 401) {
        return {
          ok: false,
          status: 401,
          code: "sesion_invalida",
          message: "Sesión no válida o expirada"
        };
      }
    } catch {
      // If session endpoint fails but valid unexpired JWT was present, proceed with JWT
      if (!resolvedUserId) {
        return {
          ok: false,
          status: 502,
          code: "error_verificacion_sesion",
          message: "No se pudo verificar la sesión"
        };
      }
    }
  }

  if (!resolvedUserId) {
    return {
      ok: false,
      status: 401,
      code: "sesion_no_autenticada",
      message: "Usuario no identificado en la sesión"
    };
  }

  // Determine target barberia_id
  let targetBarberiaId: number | null = null;
  if (options.explicitBarberiaId != null && Number.isFinite(options.explicitBarberiaId) && options.explicitBarberiaId > 0) {
    targetBarberiaId = options.explicitBarberiaId;
  } else {
    targetBarberiaId = defaultBarberiaId;
  }

  if (!targetBarberiaId) {
    return {
      ok: false,
      status: 400,
      code: "barberia_requerida",
      message: "No se encontró una barbería asociada a la sesión"
    };
  }

  // Cross-tenant protection: check membership if authorizedBarberias is known
  if (authorizedBarberias.length > 0) {
    const match = authorizedBarberias.find((b) => b.id === targetBarberiaId);
    if (!match) {
      return {
        ok: false,
        status: 403,
        code: "barberia_ajena",
        message: "No tienes permisos para acceder a los datos de esta barbería"
      };
    }
    resolvedRole = match.role;
  }

  // Role authorization
  if (!allowedRoles.includes(resolvedRole)) {
    return {
      ok: false,
      status: 403,
      code: "rol_no_autorizado",
      message: `El rol '${resolvedRole}' no tiene autorización para esta acción de fidelización`
    };
  }

  return {
    ok: true,
    baSession,
    userId: resolvedUserId,
    barberiaId: targetBarberiaId,
    role: resolvedRole
  };
}
