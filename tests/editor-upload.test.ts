import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isValidCanonicalStorageUrl,
  OPTIONS,
  POST,
  sanitizeFileName,
  validateImageMagicBytes
} from "../src/app/api/editor/upload/route";

const VALID_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52
]);

const VALID_JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01
]);

const VALID_WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
]);

const VALID_SVG_BYTES = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>'
);

const MALICIOUS_SCRIPT_BYTES = new TextEncoder().encode(
  '<?php echo "evil script"; ?>'
);

const MALICIOUS_SVG_SCRIPT_BYTES = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
);

describe("editor upload helpers", () => {
  it("sanitizes filenames and eliminates path traversal attempts", () => {
    expect(sanitizeFileName("../../etc/passwd.png")).toBe("passwd.png");
    expect(sanitizeFileName("..\\..\\windows\\system32.jpg")).toBe("system32.jpg");
    expect(sanitizeFileName("my logo (1) [final]!.png")).toBe("my_logo__1___final__.png");
    expect(sanitizeFileName("...hidden.png")).toBe("hidden.png");
  });

  it("validates canonical storage URLs and rejects unsafe protocols", () => {
    expect(
      isValidCanonicalStorageUrl(
        "https://pub-369b1ea177db4f8e8b8fb47c8f6c0ef7.r2.dev/logos/file-123.png"
      )
    ).toBe(true);
    expect(isValidCanonicalStorageUrl("https://assets.barberagency.com/logo.webp")).toBe(true);

    // Rejects blob, data, localhost, http
    expect(isValidCanonicalStorageUrl("blob:http://localhost:3000/123-abc")).toBe(false);
    expect(isValidCanonicalStorageUrl("data:image/png;base64,iVBORw0KGgoAAAANS")).toBe(false);
    expect(isValidCanonicalStorageUrl("http://localhost:3000/uploads/logo.png")).toBe(false);
    expect(isValidCanonicalStorageUrl("https://localhost:8000/uploads/logo.png")).toBe(false);
    expect(isValidCanonicalStorageUrl("http://pub.example.com/logo.png")).toBe(false);
    expect(isValidCanonicalStorageUrl("file:///C:/Users/app/logo.png")).toBe(false);
    expect(isValidCanonicalStorageUrl("")).toBe(false);
  });

  it("validates magic bytes for valid images and detects disguised scripts", () => {
    expect(validateImageMagicBytes(VALID_PNG_BYTES.buffer, "image/png")).toBe(true);
    expect(validateImageMagicBytes(VALID_JPEG_BYTES.buffer, "image/jpeg")).toBe(true);
    expect(validateImageMagicBytes(VALID_WEBP_BYTES.buffer, "image/webp")).toBe(true);
    expect(validateImageMagicBytes(VALID_SVG_BYTES.buffer, "image/svg+xml")).toBe(true);

    // Disguised PHP script with png mime
    expect(validateImageMagicBytes(MALICIOUS_SCRIPT_BYTES.buffer, "image/png")).toBe(false);
    // Malicious SVG with script
    expect(validateImageMagicBytes(MALICIOUS_SVG_SCRIPT_BYTES.buffer, "image/svg+xml")).toBe(false);
  });
});

describe("POST /api/editor/upload route handler", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.EDITOR_UPLOAD_ENDPOINT = "https://n8n.test.local/webhook/upload-live";
    process.env.SESSION_ME_ENDPOINT = "https://auth.test.local/session/me";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("handles CORS OPTIONS preflight with 204", async () => {
    const req = new Request("http://localhost/api/editor/upload", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000" }
    });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  it("returns 500 if EDITOR_UPLOAD_ENDPOINT is not configured", async () => {
    delete process.env.EDITOR_UPLOAD_ENDPOINT;

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-123" }
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("editor_upload_endpoint_not_configured");
  });

  it("returns 401 if session cookie ba_session is missing", async () => {
    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST"
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("no_autorizado_anonimo");
  });

  it("returns 400 if barberia_id is missing from payload", async () => {
    const formData = new FormData();
    formData.append("file", new File([VALID_PNG_BYTES], "logo.png", { type: "image/png" }));

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-123" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("barberia_id_requerido");
  });

  it("returns 403 when session user does not own the requested barberia_id (anti-spoofing)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            barberias: [{ id: 198, slug: "barberia-propia" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const formData = new FormData();
    formData.append("barberia_id", "999"); // Spoofed foreign ID
    formData.append("file", new File([VALID_PNG_BYTES], "logo.png", { type: "image/png" }));

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-123" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("barberia_ajena");
  });

  it("returns 400 if file is missing in formData", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            barberias: [{ id: 198, slug: "barberia-propia" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const formData = new FormData();
    formData.append("barberia_id", "198");

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-123" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("archivo_requerido");
  });

  it("returns 415 if file has invalid/disallowed MIME type (e.g. PHP script)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            barberias: [{ id: 198, slug: "barberia-propia" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const formData = new FormData();
    formData.append("barberia_id", "198");
    formData.append(
      "file",
      new File([MALICIOUS_SCRIPT_BYTES], "evil.php", { type: "application/x-php" })
    );

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-123" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(400); // extension_no_permitida rejected first
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("extension_no_permitida");
  });

  it("returns 415 if file has image mime but content fails magic bytes check", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            barberias: [{ id: 198, slug: "barberia-propia" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const formData = new FormData();
    formData.append("barberia_id", "198");
    formData.append(
      "file",
      new File([MALICIOUS_SCRIPT_BYTES], "disguised.png", { type: "image/png" })
    );

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-123" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("contenido_archivo_invalido");
  });

  it("successfully forwards valid upload for authorized tenant and returns canonical URL", async () => {
    let capturedUpstreamCookie = "";
    let capturedUpstreamUrl = "";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            barberias: [{ id: 198, slug: "barberia-propia" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/webhook/upload-live")) {
        capturedUpstreamUrl = url;
        const headers = (init?.headers as Record<string, string>) || {};
        capturedUpstreamCookie = headers.Cookie || headers.cookie || "";
        return new Response(
          JSON.stringify({
            ok: true,
            url: "https://pub-369b1ea177db4f8e8b8fb47c8f6c0ef7.r2.dev/logos/file-1152874.png",
            key: "logos/file-1152874.png"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const formData = new FormData();
    formData.append("barberia_id", "198");
    formData.append("slug", "barberia-propia");
    formData.append("slot", "logo");
    formData.append(
      "file",
      new File([VALID_PNG_BYTES], "mi_logo.png", { type: "image/png" })
    );

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-tenant-198" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.url).toBe(
      "https://pub-369b1ea177db4f8e8b8fb47c8f6c0ef7.r2.dev/logos/file-1152874.png"
    );

    // Verify upstream forwarding details
    expect(capturedUpstreamUrl).toBe("https://n8n.test.local/webhook/upload-live");
    expect(capturedUpstreamCookie).toBe("ba_session=sess-tenant-198");
  });

  it("handles upstream n8n errors gracefully without leaking server secrets", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            barberias: [{ id: 198, slug: "barberia-propia" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/webhook/upload-live")) {
        return new Response(
          JSON.stringify({
            code: "r2_upload_failed",
            message: "Fallo temporal de conexion con bucket R2"
          }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const formData = new FormData();
    formData.append("barberia_id", "198");
    formData.append(
      "file",
      new File([VALID_PNG_BYTES], "logo.png", { type: "image/png" })
    );

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-123" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("r2_upload_failed");
    expect(body.message).toBe("Fallo temporal de conexion con bucket R2");
  });

  it("rejects upstream responses that return unsafe URLs (e.g. localhost, blob, data)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            barberias: [{ id: 198, slug: "barberia-propia" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/webhook/upload-live")) {
        return new Response(
          JSON.stringify({
            ok: true,
            url: "http://localhost:3000/temp-file.png"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const formData = new FormData();
    formData.append("barberia_id", "198");
    formData.append(
      "file",
      new File([VALID_PNG_BYTES], "logo.png", { type: "image/png" })
    );

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-123" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("invalid_storage_url");
  });

  it("handles upstream timeout and returns HTTP 504 upload_upstream_timeout", async () => {
    process.env.EDITOR_UPLOAD_TIMEOUT_MS = "50"; // 50ms fast timeout

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            barberias: [{ id: 198, slug: "barberia-propia" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/webhook/upload-live")) {
        // Simulate a hanging upstream call that aborts on signal
        return new Promise((resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const formData = new FormData();
    formData.append("barberia_id", "198");
    formData.append(
      "file",
      new File([VALID_PNG_BYTES], "logo.png", { type: "image/png" })
    );

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-123" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("upload_upstream_timeout");
    expect(body.message).toContain("tardo demasiado");
  });

  it("resolves tenant from slug when barberia_id is omitted and forwards slot and service_id upstream", async () => {
    let capturedUpstreamFormData: FormData | null = null;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            barberias: [
              { id: 198, slug: "barberia-propia" },
              { id: 250, slug: "otra-barberia" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/webhook/upload-live")) {
        capturedUpstreamFormData = (init?.body as FormData) || null;
        return new Response(
          JSON.stringify({
            ok: true,
            url: "https://pub-369b1ea177db4f8e8b8fb47c8f6c0ef7.r2.dev/services/tenant-198/service-123.jpg"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const formData = new FormData();
    // barberia_id is omitted, only slug and slot are passed
    formData.append("slug", "barberia-propia");
    formData.append("slot", "service");
    formData.append("service_id", "45");
    formData.append(
      "file",
      new File([VALID_JPEG_BYTES], "corte.jpg", { type: "image/jpeg" })
    );

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-123" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.url).toBe("https://pub-369b1ea177db4f8e8b8fb47c8f6c0ef7.r2.dev/services/tenant-198/service-123.jpg");

    expect(capturedUpstreamFormData).not.toBeNull();
    expect(capturedUpstreamFormData!.get("barberia_id")).toBe("198");
    expect(capturedUpstreamFormData!.get("biz_slug")).toBe("barberia-propia");
    expect(capturedUpstreamFormData!.get("slot")).toBe("service");
    expect(capturedUpstreamFormData!.get("service_id")).toBe("45");
  });

  it("successfully allows onboarding draft image upload for authenticated user with no existing barberia", async () => {
    let capturedUpstreamFormData: FormData | null = null;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            user_id: 42,
            barberias: [] // New user undergoing onboarding
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/webhook/upload-live")) {
        capturedUpstreamFormData = (init?.body as FormData) || null;
        return new Response(
          JSON.stringify({
            ok: true,
            url: "https://pub-369b1ea177db4f8e8b8fb47c8f6c0ef7.r2.dev/services/onboarding/draft-service.jpg",
            key: "services/onboarding/draft-service.jpg"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const formData = new FormData();
    formData.append("biz_slug", "barberia-prueba-ui");
    formData.append("context", "onboarding");
    formData.append(
      "file",
      new File([VALID_JPEG_BYTES], "servicio_nuevo.jpg", { type: "image/jpeg" })
    );

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-onboarding-user" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.url).toBe(
      "https://pub-369b1ea177db4f8e8b8fb47c8f6c0ef7.r2.dev/services/onboarding/draft-service.jpg"
    );

    expect(capturedUpstreamFormData).not.toBeNull();
    expect(capturedUpstreamFormData!.get("barberia_id")).toBe("0");
    expect(capturedUpstreamFormData!.get("biz_slug")).toBe("barberia-prueba-ui");
    expect(capturedUpstreamFormData!.get("context")).toBe("onboarding");
    expect(capturedUpstreamFormData!.get("user_id")).toBe("42");
  });

  it("returns 400 slug_mismatch if slug and biz_slug disagree in upload request", async () => {
    const formData = new FormData();
    formData.append("slug", "slug-uno");
    formData.append("biz_slug", "slug-dos");
    formData.append(
      "file",
      new File([VALID_JPEG_BYTES], "servicio.jpg", { type: "image/jpeg" })
    );

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-onboarding-user" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("slug_mismatch");
  });

  it("returns 400 slug_invalido if slug contains path traversal or invalid characters", async () => {
    const formData = new FormData();
    formData.append("slug", "../../../malicious");
    formData.append(
      "file",
      new File([VALID_JPEG_BYTES], "servicio.jpg", { type: "image/jpeg" })
    );

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-onboarding-user" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("slug_invalido");
  });

  it("handles upstream responses wrapped in arrays [{ url: ... }]", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/session/me")) {
        return new Response(JSON.stringify({ ok: true, user_id: 42, barberias: [] }), { status: 200 });
      }
      if (url.includes("/webhook/upload-live")) {
        return new Response(
          JSON.stringify([
            {
              url: "https://pub-369b1ea177db4f8e8b8fb47c8f6c0ef7.r2.dev/services/array-upload.jpg"
            }
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const formData = new FormData();
    formData.append("biz_slug", "barberia-array");
    formData.append("file", new File([VALID_JPEG_BYTES], "servicio.jpg", { type: "image/jpeg" }));

    const req = new Request("http://localhost/api/editor/upload", {
      method: "POST",
      headers: { Cookie: "ba_session=sess-valid" },
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.url).toBe("https://pub-369b1ea177db4f8e8b8fb47c8f6c0ef7.r2.dev/services/array-upload.jpg");
  });
});
