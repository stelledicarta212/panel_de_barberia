/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Set dummy endpoint before importing route
process.env.DASHBOARD_LOGIN_ENDPOINT = "http://upstream.internal/dashboard/login";

import { POST, sanitizeAuthResponseBody } from "../src/app/api/session/login/route";

describe("session/login security & sanitization (SEC-P0-06)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("sanitizeAuthResponseBody pure unit tests for password login", () => {
    it("extracts set_cookie and strips set_cookie and ba_session from body", () => {
      const upstreamBody = {
        ok: true,
        status: "success",
        identity: { barberia_id: 198, slug: "barberia-prueba-4" },
        user: { id: 40, nombre: "Admin", email: "admin@example.com", role: "owner" },
        role: "owner",
        permissions: { canViewDashboard: true },
        set_cookie: "ba_session=jwt_header_secret_token; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax",
        ba_session: "jwt_header_secret_token"
      };

      const { sanitizedBody, extractedCookie } = sanitizeAuthResponseBody(upstreamBody);

      expect(extractedCookie).toBe(
        "ba_session=jwt_header_secret_token; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax"
      );

      const record = sanitizedBody as Record<string, unknown>;
      expect(record.ok).toBe(true);
      expect(record.status).toBe("success");
      expect(record.role).toBe("owner");
      expect(record.identity).toEqual({ barberia_id: 198, slug: "barberia-prueba-4" });
      expect(record.user).toEqual({ id: 40, nombre: "Admin", email: "admin@example.com", role: "owner" });

      // Invariant: no leak fields
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
      const body = { ok: false, message: "Credenciales invalidas" };
      const { sanitizedBody, extractedCookie } = sanitizeAuthResponseBody(body);
      expect(extractedCookie).toBeNull();
      expect(sanitizedBody).toEqual({ ok: false, message: "Credenciales invalidas" });
    });
  });

  describe("POST /api/session/login route handler", () => {
    it("delivers Set-Cookie header and removes set_cookie and raw JWT from browser-facing JSON on HTTP 200", async () => {
      const secretJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretPayload.signatureMock";
      const upstreamPayload = {
        ok: true,
        status: "success",
        identity: { barberia_id: 198, slug: "barberia-prueba-4" },
        user: { id: 40, nombre: "Admin", email: "admin@example.com", role: "owner" },
        role: "owner",
        permissions: { canViewDashboard: true, canViewAppointments: true },
        set_cookie: `ba_session=${secretJwt}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`
      };

      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          status: 200,
          headers: new Headers(), // n8n does not deliver Set-Cookie header; returns it in body
          text: () => Promise.resolve(JSON.stringify(upstreamPayload))
        } as any)
      );

      const request = new Request("http://localhost/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password: "secret_password" })
      });

      const response = await POST(request);

      expect(response.status).toBe(200);

      // 1. Set-Cookie header contains ba_session with flags
      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain(`ba_session=${secretJwt}`);
      expect(setCookieHeader).toContain("HttpOnly");
      expect(setCookieHeader).toContain("Secure");
      expect(setCookieHeader).toContain("SameSite=Lax");

      // 2. Browser-visible JSON does NOT expose set_cookie or raw JWT
      const responseJson = await response.json();
      expect(responseJson.ok).toBe(true);
      expect(responseJson.status).toBe("success");
      expect(responseJson.role).toBe("owner");
      expect(responseJson.identity).toEqual({ barberia_id: 198, slug: "barberia-prueba-4" });
      expect(responseJson.user).toEqual({ id: 40, nombre: "Admin", email: "admin@example.com", role: "owner" });
      expect(responseJson.permissions).toEqual({ canViewDashboard: true, canViewAppointments: true });

      expect(responseJson.set_cookie).toBeUndefined();
      expect(responseJson.ba_session).toBeUndefined();
      const stringifiedBody = JSON.stringify(responseJson);
      expect(stringifiedBody).not.toContain("set_cookie");
      expect(stringifiedBody).not.toContain("ba_session");
      expect(stringifiedBody).not.toContain(secretJwt);
    });

    it("sanitizes error responses (HTTP 401) when upstream includes clear-cookie", async () => {
      const upstreamErrorPayload = {
        ok: false,
        status: "invalid_credentials",
        identity: { barberia_id: null, slug: null },
        user: { id: null, nombre: null, email: null, role: "guest", barbero_id: null },
        role: "guest",
        message: "Credenciales invalidas",
        permissions: { canViewDashboard: false },
        set_cookie: "ba_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
      };

      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          status: 401,
          headers: new Headers(),
          text: () => Promise.resolve(JSON.stringify(upstreamErrorPayload))
        } as any)
      );

      const request = new Request("http://localhost/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "wrong@example.com", password: "wrong" })
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain("ba_session=");

      const responseJson = await response.json();
      expect(responseJson.ok).toBe(false);
      expect(responseJson.message).toBe("Credenciales invalidas");
      expect(responseJson.set_cookie).toBeUndefined();
      expect(responseJson.ba_session).toBeUndefined();
      expect(JSON.stringify(responseJson)).not.toContain("set_cookie");
    });
  });
});
