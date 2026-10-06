import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  GET,
  resolveSafeRedirectOrigin,
  isSafeOrigin,
  isTrustedHost,
  getCanonicalOrigin
} from "../src/app/q/[qr_code]/route";
import * as publicRpc from "../src/lib/public-rpc";

describe("QR Redirect Security & Multi-Tenant Isolation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  // 1. Valid QR redirect
  it("1. valid QR redirect returns 302 pointing to public production origin", async () => {
    vi.spyOn(publicRpc, "resolveQrCode").mockResolvedValue({
      ok: true,
      barberia_id: 198,
      slug: "barberia-prueba-4",
      redirect_path: "/b/barberia-prueba-4"
    });

    const req = new Request("http://localhost:3000/q/QR04851428");
    const res = await GET(req, { params: Promise.resolve({ qr_code: "QR04851428" }) });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://barberagency-barberagency.gymh5g.easypanel.host/b/barberia-prueba-4"
    );
  });

  // 2. Localhost internal request origin is purged
  it("2. localhost internal request origin does not appear in redirect location", async () => {
    vi.spyOn(publicRpc, "resolveQrCode").mockResolvedValue({
      ok: true,
      slug: "barberia-61",
      redirect_path: "/b/barberia-61"
    });

    const req = new Request("http://localhost:3000/q/QR6D4BAD60", {
      headers: { host: "localhost:3000" }
    });
    const res = await GET(req, { params: Promise.resolve({ qr_code: "QR6D4BAD60" }) });

    const location = res.headers.get("location") || "";
    expect(location).not.toContain("localhost");
    expect(location).not.toContain(":3000");
    expect(location).toBe(
      "https://barberagency-barberagency.gymh5g.easypanel.host/b/barberia-61"
    );
  });

  // 3. Arbitrary Host header poisoning is ignored
  it("3. arbitrary Host header does not hijack redirect origin", async () => {
    vi.spyOn(publicRpc, "resolveQrCode").mockResolvedValue({
      ok: true,
      slug: "barberia-prueba-4",
      redirect_path: "/b/barberia-prueba-4"
    });

    const req = new Request("http://attacker.evil.com/q/QR04851428", {
      headers: { host: "attacker.evil.com" }
    });
    const res = await GET(req, { params: Promise.resolve({ qr_code: "QR04851428" }) });

    const location = res.headers.get("location") || "";
    expect(location).not.toContain("attacker.evil.com");
    expect(location).toBe(
      "https://barberagency-barberagency.gymh5g.easypanel.host/b/barberia-prueba-4"
    );
  });

  // 4. X-Forwarded-Host poisoning is rejected
  it("4. X-Forwarded-Host poisoning is rejected in favor of canonical origin", async () => {
    vi.spyOn(publicRpc, "resolveQrCode").mockResolvedValue({
      ok: true,
      slug: "barberia-prueba-4",
      redirect_path: "/b/barberia-prueba-4"
    });

    const req = new Request("https://barberagency-barberagency.gymh5g.easypanel.host/q/QR04851428", {
      headers: {
        "x-forwarded-host": "malicious-phishing.site",
        "x-forwarded-proto": "https"
      }
    });
    const res = await GET(req, { params: Promise.resolve({ qr_code: "QR04851428" }) });

    const location = res.headers.get("location") || "";
    expect(location).not.toContain("malicious-phishing.site");
    expect(location).toBe(
      "https://barberagency-barberagency.gymh5g.easypanel.host/b/barberia-prueba-4"
    );
  });

  // 5. localhost strictly rejected by isSafeOrigin / isTrustedHost
  it("5. localhost is strictly rejected by isSafeOrigin and isTrustedHost", () => {
    expect(isSafeOrigin("http://localhost:3000")).toBe(false);
    expect(isSafeOrigin("https://localhost")).toBe(false);
    expect(isTrustedHost("localhost:3000")).toBe(false);
    expect(isTrustedHost("localhost")).toBe(false);
  });

  // 6. 127.0.0.1 strictly rejected by isSafeOrigin / isTrustedHost
  it("6. 127.0.0.1 is strictly rejected by isSafeOrigin and isTrustedHost", () => {
    expect(isSafeOrigin("http://127.0.0.1:3000")).toBe(false);
    expect(isSafeOrigin("http://127.0.0.1")).toBe(false);
    expect(isTrustedHost("127.0.0.1:3000")).toBe(false);
    expect(isTrustedHost("127.0.0.1")).toBe(false);
  });

  // 7. port :3000 strictly rejected in origins
  it("7. port :3000 is rejected in origin strings", () => {
    expect(isSafeOrigin("http://internal-app:3000")).toBe(false);
    expect(isTrustedHost("internal-app:3000")).toBe(false);
  });

  // 8. correct public BarberAgency origin resolution
  it("8. resolves to correct public BarberAgency origin", () => {
    const canonical = getCanonicalOrigin();
    expect(canonical).toBe("https://barberagency-barberagency.gymh5g.easypanel.host");

    const reqTrusted = new Request("https://barberagency.com/q/QR123", {
      headers: { host: "barberagency.com" }
    });
    expect(resolveSafeRedirectOrigin(reqTrusted)).toBe("https://barberagency.com");
  });

  // 9. correct slug preservation (including fragments and paths)
  it("9. preserves exact redirect_path and fragment", async () => {
    vi.spyOn(publicRpc, "resolveQrCode").mockResolvedValue({
      ok: true,
      slug: "barberia-prueba-4",
      redirect_path: "/b/barberia-prueba-4#reservas"
    });

    const req = new Request("http://localhost:3000/q/QR04851428");
    const res = await GET(req, { params: Promise.resolve({ qr_code: "QR04851428" }) });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://barberagency-barberagency.gymh5g.easypanel.host/b/barberia-prueba-4#reservas"
    );
  });

  // 10. multi-tenant separation: each tenant resolves independently
  it("10. multi-tenant separation preserves tenant-specific slugs", async () => {
    const spy = vi.spyOn(publicRpc, "resolveQrCode");

    // Tenant A
    spy.mockResolvedValueOnce({
      ok: true,
      slug: "tenant-alpha",
      redirect_path: "/b/tenant-alpha"
    });
    const reqA = new Request("http://localhost:3000/q/QRA");
    const resA = await GET(reqA, { params: Promise.resolve({ qr_code: "QRA" }) });
    expect(resA.headers.get("location")).toBe(
      "https://barberagency-barberagency.gymh5g.easypanel.host/b/tenant-alpha"
    );

    // Tenant B
    spy.mockResolvedValueOnce({
      ok: true,
      slug: "tenant-beta",
      redirect_path: "/b/tenant-beta"
    });
    const reqB = new Request("http://localhost:3000/q/QRB");
    const resB = await GET(reqB, { params: Promise.resolve({ qr_code: "QRB" }) });
    expect(resB.headers.get("location")).toBe(
      "https://barberagency-barberagency.gymh5g.easypanel.host/b/tenant-beta"
    );
  });

  // 11. invalid/not-found QR behavior unchanged (404)
  it("11. not-found or empty QR code returns 404 unchanged", async () => {
    vi.spyOn(publicRpc, "resolveQrCode").mockResolvedValue({
      ok: false,
      error: "qr_no_encontrado"
    });

    const req1 = new Request("http://localhost:3000/q/NONEXISTENT");
    const res1 = await GET(req1, { params: Promise.resolve({ qr_code: "NONEXISTENT" }) });
    expect(res1.status).toBe(404);

    const req2 = new Request("http://localhost:3000/q/");
    const res2 = await GET(req2, { params: Promise.resolve({ qr_code: "" }) });
    expect(res2.status).toBe(404);
  });
});
