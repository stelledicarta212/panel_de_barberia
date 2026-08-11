/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from "vitest";

// Set environment variables before importing the route module
process.env.DASHBOARD_LOGIN_ENDPOINT = "https://barberagency-n8n.gymh5g.easypanel.host/webhook/login";

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { apiFetch } from "../src/lib/api";
import { readBaSession } from "../src/app/api/editor/auth";
import { env } from "../src/lib/env";
import { normalizeSessionSetCookies } from "../src/app/api/session/cookies";
import { POST as loginPost } from "../src/app/api/session/login/route";

describe("Remediation: local API same-origin routing and session cookie parsing", () => {
  const originalFetch = global.fetch;
  const originalApiBaseUrl = env.apiBaseUrl;

  beforeEach(() => {
    env.apiBaseUrl = "https://barberagency-n8n.gymh5g.easypanel.host";
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true })))
    );
  });

  afterEach(() => {
    env.apiBaseUrl = originalApiBaseUrl;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("should keep local Next.js /api/ routes relative to same-origin", async () => {
    await apiFetch("/api/editor/publish", { method: "POST" });
    expect(global.fetch).toHaveBeenCalledWith("/api/editor/publish", expect.any(Object));
  });

  it("should prepend env.apiBaseUrl for external webhook and non-/api/ routes", async () => {
    await apiFetch("/webhook/barberagency/test", { method: "POST" });
    const calledUrl = (global.fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain("https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/test");
  });

  it("should correctly parse the ba_session cookie from the cookie header", () => {
    const cookieHeader = "other_cookie=123; ba_session=session_token_xyz_123; another=456";
    const session = readBaSession(cookieHeader);
    expect(session).toBe("session_token_xyz_123");
  });

  it("should normalize ba_session cookie to be Host-Only (remove Domain attribute)", () => {
    const rawCookie = "ba_session=my_secret_token; Domain=.gymh5g.easypanel.host; Path=/";
    const normalized = normalizeSessionSetCookies(rawCookie);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toContain("ba_session=my_secret_token");
    expect(normalized[0]).not.toContain("Domain=");
    expect(normalized[0]).not.toContain("domain=");
    expect(normalized[0]).toContain("Path=/");
    expect(normalized[0]).toContain("HttpOnly");
    expect(normalized[0]).toContain("Secure");
    expect(normalized[0]).toContain("SameSite=Lax");
  });

  it("should extract cookie from body.set_cookie if header is missing in login", async () => {
    const mockUpstreamResponse = {
      ok: true,
      user: { id: 1 },
      set_cookie: "ba_session=token_abc_123; Domain=.gymh5g.easypanel.host; Path=/"
    };

    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(), // No Set-Cookie header
        text: () => Promise.resolve(JSON.stringify(mockUpstreamResponse))
      } as any)
    );

    const mockRequest = new Request("http://localhost/api/session/login", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com", password: "pwd" })
    });

    const response = await loginPost(mockRequest);
    expect(response.status).toBe(200);
    
    // Check Set-Cookie headers in the response
    const setCookieHeaders = (response.headers as any).getSetCookie 
      ? (response.headers as any).getSetCookie() 
      : [response.headers.get("Set-Cookie")];
      
    expect(setCookieHeaders).toHaveLength(1);
    expect(setCookieHeaders[0]).toContain("ba_session=token_abc_123");
    expect(setCookieHeaders[0]).not.toContain("Domain=");
  });
});
