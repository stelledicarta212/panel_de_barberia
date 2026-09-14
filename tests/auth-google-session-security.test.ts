/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Set dummy endpoint before importing route
process.env.GOOGLE_SESSION_ENDPOINT = "http://upstream.internal/auth/google-session";

import { POST, sanitizeAuthResponseBody } from "../src/app/api/auth/google-session/route";

describe("auth/google-session security & sanitization", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("sanitizeAuthResponseBody pure unit tests", () => {
    it("extracts set_cookie and strips set_cookie and ba_session from body", () => {
      const upstreamBody = {
        ok: true,
        user_id: 101,
        email: "carlos@example.com",
        nombre: "Carlos",
        apellido: "Alvis",
        plan_id: 2,
        puede_crear_barberia: true,
        set_cookie: "ba_session=jwt_header_secret_token; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax",
        ba_session: "jwt_header_secret_token"
      };

      const { sanitizedBody, extractedCookie } = sanitizeAuthResponseBody(upstreamBody);

      expect(extractedCookie).toBe(
        "ba_session=jwt_header_secret_token; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax"
      );

      const record = sanitizedBody as Record<string, unknown>;
      expect(record.ok).toBe(true);
      expect(record.user_id).toBe(101);
      expect(record.email).toBe("carlos@example.com");
      expect(record.nombre).toBe("Carlos");
      expect(record.apellido).toBe("Alvis");
      expect(record.plan_id).toBe(2);
      expect(record.puede_crear_barberia).toBe(true);

      // Verify leak fields are removed
      expect("set_cookie" in record).toBe(false);
      expect("ba_session" in record).toBe(false);
      expect(JSON.stringify(record)).not.toContain("jwt_header_secret_token");
      expect(JSON.stringify(record)).not.toContain("set_cookie");
    });

    it("handles non-object and null gracefully", () => {
      expect(sanitizeAuthResponseBody(null)).toEqual({ sanitizedBody: null, extractedCookie: null });
      expect(sanitizeAuthResponseBody("text")).toEqual({ sanitizedBody: "text", extractedCookie: null });
      expect(sanitizeAuthResponseBody([1, 2, 3])).toEqual({ sanitizedBody: [1, 2, 3], extractedCookie: null });
    });

    it("handles object without set_cookie", () => {
      const body = { ok: false, message: "Error sin cookie" };
      const { sanitizedBody, extractedCookie } = sanitizeAuthResponseBody(body);
      expect(extractedCookie).toBeNull();
      expect(sanitizedBody).toEqual({ ok: false, message: "Error sin cookie" });
    });
  });

  describe("POST /api/auth/google-session route handler", () => {
    it("emits Set-Cookie header and removes set_cookie / JWT from browser-facing JSON on HTTP 200", async () => {
      const secretToken = "eyMockPayloadSecretToken12345";
      const upstreamPayload = {
        ok: true,
        user_id: 42,
        email: "barber@example.com",
        nombre: "Carlos",
        apellido: "Alvis",
        plan_id: 1,
        puede_crear_barberia: true,
        set_cookie: `ba_session=${secretToken}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`
      };

      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          status: 200,
          headers: new Headers(), // Upstream does not emit Set-Cookie header (e.g. n8n)
          text: () => Promise.resolve(JSON.stringify(upstreamPayload))
        } as any)
      );

      const request = new Request("http://localhost/api/auth/google-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "google_oauth_token" })
      });

      const response = await POST(request);

      expect(response.status).toBe(200);

      // Verify Set-Cookie header contains normalized session cookie
      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain(`ba_session=${secretToken}`);
      expect(setCookieHeader).toContain("HttpOnly");
      expect(setCookieHeader).toContain("Secure");
      expect(setCookieHeader).toContain("SameSite=Lax");

      // Verify JSON body received by browser
      const responseJson = await response.json();
      expect(responseJson.ok).toBe(true);
      expect(responseJson.user_id).toBe(42);
      expect(responseJson.email).toBe("barber@example.com");
      expect(responseJson.nombre).toBe("Carlos");
      expect(responseJson.apellido).toBe("Alvis");
      expect(responseJson.plan_id).toBe(1);
      expect(responseJson.puede_crear_barberia).toBe(true);

      // CRITICAL SECURITY INVARIANT: No cookie or JWT in response body
      expect(responseJson.set_cookie).toBeUndefined();
      expect(responseJson.ba_session).toBeUndefined();
      const stringifiedBody = JSON.stringify(responseJson);
      expect(stringifiedBody).not.toContain("set_cookie");
      expect(stringifiedBody).not.toContain("ba_session");
      expect(stringifiedBody).not.toContain(secretToken);
    });

    it("sanitizes error responses if upstream includes set_cookie on failure", async () => {
      const secretToken = "mock_error_token_999";
      const upstreamErrorPayload = {
        ok: false,
        message: "Invalid credentials",
        set_cookie: `ba_session=${secretToken}; Path=/`
      };

      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          status: 401,
          headers: new Headers(),
          text: () => Promise.resolve(JSON.stringify(upstreamErrorPayload))
        } as any)
      );

      const request = new Request("http://localhost/api/auth/google-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "invalid_token" })
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const responseJson = await response.json();
      expect(responseJson.ok).toBe(false);
      expect(responseJson.message).toBe("Invalid credentials");
      expect(responseJson.set_cookie).toBeUndefined();
      expect(JSON.stringify(responseJson)).not.toContain(secretToken);
    });
  });
});
