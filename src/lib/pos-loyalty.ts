/**
 * BARBERAGENCY — LOYALTY FAST-PATH INTEGRATION
 * File: _work_panel_de_barberia/src/lib/pos-loyalty.ts
 *
 * Implements the best-effort Loyalty Fast-Path following canonical POS payment confirmation.
 * Architectural Invariant:
 * 1. PAYMENT SUCCESS DOES NOT DEPEND ON LOYALTY SUCCESS.
 * 2. LOYALTY FAILURE CAN NEVER ROLLBACK OR VOID THE PAYMENT.
 * 3. Never throws; captures all errors and times out strictly (default 2500ms).
 * 4. Never logs sensitive credentials, JWTs, cookies, or PII.
 */

export type LoyaltyFastPathResult = {
  status:
    | "credited"
    | "already_credited"
    | "program_disabled"
    | "anonymous_client_not_eligible"
    | "created_before_program_start"
    | "payment_not_found"
    | "unauthorized_tenant"
    | "skipped"
    | "failed"
    | string;
  ledger_id?: number;
  cliente_id?: number;
  barberia_id?: number;
  pago_id?: number;
  message?: string;
  error?: string;
  code?: string;
};

export type LoyaltyFastPathOptions = {
  baSession?: string;
  barberiaId?: number;
  timeoutMs?: number;
  postgrestUrl?: string;
};

function getPostgrestBaseUrl(override?: string): string {
  if (override && override.trim()) return override.trim().replace(/\/+$/, "");
  const base =
    process.env.POSTGREST_BASE_URL ??
    process.env.POSTGREST_URL ??
    "";
  return String(base).trim().replace(/\/+$/, "");
}

function getServiceRoleToken(): string {
  const token =
    process.env.LOYALTY_SERVICE_ROLE_TOKEN ??
    process.env.POSTGREST_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.BILLING_PURCHASE_INTENTS_INGEST_TOKEN ??
    "";
  return token.trim();
}

function getTimeoutMs(override?: number): number {
  if (typeof override === "number" && override > 0) {
    return Math.min(10000, Math.max(500, override));
  }
  const fromEnv = Number(process.env.LOYALTY_FAST_PATH_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.min(10000, Math.max(500, fromEnv));
  }
  return 2500;
}

function safeLog(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  const payload = {
    tag: "LOYALTY_FAST_PATH",
    message,
    ...(meta ? meta : {})
  };
  if (level === "error") {
    console.error(JSON.stringify(payload));
  } else if (level === "warn") {
    console.warn(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

/**
 * Attempts to accumulate loyalty stamp immediately following a successful POS payment.
 * Failure isolated: Guarantees it will never reject or throw.
 */
export async function executeLoyaltyFastPath(
  pagoId: number,
  options: LoyaltyFastPathOptions = {}
): Promise<LoyaltyFastPathResult> {
  if (!Number.isFinite(pagoId) || pagoId <= 0) {
    return { status: "skipped", message: "pago_id inválido para fast-path" };
  }

  const baseUrl = getPostgrestBaseUrl(options.postgrestUrl);
  if (!baseUrl) {
    safeLog("warn", "PostgREST endpoint not configured; fast-path skipped", { pago_id: pagoId });
    return { status: "skipped", message: "PostgREST endpoint no configurado" };
  }

  const timeoutMs = getTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl}/rpc/ba_loyalty_acumular_pago`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json"
    };

    const serviceToken = getServiceRoleToken();
    if (serviceToken) {
      headers["Authorization"] = `Bearer ${serviceToken}`;
      headers["apikey"] = serviceToken;
    } else if (options.baSession) {
      headers["Cookie"] = `ba_session=${options.baSession}`;
      // Also provide Authorization Bearer if session is a valid JWT format
      if (options.baSession.split(".").length === 3) {
        headers["Authorization"] = `Bearer ${options.baSession}`;
        headers["apikey"] = options.baSession;
      }
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_pago_id: pagoId }),
      signal: controller.signal,
      cache: "no-store"
    });

    const text = await response.text().catch(() => "");
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      safeLog("warn", "Fast-path RPC returned non-200 HTTP status", {
        pago_id: pagoId,
        http_status: response.status
      });
      return {
        status: "failed",
        code: `http_${response.status}`,
        message: "Error de comunicación con servicio de fidelización"
      };
    }

    if (data && typeof data === "object" && !Array.isArray(data)) {
      const rec = data as Record<string, unknown>;
      const status = typeof rec.status === "string" ? rec.status : "unknown";
      safeLog("info", "Fast-path processed", {
        pago_id: pagoId,
        status,
        ledger_id: rec.ledger_id
      });
      return {
        status,
        ledger_id: typeof rec.ledger_id === "number" ? rec.ledger_id : undefined,
        cliente_id: typeof rec.cliente_id === "number" ? rec.cliente_id : undefined,
        barberia_id: typeof rec.barberia_id === "number" ? rec.barberia_id : undefined,
        pago_id: typeof rec.pago_id === "number" ? rec.pago_id : pagoId,
        message: typeof rec.message === "string" ? rec.message : undefined
      };
    }

    return { status: "unknown", pago_id: pagoId };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    safeLog("error", isAbort ? "Fast-path timeout exceeded" : "Fast-path unexpected error", {
      pago_id: pagoId,
      error_name: error instanceof Error ? error.name : "unknown"
    });
    return {
      status: "failed",
      code: isAbort ? "timeout" : "network_error",
      message: isAbort ? "Tiempo de espera agotado" : "Error en fast-path de fidelización"
    };
  } finally {
    clearTimeout(timer);
  }
}
