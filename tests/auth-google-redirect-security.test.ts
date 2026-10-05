/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Ensure mock endpoint is set before importing route
process.env.GOOGLE_SESSION_ENDPOINT = "http://upstream.internal/auth/google-session";

import { GET, POST } from "../src/app/api/auth/google-redirect/route";

describe("auth/google-redirect security & redirect contract", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("1. GET returns 405 Method Not Allowed with Allow: POST header", async () => {
    const response = await GET();
    expect(response.status).toBe(405);
    const allowHeader = response.headers.get("Allow");
    expect(allowHeader).toBeTruthy();
    expect(allowHeader).toContain("POST");
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("method_not_allowed");
  });

  it("2. POST missing credential returns controlled 400", async () => {
    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=csrf_valid_token"
      },
      body: "g_csrf_token=csrf_valid_token"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("missing_credential");
  });

  it("3. missing CSRF cookie returns controlled 400", async () => {
    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
        // Missing Cookie header
      },
      body: "credential=mock_token_abc&g_csrf_token=csrf_token_xyz"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("missing_csrf_cookie");
  });

  it("4. missing CSRF form value returns controlled 400", async () => {
    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=csrf_token_xyz"
      },
      body: "credential=mock_token_abc" // missing g_csrf_token
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("missing_csrf_token");
  });

  it("5. mismatched CSRF returns controlled 400", async () => {
    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=token_in_cookie"
      },
      body: "credential=mock_token_abc&g_csrf_token=different_token_in_body"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("csrf_mismatch");
  });

  it("6. invalid upstream credential returns controlled auth failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 401,
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify({ ok: false, message: "Invalid Google token" }))
    } as any);

    const request = new Request("http://localhost/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=bad_credential_jwt&g_csrf_token=valid_csrf"
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("auth_failed");
  });

  it("7. successful mocked auth propagates ba_session", async () => {
    const secretSessionToken = "eyMockValidSessionJwt777";
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({
        "set-cookie": `ba_session=${secretSessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax`
      }),
      text: () => Promise.resolve(JSON.stringify({ ok: true, user_id: 99 }))
    } as any);

    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=mock_google_id_token&g_csrf_token=valid_csrf"
    });
    const response = await POST(request);
    expect(response.status).toBe(303);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain(`ba_session=${secretSessionToken}`);
  });

  it("8. success redirects with HTTP 303 to canonical post-login route (/inicio/)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify({
        ok: true,
        user_id: 123,
        set_cookie: "ba_session=mock_sess_123; Path=/; HttpOnly; Secure; SameSite=Lax"
      }))
    } as any);

    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=mock_google_id_token&g_csrf_token=valid_csrf"
    });
    const response = await POST(request);
    expect(response.status).toBe(303);
    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    expect(location).toBe("https://barberagency-barberagency.gymh5g.easypanel.host/inicio/");
  });

  it("9. response contains no JWT, credential or secret token leakage", async () => {
    const secretGoogleToken = "secret_raw_google_jwt_never_leak_this_token";
    const secretSessionToken = "secret_ba_session_jwt_never_leak_this_token";

    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify({
        ok: true,
        user_id: 123,
        ba_session: secretSessionToken,
        set_cookie: `ba_session=${secretSessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax`
      }))
    } as any);

    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: `credential=${secretGoogleToken}&g_csrf_token=valid_csrf`
    });
    const response = await POST(request);
    expect(response.status).toBe(303);

    // Verify Location header contains no token or credential in query params
    const location = response.headers.get("location") || "";
    expect(location).not.toContain(secretGoogleToken);
    expect(location).not.toContain(secretSessionToken);
    expect(location).not.toContain("credential");
    expect(location).not.toContain("token");

    // Verify response body does not leak tokens
    const bodyText = await response.text();
    expect(bodyText).not.toContain(secretGoogleToken);
    expect(bodyText).not.toContain(secretSessionToken);
  });

  it("10. no localhost, 127.0.0.1, internal hostname or port :3000 in redirect", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({
        "set-cookie": "ba_session=dummy; Path=/; HttpOnly; Secure; SameSite=Lax"
      }),
      text: () => Promise.resolve(JSON.stringify({ ok: true }))
    } as any);

    // Simulate request originating from localhost:3000 or internal container
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
    expect(location).not.toContain(".internal");
    expect(location).not.toContain(".local");
    expect(location).toBe("https://barberagency-barberagency.gymh5g.easypanel.host/inicio/");
  });

  it("11. cookie security attributes preserved (HttpOnly, Secure, SameSite=Lax, Path=/)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({
        // Upstream gives raw cookie with domain or missing attributes
        "set-cookie": "ba_session=token_abc; domain=internal.host"
      }),
      text: () => Promise.resolve(JSON.stringify({ ok: true }))
    } as any);

    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=mock_token&g_csrf_token=valid_csrf"
    });
    const response = await POST(request);
    expect(response.status).toBe(303);
    const setCookie = response.headers.get("set-cookie") || "";
    expect(setCookie).toContain("ba_session=token_abc");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain("domain=");
  });

  it("12. adversarial host header (attacker.example) does not control redirect origin", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({
        "set-cookie": "ba_session=safe_session_token; Path=/; HttpOnly; Secure; SameSite=Lax"
      }),
      text: () => Promise.resolve(JSON.stringify({ ok: true }))
    } as any);

    // Adversary attempts open redirect attack via Host and X-Forwarded-Host injection
    const request = new Request("http://localhost:3000/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Host: "attacker.example",
        "X-Forwarded-Host": "attacker.example",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=mock_token&g_csrf_token=valid_csrf"
    });
    const response = await POST(request);
    expect(response.status).toBe(303);
    const location = response.headers.get("location") || "";
    expect(location).not.toContain("attacker.example");
    expect(location).toBe("https://barberagency-barberagency.gymh5g.easypanel.host/inicio/");
  });

  it("13. upstream exception returns generic controlled message without leaking internal details", async () => {
    global.fetch = vi.fn().mockRejectedValue(
      new Error("connect ECONNREFUSED http://internal-db.container.internal:5432/secrets")
    );

    const request = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/api/auth/google-redirect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: "g_csrf_token=valid_csrf"
      },
      body: "credential=mock_token&g_csrf_token=valid_csrf"
    });
    const response = await POST(request);
    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("upstream_error");
    // Verify no internal host, port or connection strings leaked
    expect(json.message).toBe("No fue posible conectar con el servicio de autenticacion");
    expect(JSON.stringify(json)).not.toContain("internal-db");
    expect(JSON.stringify(json)).not.toContain("5432");
    expect(JSON.stringify(json)).not.toContain("ECONNREFUSED");
  });
});
