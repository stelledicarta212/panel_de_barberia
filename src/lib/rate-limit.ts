import { NextResponse } from "next/server";

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  points: number;
}

const POSTGREST_URL =
  process.env.POSTGREST_BASE_URL ??
  process.env.POSTGREST_URL ??
  "https://api.agencia2c.cloud";

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim()) return cfIp.trim();
  return "127.0.0.1";
}

export function secureAuthHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  return {
    "Cache-Control": "no-store, private",
    "Pragma": "no-cache",
    ...(extraHeaders || {})
  };
}

export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: "too_many_requests",
      message: "Demasiadas solicitudes. Por favor, intenta de nuevo más tarde."
    },
    {
      status: 429,
      headers: secureAuthHeaders({
        "Retry-After": String(Math.max(1, retryAfter))
      })
    }
  );
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  increment = true
): Promise<RateLimitResult> {
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
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
        p_increment: increment
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    if (!res.ok) {
      console.warn(`[rate-limit] RPC returned status ${res.status}`);
      return { allowed: true, retryAfter: 0, points: 0 };
    }

    const data = typeof res.json === "function" ? await res.json().catch(() => null) : null;
    if (!data || typeof data !== "object") {
      return { allowed: true, retryAfter: 0, points: 0 };
    }

    return {
      allowed: data.allowed !== false,
      retryAfter: Number(data.retry_after ?? 0),
      points: Number(data.points ?? 0)
    };
  } catch (err) {
    console.error("[rate-limit] Error communicating with PostgREST rate limit RPC:", err);
    return { allowed: true, retryAfter: 0, points: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function resetRateLimit(key: string): Promise<void> {
  const url = `${POSTGREST_URL.replace(/\/+$/, "")}/rpc/ba_reset_rate_limit`;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_key: key }),
      cache: "no-store"
    }).catch(() => {});
  } catch {
    // Suppress network errors in reset to prevent breaking caller flow
  }
}
