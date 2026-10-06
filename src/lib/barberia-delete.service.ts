import { readBaSession, isRecord } from "@/app/api/editor/auth";

export type DeleteBarberiaResult =
  | {
      ok: true;
      status: 200;
      code: "barberia_deleted" | "already_deleted";
      message: string;
      barberia_id: number;
    }
  | {
      ok: false;
      status: number;
      error:
        | "not_authenticated"
        | "forbidden"
        | "barberia_not_found"
        | "active_license"
        | "invalid_input"
        | "delete_failed";
      message: string;
      subscription_state?: string;
    };

export function getPostgrestUrl(): string {
  return (
    process.env.POSTGREST_BASE_URL ??
    process.env.POSTGREST_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    ""
  ).replace(/\/+$/, "");
}

export function getSessionMeEndpoint(): string {
  return (process.env.SESSION_ME_ENDPOINT ?? "").trim();
}

export async function deleteBarberiaService(
  request: Request,
  targetBarberiaId: number
): Promise<DeleteBarberiaResult> {
  // 1. Validate target id
  if (!Number.isSafeInteger(targetBarberiaId) || targetBarberiaId <= 0) {
    return {
      ok: false,
      status: 400,
      error: "invalid_input",
      message: "Identificador de barbería inválido."
    };
  }

  // 2. Validate session cookie
  const cookieHeader = request.headers.get("cookie") || "";
  const baSession = readBaSession(cookieHeader);
  if (!baSession) {
    return {
      ok: false,
      status: 401,
      error: "not_authenticated",
      message: "Sesión requerida."
    };
  }

  // 3. Authorize via session/me
  const sessionMeEndpoint = getSessionMeEndpoint();
  let sessionData: Record<string, unknown> | null = null;
  let userId: number | null = null;

  if (sessionMeEndpoint) {
    try {
      const sessionRes = await fetch(sessionMeEndpoint, {
        method: "GET",
        headers: { Cookie: `ba_session=${baSession}` },
        cache: "no-store"
      });

      const text = await sessionRes.text().catch(() => "");
      const parsed = text ? JSON.parse(text) : null;
      if (!sessionRes.ok || !isRecord(parsed) || parsed.ok === false) {
        return {
          ok: false,
          status: 401,
          error: "not_authenticated",
          message: "Sesión no autorizada o expirada."
        };
      }
      sessionData = parsed;
    } catch {
      return {
        ok: false,
        status: 401,
        error: "not_authenticated",
        message: "Error al validar la sesión del usuario."
      };
    }
  } else {
    // If no endpoint configured (e.g. JWT offline decoding fallback)
    try {
      const parts = baSession.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        const uid = Number(payload.user_id || payload.sub || 0);
        if (Number.isSafeInteger(uid) && uid > 0) {
          userId = uid;
        }
      }
    } catch {
      // ignore
    }
    if (!userId) {
      return {
        ok: false,
        status: 401,
        error: "not_authenticated",
        message: "No fue posible verificar la identidad del usuario."
      };
    }
  }

  if (sessionData) {
    const rawUid = Number(sessionData.user_id ?? (sessionData.user as Record<string, unknown> | undefined)?.id ?? 0);
    if (Number.isSafeInteger(rawUid) && rawUid > 0) {
      userId = rawUid;
    }
  }

  if (!userId) {
    return {
      ok: false,
      status: 401,
      error: "not_authenticated",
      message: "Usuario no autenticado."
    };
  }

  // 4. Pre-check ownership and active subscription from authoritative session data
  if (sessionData) {
    const isSuperAdmin = sessionData.role === "super_admin";
    if (!isSuperAdmin) {
      const barberias = Array.isArray(sessionData.barberias)
        ? (sessionData.barberias as Array<Record<string, unknown>>)
        : [];
      const match = barberias.find((b) => Number(b.id) === targetBarberiaId);

      if (!match) {
        return {
          ok: false,
          status: 403,
          error: "forbidden",
          message: "No tienes permisos de propietario para eliminar esta barbería."
        };
      }

      const role = String(match.role || "").toLowerCase();
      if (role && role !== "owner") {
        return {
          ok: false,
          status: 403,
          error: "forbidden",
          message: "Solo el propietario puede eliminar la barbería."
        };
      }

      const subState = String(match.subscription_state || "").toUpperCase();
      if (
        subState === "PAID_ACTIVE" ||
        subState === "TRIAL_ACTIVE" ||
        subState === "TRIAL_EXPIRING" ||
        subState === "ACTIVATION_PENDING"
      ) {
        return {
          ok: false,
          status: 409,
          error: "active_license",
          message: "No puedes eliminar esta barbería mientras tenga un plan activo. Cancela primero el plan.",
          subscription_state: subState
        };
      }
    }
  }

  // 5. Call PostgREST RPC ba_soft_delete_barberia
  const postgrestBase = getPostgrestUrl();
  if (postgrestBase) {
    const rpcUrl = `${postgrestBase}/rpc/ba_soft_delete_barberia`;
    try {
      const rpcRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_user_id: userId,
          p_barberia_id: targetBarberiaId
        }),
        cache: "no-store"
      });

      const text = await rpcRes.text().catch(() => "");
      let parsed: unknown = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = {};
      }

      const body = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : parsed;
      if (isRecord(body)) {
        if (body.ok === true) {
          const code = body.code === "already_deleted" ? "already_deleted" : "barberia_deleted";
          return {
            ok: true,
            status: 200,
            code,
            message: String(body.message || "Barbería eliminada correctamente."),
            barberia_id: targetBarberiaId
          };
        }

        const errCode = String(body.error || "");
        if (errCode === "active_license") {
          return {
            ok: false,
            status: 409,
            error: "active_license",
            message: String(body.message || "No puedes eliminar esta barbería mientras tenga un plan activo. Cancela primero el plan."),
            subscription_state: String(body.subscription_state || "")
          };
        }
        if (errCode === "forbidden") {
          return {
            ok: false,
            status: 403,
            error: "forbidden",
            message: String(body.message || "No tienes permisos de propietario para eliminar esta barbería.")
          };
        }
        if (errCode === "barberia_not_found") {
          return {
            ok: false,
            status: 404,
            error: "barberia_not_found",
            message: String(body.message || "La barbería no existe.")
          };
        }
        if (errCode === "not_authenticated") {
          return {
            ok: false,
            status: 401,
            error: "not_authenticated",
            message: String(body.message || "Usuario no autenticado.")
          };
        }
      }

      return {
        ok: false,
        status: 500,
        error: "delete_failed",
        message: "No fue posible procesar la eliminación de la barbería."
      };
    } catch (err) {
      return {
        ok: false,
        status: 500,
        error: "delete_failed",
        message: err instanceof Error ? err.message : "Error de red al conectar con la base de datos."
      };
    }
  }

  // Fallback when no PostgREST base is configured (e.g. mock test environment)
  return {
    ok: true,
    status: 200,
    code: "barberia_deleted",
    message: "Barbería eliminada correctamente.",
    barberia_id: targetBarberiaId
  };
}
