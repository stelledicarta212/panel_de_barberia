/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";

const TEST_SECRET = "unit_test_preauth_secret_minimum_32_bytes_safe!";
process.env.PREAUTH_SECRET = TEST_SECRET;
process.env.GOOGLE_SESSION_ENDPOINT = "http://upstream.internal/auth/google-session";

import { GET, POST } from "../src/app/api/auth/google-redirect/route";
import { POST as preRegisterPOST } from "../src/app/api/auth/pre-register/route";
import {
  createPreauthRegistrationToken,
  verifyPreauthRegistrationToken,
  consumePreauthRegistration,
  resetConsumedNoncesForTesting,
  getPreauthSecret,
  buildPreauthCookie,
  buildClearPreauthCookie,
  PREAUTH_COOKIE_NAME,
  PREAUTH_COOKIE_PATH
} from "../src/lib/preauth-registration";

function setupFetchMock(options?: {
  dbAllowed?: boolean;
  dbStatus?: number;
  dbNetworkError?: boolean;
  dbTimeout?: boolean;
  dbMalformed?: boolean;
  upstreamStatus?: number;
  upstreamBody?: any;
  upstreamHeaders?: Record<string, string>;
  onUpstreamCall?: (body: any, headers: any) => void;
}) {
  const dbCallCounts = new Map<string, number>();

  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const urlStr = url.toString();

    // 1. Intercept PostgREST shared nonce RPC
    if (urlStr.includes("/rpc/ba_consume_rate_limit")) {
      if (options?.dbTimeout) {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        return Promise.reject(err);
      }
      if (options?.dbNetworkError) {
        return Promise.reject(new Error("Network connection lost"));
      }
      if (options?.dbMalformed) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve("not-an-object-response"),
          text: () => Promise.resolve("not-an-object-response")
        } as any);
      }
      const status = options?.dbStatus ?? 200;
      const ok = status >= 200 && status < 300;

      let key = "default";
      let limit = 1;
      try {
        if (init?.body) {
          const parsed = JSON.parse(init.body as string);
          if (parsed.p_key) key = parsed.p_key;
          if (typeof parsed.p_limit === "number") limit = parsed.p_limit;
        }
      } catch {}

      const current = (dbCallCounts.get(key) || 0) + 1;
      dbCallCounts.set(key, current);

      const allowed = options?.dbAllowed !== undefined
        ? options.dbAllowed
        : current <= limit;

      return Promise.resolve({
        ok,
        status,
        json: () => Promise.resolve({ allowed, points: current }),
        text: () => Promise.resolve(JSON.stringify({ allowed, points: current }))
      } as any);
    }

    // 2. Intercept Upstream Google session auth service
    if (urlStr.includes("upstream.internal") || urlStr.includes("/auth/google-session")) {
      if (options?.onUpstreamCall) {
        const parsedBody = init?.body ? JSON.parse(init.body as string) : {};
        options.onUpstreamCall(parsedBody, init?.headers);
      }
      const status = options?.upstreamStatus ?? 200;
      const ok = status >= 200 && status < 300;
      const headers = new Headers(
        options?.upstreamHeaders ?? {
          "set-cookie": "ba_session=mock_sess_abc; Path=/; HttpOnly; Secure; SameSite=Lax"
        }
      );
      const body = options?.upstreamBody ?? { ok: true, user_id: 123 };
      return Promise.resolve({
        ok,
        status,
        headers,
        text: () => Promise.resolve(JSON.stringify(body)),
        json: () => Promise.resolve(body)
      } as any);
    }

    return Promise.reject(new Error(`Unhandled fetch URL in test: ${urlStr}`));
  });
}

describe("BARBERAGENCY — GOOGLE AUTH & PREAUTH 40-GATE VERIFICATION MATRIX", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.PREAUTH_SECRET = TEST_SECRET;
    process.env.GOOGLE_SESSION_ENDPOINT = "http://upstream.internal/auth/google-session";
    resetConsumedNoncesForTesting();
    global.fetch = setupFetchMock();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.PREAUTH_SECRET = TEST_SECRET;
    vi.restoreAllMocks();
    resetConsumedNoncesForTesting();
  });

  // =========================================================================
  // GROUP 1: PRE-REGISTRATION VALIDATION & HMAC SECRETS (Items 1 - 4)
  // =========================================================================

  it("1. nombre missing rejected before Google navigation", async () => {
    const request = new Request("http://localhost/api/auth/pre-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apellido: "Perez" })
    });
    const response = await preRegisterPOST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("missing_name");
  });

  it("2. apellido missing rejected before Google navigation", async () => {
    const request = new Request("http://localhost/api/auth/pre-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Carlos" })
    });
    const response = await preRegisterPOST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("missing_name");
  });

  it("3. valid preauth issued with correct Set-Cookie", async () => {
    const request = new Request("http://localhost/api/auth/pre-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Carlos", apellido: "Perez" })
    });
    const response = await preRegisterPOST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);

    const cookie = response.headers.get("Set-Cookie");
    expect(cookie).toBeTruthy();
    expect(cookie).toContain(`${PREAUTH_COOKIE_NAME}=`);
    expect(cookie).toContain("Path=/api/auth/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=None");
  });

  it("4. missing PREAUTH_SECRET fails closed with no fallback", async () => {
    delete process.env.PREAUTH_SECRET;
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_SECRET;
    delete process.env.BILLING_PURCHASE_INTENTS_CLAIM_SECRET;

    expect(() => getPreauthSecret()).toThrow("PREAUTH_SECRET_MISSING");

    const request = new Request("http://localhost/api/auth/pre-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Carlos", apellido: "Perez" })
    });
    const response = await preRegisterPOST(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("service_misconfigured");
  });

  // =========================================================================
  // GROUP 2: TOKEN VERIFICATION, EXPIRY & REPLAY PROTECTION (Items 5 - 13)
  // =========================================================================

  it("5. tampered cookie rejected and fails closed", async () => {
    const created = createPreauthRegistrationToken("Carlos", "Perez")!;
    const parts = created.token.split(".");
    const tamperedToken = `${parts[0]}.tampered_signature_123`;

    const verification = verifyPreauthRegistrationToken(tamperedToken);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe("invalid_signature");

    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `g_csrf_token=csrf_valid; ${PREAUTH_COOKIE_NAME}=${tamperedToken}`
      },
      body: "credential=mock_token&g_csrf_token=csrf_valid"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("invalid_preauth");
  });

  it("6. expired cookie rejected and fails closed", async () => {
    const { createHmac } = await import("crypto");
    const expiredPayload = {
      nombre: "Carlos",
      apellido: "Perez",
      nonce: "expired_nonce_12345",
      exp: Date.now() - 5000,
      iat: Date.now() - 10000
    };
    const payloadB64 = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
    const hmac = createHmac("sha256", TEST_SECRET).update(payloadB64).digest("base64url");
    const expiredToken = `${payloadB64}.${hmac}`;

    const verification = verifyPreauthRegistrationToken(expiredToken);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe("expired");

    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `g_csrf_token=csrf_valid; ${PREAUTH_COOKIE_NAME}=${expiredToken}`
      },
      body: "credential=mock_token&g_csrf_token=csrf_valid"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("expired_preauth");
  });

  it("7. replay rejected on second consumption", async () => {
    const created = createPreauthRegistrationToken("Carlos", "Perez")!;
    const first = await consumePreauthRegistration(created.token);
    expect(first.success).toBe(true);

    const second = await consumePreauthRegistration(created.token);
    expect(second.success).toBe(false);
    expect(second.reason).toBe("already_consumed_replay");

    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `g_csrf_token=csrf_valid; ${PREAUTH_COOKIE_NAME}=${created.token}`
      },
      body: "credential=mock_token&g_csrf_token=csrf_valid"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("replayed_preauth");
  });

  it("8. concurrent replay results in exactly 1 success and 1 rejection", async () => {
    const created = createPreauthRegistrationToken("Carlos", "Perez")!;
    const [first, second] = await Promise.all([
      consumePreauthRegistration(created.token),
      consumePreauthRegistration(created.token)
    ]);

    const successes = [first, second].filter((r) => r.success);
    const failures = [first, second].filter((r) => !r.success);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(failures[0].reason).toBe("already_consumed_replay");
  });

  it("9. DB replay verifier network error fails closed (503)", async () => {
    global.fetch = setupFetchMock({ dbNetworkError: true });
    const created = createPreauthRegistrationToken("Carlos", "Perez")!;

    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `g_csrf_token=csrf_valid; ${PREAUTH_COOKIE_NAME}=${created.token}`
      },
      body: "credential=mock_token&g_csrf_token=csrf_valid"
    });
    const response = await POST(request);
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("service_unavailable");
  });

  it("10. PostgREST timeout fails closed (503)", async () => {
    global.fetch = setupFetchMock({ dbTimeout: true });
    const created = createPreauthRegistrationToken("Carlos", "Perez")!;

    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `g_csrf_token=csrf_valid; ${PREAUTH_COOKIE_NAME}=${created.token}`
      },
      body: "credential=mock_token&g_csrf_token=csrf_valid"
    });
    const response = await POST(request);
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("service_unavailable");
  });

  it("11. PostgREST 401 fails closed (503)", async () => {
    global.fetch = setupFetchMock({ dbStatus: 401 });
    const created = createPreauthRegistrationToken("Carlos", "Perez")!;

    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `g_csrf_token=csrf_valid; ${PREAUTH_COOKIE_NAME}=${created.token}`
      },
      body: "credential=mock_token&g_csrf_token=csrf_valid"
    });
    const response = await POST(request);
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("service_unavailable");
  });

  it("12. PostgREST 500 fails closed (503)", async () => {
    global.fetch = setupFetchMock({ dbStatus: 500 });
    const created = createPreauthRegistrationToken("Carlos", "Perez")!;

    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `g_csrf_token=csrf_valid; ${PREAUTH_COOKIE_NAME}=${created.token}`
      },
      body: "credential=mock_token&g_csrf_token=csrf_valid"
    });
    const response = await POST(request);
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("service_unavailable");
  });

  it("13. malformed replay response fails closed (503)", async () => {
    global.fetch = setupFetchMock({ dbMalformed: true });
    const created = createPreauthRegistrationToken("Carlos", "Perez")!;

    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `g_csrf_token=csrf_valid; ${PREAUTH_COOKIE_NAME}=${created.token}`
      },
      body: "credential=mock_token&g_csrf_token=csrf_valid"
    });
    const response = await POST(request);
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("service_unavailable");
  });

  // =========================================================================
  // GROUP 3: GOOGLE IDENTITY SERVICES REQUEST & CSRF VALIDATION (Items 14 - 18)
  // =========================================================================

  it("14. missing Google credential returns controlled 400 error", async () => {
    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "g_csrf_token=csrf_token"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("missing_credential");
  });

  it("15. missing CSRF cookie returns controlled 400 error", async () => {
    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "credential=mock_token&g_csrf_token=body_csrf"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("missing_csrf_cookie");
  });

  it("16. missing CSRF body token returns controlled 400 error", async () => {
    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=cookie_csrf"
      },
      body: "credential=mock_token"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("missing_csrf_token");
  });

  it("17. CSRF mismatch between cookie and body returns controlled 400 error", async () => {
    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=cookie_token_abc"
      },
      body: "credential=mock_token&g_csrf_token=body_token_xyz"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("csrf_mismatch");
  });

  it("18. invalid Google credential rejected by upstream with controlled error", async () => {
    global.fetch = setupFetchMock({ upstreamStatus: 401 });

    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=bad_credential&g_csrf_token=valid_csrf"
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("auth_failed");
  });

  // =========================================================================
  // GROUP 4: UPSTREAM CONTRACT & SUCCESS PROPAGATION (Items 19 - 25)
  // =========================================================================

  it("19. valid Google credential mocked successfully", async () => {
    global.fetch = setupFetchMock({ upstreamStatus: 200, upstreamBody: { ok: true, user_id: 42 } });

    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=valid_google_token&g_csrf_token=valid_csrf"
    });
    const response = await POST(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://barberagency-barberagency.gymh5g.easypanel.host/inicio/");
  });

  it("20. nombre forwarded upstream from preauth cookie", async () => {
    let capturedBody: any = null;
    global.fetch = setupFetchMock({
      onUpstreamCall: (body) => {
        capturedBody = body;
      }
    });

    const created = createPreauthRegistrationToken("Alejandro", "Gomez")!;
    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `g_csrf_token=valid_csrf; ${PREAUTH_COOKIE_NAME}=${created.token}`
      },
      body: "credential=google_jwt_123&g_csrf_token=valid_csrf"
    });

    await POST(request);
    expect(capturedBody).toBeTruthy();
    expect(capturedBody.nombre).toBe("Alejandro");
  });

  it("21. apellido forwarded upstream from preauth cookie", async () => {
    let capturedBody: any = null;
    global.fetch = setupFetchMock({
      onUpstreamCall: (body) => {
        capturedBody = body;
      }
    });

    const created = createPreauthRegistrationToken("Alejandro", "Gomez")!;
    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `g_csrf_token=valid_csrf; ${PREAUTH_COOKIE_NAME}=${created.token}`
      },
      body: "credential=google_jwt_123&g_csrf_token=valid_csrf"
    });

    await POST(request);
    expect(capturedBody).toBeTruthy();
    expect(capturedBody.apellido).toBe("Gomez");
    expect(capturedBody.token).toBe("google_jwt_123");
    expect(capturedBody.id_token).toBe("google_jwt_123");
  });

  it("22. ba_session cookie propagated from upstream to client", async () => {
    const sessionToken = "ba_session_token_secure_value_xyz789";
    global.fetch = setupFetchMock({
      upstreamHeaders: {
        "set-cookie": `ba_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax`
      }
    });

    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=valid_token&g_csrf_token=valid_csrf"
    });

    const response = await POST(request);
    expect(response.headers.get("set-cookie")).toContain(`ba_session=${sessionToken}`);
  });

  it("23. success returns HTTP 303 redirect to /inicio/", async () => {
    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=valid_token&g_csrf_token=valid_csrf"
    });

    const response = await POST(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://barberagency-barberagency.gymh5g.easypanel.host/inicio/"
    );
  });

  it("24. auth error returns controlled 303 redirect to /registro/?auth_error=... for browser navigation", async () => {
    global.fetch = setupFetchMock({ upstreamStatus: 401 });

    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=bad_token&g_csrf_token=valid_csrf"
    });

    const response = await POST(request);
    expect(response.status).toBe(303);
    const location = response.headers.get("location") || "";
    expect(location).toBe(
      "https://barberagency-barberagency.gymh5g.easypanel.host/registro/?auth_error=auth_failed"
    );
  });

  it("25. no raw JSON browser UX: browser top-level navigation never renders JSON on error", async () => {
    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
        Accept: "text/html",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=&g_csrf_token=valid_csrf"
    });

    const response = await POST(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("content-type") || "").not.toContain("application/json");
    expect(response.headers.get("location")).toContain("/registro/?auth_error=missing_credential");
  });

  // =========================================================================
  // GROUP 5: DATA LEAKAGE & HOST HEADER SECURITY (Items 26 - 30)
  // =========================================================================

  it("26. no JWT leak in redirect URL or response body", async () => {
    const googleJwt = "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9.eyJuYW1lIjoiQ2FybG9zIn0.sig";

    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: `credential=${googleJwt}&g_csrf_token=valid_csrf`
    });

    const response = await POST(request);
    const location = response.headers.get("location") || "";
    const body = await response.text();

    expect(location).not.toContain(googleJwt);
    expect(body).not.toContain(googleJwt);
  });

  it("27. no credential leak in redirect location or body", async () => {
    const sensitiveCredential = "super_sensitive_google_oauth2_credential_secret_string";

    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: `credential=${sensitiveCredential}&g_csrf_token=valid_csrf`
    });

    const response = await POST(request);
    const location = response.headers.get("location") || "";
    const body = await response.text();

    expect(location).not.toContain(sensitiveCredential);
    expect(body).not.toContain(sensitiveCredential);
  });

  it("28. no cookie leak in redirect URL", async () => {
    const sessionVal = "sensitive_ba_session_never_put_in_url";
    global.fetch = setupFetchMock({
      upstreamHeaders: {
        "set-cookie": `ba_session=${sessionVal}; Path=/; HttpOnly; Secure; SameSite=Lax`
      }
    });

    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=mock_token&g_csrf_token=valid_csrf"
    });

    const response = await POST(request);
    const location = response.headers.get("location") || "";
    expect(location).not.toContain(sessionVal);
  });

  it("29. arbitrary Host attack ignored; redirects to canonical safe origin", async () => {
    const request = new Request("http://localhost:3000/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Host: "attacker.evil.com",
        "X-Forwarded-Host": "attacker.evil.com",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=mock_token&g_csrf_token=valid_csrf"
    });

    const response = await POST(request);
    expect(response.status).toBe(303);
    const location = response.headers.get("location") || "";
    expect(location).not.toContain("attacker.evil.com");
    expect(location).toBe("https://barberagency-barberagency.gymh5g.easypanel.host/inicio/");
  });

  it("30. localhost protection: no localhost or :3000 in redirect origin", async () => {
    const request = new Request("http://localhost:3000/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Host: "localhost:3000",
        "X-Forwarded-Host": "127.0.0.1:3000",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=mock_token&g_csrf_token=valid_csrf"
    });

    const response = await POST(request);
    expect(response.status).toBe(303);
    const location = response.headers.get("location") || "";
    expect(location).not.toContain("localhost");
    expect(location).not.toContain("127.0.0.1");
    expect(location).not.toContain(":3000");
    expect(location).toBe("https://barberagency-barberagency.gymh5g.easypanel.host/inicio/");
  });

  // =========================================================================
  // GROUP 6: FRONTEND REGISTRATION TEMPLATE SECURITY (Items 31 - 34)
  // =========================================================================

  it("31. keyboard bypass prevented: target container initializes with inert and aria-hidden", () => {
    const templatePath = path.resolve(
      __dirname,
      "../../barberagency-core/project/templates/plantillas/registro.html"
    );
    expect(fs.existsSync(templatePath)).toBe(true);
    const content = fs.readFileSync(templatePath, "utf8");

    expect(content).toContain('id="ba2GoogleTarget" class="ba2-google-target" inert aria-hidden="true"');
    expect(content).toContain('id="ba2GoogleShield"');
  });

  it("32. touch interaction safe: shield button validates input and delegates safely", () => {
    const templatePath = path.resolve(
      __dirname,
      "../../barberagency-core/project/templates/plantillas/registro.html"
    );
    const content = fs.readFileSync(templatePath, "utf8");

    expect(content).toContain('shield.addEventListener("click", handleShieldClick)');
    expect(content).toContain('target.removeAttribute("inert")');
    expect(content).toContain('target.removeAttribute("aria-hidden")');
  });

  it("33. double-click safe: syncPreRegister includes concurrency guard", () => {
    const templatePath = path.resolve(
      __dirname,
      "../../barberagency-core/project/templates/plantillas/registro.html"
    );
    const content = fs.readFileSync(templatePath, "utf8");

    expect(content).toContain("if (isSyncing) return false;");
    expect(content).toContain("isSyncing = true;");
    expect(content).toContain("isSyncing = false;");
  });

  it("34. slow pre-register network safe: Google container remains locked until HTTP 200", () => {
    const templatePath = path.resolve(
      __dirname,
      "../../barberagency-core/project/templates/plantillas/registro.html"
    );
    const content = fs.readFileSync(templatePath, "utf8");

    expect(content).toContain("if (res.ok) {");
    expect(content).toContain('target.removeAttribute("inert")');
    expect(content).toContain('shield.style.display = "none"');
  });

  // =========================================================================
  // GROUP 7: COOKIE HYGIENE, LIFECYCLE & ARCHITECTURE (Items 35 - 40)
  // =========================================================================

  it("35. cookie set Path=/api/auth/ with Secure, HttpOnly, SameSite=None", () => {
    expect(PREAUTH_COOKIE_PATH).toBe("/api/auth/");
    const cookie = buildPreauthCookie("test_token_val");
    expect(cookie).toContain(`Path=${PREAUTH_COOKIE_PATH}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=None");
  });

  it("36. cookie clear Path=/api/auth/ with Max-Age=0", () => {
    const clearCookie = buildClearPreauthCookie();
    expect(clearCookie).toContain(`Path=${PREAUTH_COOKIE_PATH}`);
    expect(clearCookie).toContain("Max-Age=0");
    expect(clearCookie).toContain("HttpOnly");
    expect(clearCookie).toContain("Secure");
    expect(clearCookie).toContain("SameSite=None");
  });

  it("37. cookie expiry set to 10 minutes (Max-Age=600)", () => {
    const cookie = buildPreauthCookie("test_token_val");
    expect(cookie).toContain("Max-Age=600");
  });

  it("38. upstream outage cleanup: preauth cookie cleared on upstream failure", async () => {
    global.fetch = setupFetchMock({ upstreamStatus: 502 });

    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=mock_token&g_csrf_token=valid_csrf"
    });

    const response = await POST(request);
    const setCookie = response.headers.get("Set-Cookie") || "";
    expect(setCookie).toContain(`${PREAUTH_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
  });

  it("39. restart/shared replay semantics: single-use enforced across process restart", async () => {
    const created = createPreauthRegistrationToken("Carlos", "Perez")!;

    // Initial consumption succeeds
    const first = await consumePreauthRegistration(created.token);
    expect(first.success).toBe(true);

    // Simulate process restart by clearing local memory cache
    resetConsumedNoncesForTesting();

    // Configure mock to indicate key has already reached points limit in shared DB
    global.fetch = setupFetchMock({ dbAllowed: false });

    const replayAfterRestart = await consumePreauthRegistration(created.token);
    expect(replayAfterRestart.success).toBe(false);
    expect(replayAfterRestart.reason).toBe("already_consumed_replay");
  });

  it("40. existing auth regression: direct login without preauth cookie succeeds", async () => {
    let capturedBody: any = null;
    global.fetch = setupFetchMock({
      onUpstreamCall: (body) => {
        capturedBody = body;
      }
    });

    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=direct_login_google_token&g_csrf_token=valid_csrf"
    });

    const response = await POST(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://barberagency-barberagency.gymh5g.easypanel.host/inicio/"
    );
    expect(capturedBody).toEqual({
      token: "direct_login_google_token",
      id_token: "direct_login_google_token"
    });
  });

  // Additional sanity check for GET method
  it("GET returns 405 Method Not Allowed with Allow: POST header", async () => {
    const response = await GET();
    expect(response.status).toBe(405);
    const allowHeader = response.headers.get("Allow");
    expect(allowHeader).toBeTruthy();
    expect(allowHeader).toContain("POST");
  });
});
