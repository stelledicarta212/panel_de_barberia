import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPTIONS, POST } from "../src/app/api/onboarding/complete/route";

describe("POST /api/onboarding/complete route handler", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SESSION_ME_ENDPOINT = "https://auth.test.local/session/me";
    delete process.env.ONBOARDING_ENDPOINT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("handles CORS OPTIONS preflight with 204", async () => {
    const req = new Request("http://localhost/api/onboarding/complete", {
      method: "OPTIONS",
      headers: { Origin: "https://barberagency-barberagency.gymh5g.easypanel.host" }
    });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
  });

  it("returns 401 if session cookie ba_session is missing", async () => {
    const req = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Barberia Nueva" })
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("no_autorizado");
  });

  it("returns 401 if /session/me rejects session", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(JSON.stringify({ ok: false }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const req = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "ba_session=invalid-session"
      },
      body: JSON.stringify({ nombre: "Barberia Nueva" })
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("session_invalida");
  });

  it("returns 500 when ONBOARDING_ENDPOINT is missing without silently falling back to production", async () => {
    delete process.env.ONBOARDING_ENDPOINT;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(JSON.stringify({ ok: true, user_id: 12 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("Should not be called", { status: 500 });
    });

    const req = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "ba_session=valid-sess"
      },
      body: JSON.stringify({ nombre: "Barberia Test", slug: "barberia-test" })
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("onboarding_endpoint_not_configured");
  });

  it("returns 500 when ONBOARDING_ENDPOINT is not a valid HTTP/HTTPS URL", async () => {
    process.env.ONBOARDING_ENDPOINT = "not-a-valid-url";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(JSON.stringify({ ok: true, user_id: 12 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("Should not be called", { status: 500 });
    });

    const req = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "ba_session=valid-sess"
      },
      body: JSON.stringify({ nombre: "Barberia Test", slug: "barberia-test" })
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("onboarding_endpoint_not_configured");
  });

  it("returns 400 when slug format is invalid or contains path traversal", async () => {
    process.env.ONBOARDING_ENDPOINT = "https://staging.test.local/webhook/registro";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(JSON.stringify({ ok: true, user_id: 12 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const req = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "ba_session=valid-sess"
      },
      body: JSON.stringify({ nombre: "Barberia Test", slug: "../../etc/passwd" })
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("slug_invalido");
  });

  it("returns 400 when service imagen_url is not a secure canonical storage URL", async () => {
    process.env.ONBOARDING_ENDPOINT = "https://staging.test.local/webhook/registro";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(JSON.stringify({ ok: true, user_id: 12 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const req = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "ba_session=valid-sess"
      },
      body: JSON.stringify({
        nombre: "Barberia Test",
        slug: "barberia-test",
        servicios: [
          {
            nombre: "Corte Hack",
            precio: 20000,
            imagen_url: "javascript:alert(1)"
          }
        ]
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("imagen_url_invalida");
  });

  it("returns 400 when barber foto_url is not a secure canonical storage URL", async () => {
    process.env.ONBOARDING_ENDPOINT = "https://staging.test.local/webhook/registro";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(JSON.stringify({ ok: true, user_id: 12 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const req = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "ba_session=valid-sess"
      },
      body: JSON.stringify({
        nombre: "Barberia Test",
        slug: "barberia-test",
        barberos: [
          {
            nombre: "Barbero Malicioso",
            foto_url: "http://169.254.169.254/latest/meta-data"
          }
        ]
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("foto_url_invalida");
  });

  it("handles upstream timeout with 504 and may_have_succeeded advisory", async () => {
    process.env.ONBOARDING_ENDPOINT = "https://staging.test.local/webhook/registro";
    process.env.ONBOARDING_TIMEOUT_MS = "10"; // Short timeout for test

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(JSON.stringify({ ok: true, user_id: 12 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url.includes("/webhook/registro")) {
        return new Promise((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const req = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "ba_session=valid-sess"
      },
      body: JSON.stringify({ nombre: "Barberia Lenta", slug: "barberia-lenta" })
    });

    const res = await POST(req);
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("onboarding_timeout");
    expect(body.may_have_succeeded).toBe(true);
  });

  it("forwards to explicit ONBOARDING_ENDPOINT with cookie, valid canonical image URLs, and strips client auth params", async () => {
    process.env.ONBOARDING_ENDPOINT = "https://n8n.staging.local/webhook/registro-barberia";
    let capturedUpstreamUrl = "";
    let capturedUpstreamCookie = "";
    let capturedUpstreamBody: Record<string, unknown> = {};

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(
          JSON.stringify({ ok: true, user_id: 88, email: "admin@test.com" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/webhook/registro-barberia")) {
        capturedUpstreamUrl = url;
        const headers = (init?.headers as Record<string, string>) || {};
        capturedUpstreamCookie = headers.Cookie || headers.cookie || "";
        capturedUpstreamBody = JSON.parse(String(init?.body || "{}"));
        return new Response(
          JSON.stringify({
            ok: true,
            success: true,
            barberia_id: 301,
            slug: "barberia-prueba-ui",
            message: "Barberia registrada correctamente"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const clientPayload = {
      nombre: "Barberia Prueba UI",
      slug: "barberia-prueba-ui",
      telefono: "3001234567",
      user_id: 9999, // Attempted client spoof
      email: "attacker@test.com", // Attempted client spoof
      servicios: [
        {
          nombre: "Corte",
          duracion_min: 30,
          precio: 25000,
          imagen_url: "https://pub-369b1ea177db4f8e8b8fb47c8f6c0ef7.r2.dev/services/corte.jpg"
        }
      ]
    };

    const req = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "ba_session=sess-valid-token"
      },
      body: JSON.stringify(clientPayload)
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.barberia_id).toBe(301);
    expect(body.slug).toBe("barberia-prueba-ui");

    expect(capturedUpstreamUrl).toBe("https://n8n.staging.local/webhook/registro-barberia");
    expect(capturedUpstreamCookie).toBe("ba_session=sess-valid-token");
    expect(capturedUpstreamBody.user_id).toBeUndefined();
    expect(capturedUpstreamBody.email).toBeUndefined();
    expect(capturedUpstreamBody.nombre).toBe("Barberia Prueba UI");
  });

  it("handles ambiguous n8n array responses correctly by extracting first item", async () => {
    process.env.ONBOARDING_ENDPOINT = "https://n8n.staging.local/webhook/registro-barberia";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(JSON.stringify({ ok: true, user_id: 10 }), { status: 200 });
      }
      if (url.includes("/webhook/registro-barberia")) {
        return new Response(
          JSON.stringify([
            {
              ok: true,
              barberia_id: 305,
              slug: "barberia-array"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const req = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "ba_session=sess-valid" },
      body: JSON.stringify({ nombre: "Barberia Array", slug: "barberia-array" })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.barberia_id).toBe(305);
  });

  it("handles ambiguous n8n error responses where success: false is returned without ok: false", async () => {
    process.env.ONBOARDING_ENDPOINT = "https://n8n.staging.local/webhook/registro-barberia";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(JSON.stringify({ ok: true, user_id: 10 }), { status: 200 });
      }
      if (url.includes("/webhook/registro-barberia")) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Error de integridad referencial en PostgreSQL"
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const req = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "ba_session=sess-valid" },
      body: JSON.stringify({ nombre: "Barberia Fallida", slug: "barberia-fallida" })
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.message).toBe("Error de integridad referencial en PostgreSQL");
  });
});
