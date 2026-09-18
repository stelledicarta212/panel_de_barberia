function splitSetCookieHeader(value: string): string[] {
  return value
    .split(/,(?=\s*[\w!#$%&'*+\-.^`|~]+=)/)
    .map((cookie) => cookie.trim())
    .filter(Boolean);
}

function normalizeBaSessionCookie(cookie: string): string {
  if (!/^ba_session=/i.test(cookie)) return cookie;

  let next = cookie;
  if (/;\s*domain=/i.test(next)) {
    next = next.replace(/;\s*domain=[^;]*/i, "");
  }

  if (!/;\s*path=/i.test(next)) next += "; Path=/";
  if (!/;\s*samesite=/i.test(next)) next += "; SameSite=Lax";
  if (!/;\s*secure/i.test(next)) next += "; Secure";
  if (!/;\s*httponly/i.test(next)) next += "; HttpOnly";

  return next;
}

export function normalizeSessionSetCookies(upstreamSetCookie?: string | null): string[] {
  if (!upstreamSetCookie) return [];
  return splitSetCookieHeader(upstreamSetCookie).map(normalizeBaSessionCookie);
}

export function sanitizeAuthResponseBody(body: unknown): { sanitizedBody: unknown; extractedCookie: string | null } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { sanitizedBody: body, extractedCookie: null };
  }

  const record = body as Record<string, unknown>;
  const extractedCookie =
    typeof record["set_cookie"] === "string" && record["set_cookie"] ? record["set_cookie"] : null;

  if ("set_cookie" in record || "ba_session" in record) {
    const { set_cookie: _setCookie, ba_session: _baSession, ...rest } = record;
    return { sanitizedBody: rest, extractedCookie };
  }

  return { sanitizedBody: record, extractedCookie };
}
