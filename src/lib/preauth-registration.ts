import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";

export interface PreAuthRegistrationData {
  nombre: string;
  apellido: string;
  nonce: string;
  exp: number; // millisecond timestamp
  iat: number;
}

export const PREAUTH_COOKIE_NAME = "ba_preauth_reg";
export const PREAUTH_COOKIE_PATH = "/api/auth/";
export const PREAUTH_TTL_MS = 10 * 60 * 1000; // 10 minutes

const POSTGREST_URL =
  process.env.POSTGREST_BASE_URL ??
  process.env.POSTGREST_URL ??
  "https://api.agencia2c.cloud";

// Process-local cache for fast rejection optimization
const consumedNonces = new Map<string, number>();

export function pruneConsumedNonces(): void {
  const now = Date.now();
  for (const [nonce, expiry] of consumedNonces.entries()) {
    if (now > expiry) {
      consumedNonces.delete(nonce);
    }
  }
}

export function resetConsumedNoncesForTesting(): void {
  consumedNonces.clear();
}

export function cleanName(val: unknown): string {
  const x = (typeof val === "string" ? val : "").trim();
  const bad = ["promt", "prompt", "undefined", "null", "nan", "none"];
  if (!x || bad.includes(x.toLowerCase())) return "";
  return x.slice(0, 100);
}

export function prettifyName(val: string): string {
  const x = cleanName(val)
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!x) return "";
  return x
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ")
    .trim();
}

/**
 * Invariant A: PREAUTH_SECRET ONLY.
 * Server-only, mandatory, fail-closed, no hardcoded fallback,
 * no JWT_SECRET, no AUTH_SECRET, no billing fallback.
 */
export function getPreauthSecret(): string {
  const secret = process.env.PREAUTH_SECRET;

  if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
    throw new Error("PREAUTH_SECRET_MISSING: PREAUTH_SECRET environment variable is mandatory and not configured");
  }

  return secret.trim();
}

export function createPreauthRegistrationToken(
  rawNombre: string,
  rawApellido: string
): { token: string; data: PreAuthRegistrationData } | null {
  const nombre = prettifyName(rawNombre);
  const apellido = prettifyName(rawApellido);

  if (!nombre || !apellido) {
    return null;
  }

  // Fails closed if PREAUTH_SECRET is not configured
  const secret = getPreauthSecret();

  const nonce = randomBytes(16).toString("hex");
  const now = Date.now();
  const exp = now + PREAUTH_TTL_MS;

  const data: PreAuthRegistrationData = {
    nombre,
    apellido,
    nonce,
    exp,
    iat: now
  };

  const payloadB64 = Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
  const hmac = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  const token = `${payloadB64}.${hmac}`;

  return { token, data };
}

export function verifyPreauthRegistrationToken(
  token: string
): { valid: boolean; reason?: string; data?: PreAuthRegistrationData } {
  if (!token || typeof token !== "string") {
    return { valid: false, reason: "missing_token" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "invalid_format" };
  }

  const [payloadB64, signature] = parts;

  // Fails closed if PREAUTH_SECRET is not configured
  const secret = getPreauthSecret();
  const expectedHmac = createHmac("sha256", secret).update(payloadB64).digest("base64url");

  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expectedHmac, "utf8");

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: "invalid_signature" };
  }

  let data: PreAuthRegistrationData;
  try {
    const jsonStr = Buffer.from(payloadB64, "base64url").toString("utf8");
    data = JSON.parse(jsonStr);
  } catch {
    return { valid: false, reason: "corrupted_payload" };
  }

  if (!data || !data.nombre || !data.apellido || !data.nonce || typeof data.exp !== "number") {
    return { valid: false, reason: "malformed_payload" };
  }

  if (Date.now() > data.exp) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, data };
}

/**
 * Invariant D: Shared Replay Protection via PostgreSQL ba_consume_rate_limit.
 * Namespace-isolated: preauth_nonce:<sha256(nonce)>
 * Fails closed if PostgREST/DB is unavailable.
 */
export async function verifyAndConsumeNonceShared(
  nonce: string,
  ttlSeconds: number
): Promise<{ allowed: boolean; reason?: string }> {
  const nonceHash = createHash("sha256").update(nonce).digest("hex");
  const sharedKey = `preauth_nonce:${nonceHash}`;

  const url = `${POSTGREST_URL.replace(/\/+$/, "")}/rpc/ba_consume_rate_limit`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_key: sharedKey,
        p_limit: 1,
        p_window_seconds: ttlSeconds,
        p_increment: true
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    if (!res.ok) {
      // Fail closed on HTTP 401, 500, etc.
      return { allowed: false, reason: `db_rpc_error_${res.status}` };
    }

    const data = typeof res.json === "function" ? await res.json().catch(() => null) : null;
    if (!data || typeof data !== "object" || typeof data.allowed !== "boolean") {
      // Fail closed on malformed response
      return { allowed: false, reason: "db_rpc_malformed_response" };
    }

    return { allowed: data.allowed, reason: data.allowed ? undefined : "already_consumed_replay" };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { allowed: false, reason: "db_rpc_timeout" };
    }
    return { allowed: false, reason: "db_rpc_network_error" };
  } finally {
    clearTimeout(timer);
  }
}

export async function consumePreauthRegistration(
  token: string
): Promise<{ success: boolean; reason?: string; data?: PreAuthRegistrationData }> {
  pruneConsumedNonces();

  let verification: { valid: boolean; reason?: string; data?: PreAuthRegistrationData };
  try {
    verification = verifyPreauthRegistrationToken(token);
  } catch (err) {
    return {
      success: false,
      reason: err instanceof Error && err.message.includes("PREAUTH_SECRET_MISSING")
        ? "configuration_error"
        : "invalid_token"
    };
  }

  if (!verification.valid || !verification.data) {
    return { success: false, reason: verification.reason };
  }

  const { data } = verification;

  // 1. Process-local fast check (instant rejection optimization)
  if (consumedNonces.has(data.nonce)) {
    return { success: false, reason: "already_consumed_replay" };
  }

  // 2. Shared atomic store via PostgreSQL rate limit RPC (ba_consume_rate_limit)
  // Namespace-isolated key with fail-closed semantics
  const ttlSeconds = Math.max(1, Math.ceil((data.exp - Date.now()) / 1000));
  const sharedCheck = await verifyAndConsumeNonceShared(data.nonce, ttlSeconds);

  if (!sharedCheck.allowed) {
    // Shared verification failed or DB unavailable -> FAIL CLOSED
    if (sharedCheck.reason === "already_consumed_replay") {
      consumedNonces.set(data.nonce, data.exp + 60000);
    }
    return { success: false, reason: sharedCheck.reason || "already_consumed_replay" };
  }

  // Mark consumed locally for instant memory lookup until token expiry + 1 min grace
  consumedNonces.set(data.nonce, data.exp + 60000);

  return { success: true, data };
}

export function buildPreauthCookie(token: string): string {
  return `${PREAUTH_COOKIE_NAME}=${token}; Path=${PREAUTH_COOKIE_PATH}; Max-Age=600; HttpOnly; Secure; SameSite=None`;
}

export function buildClearPreauthCookie(): string {
  return `${PREAUTH_COOKIE_NAME}=; Path=${PREAUTH_COOKIE_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=None; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
