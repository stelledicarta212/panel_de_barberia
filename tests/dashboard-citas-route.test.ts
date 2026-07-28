import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../src/app/api/dashboard/citas/route";
import { NextResponse } from "next/server";

vi.stubEnv("DASHBOARD_CITAS_ENDPOINT", "https://mock-n8n.com/citas-webhook");

describe("POST /api/dashboard/citas proxy route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 if session cookie is missing", async () => {
    const req = new Request("http://localhost/api/dashboard/citas", {
      method: "POST",
      headers: {},
      body: JSON.stringify({ action: "add_cita" })
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.message).toBe("Sesión requerida");
  });

  it("proxies request correctly to upstream webhook when authorized", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ ok: true, data: { cita_id: 179 } })
    });
    vi.stubGlobal("fetch", mockFetch);

    const req = new Request("http://localhost/api/dashboard/citas", {
      method: "POST",
      headers: {
        Cookie: "ba_session=mock-jwt-token"
      },
      body: JSON.stringify({ action: "update_cita", transition_only: true })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith("https://mock-n8n.com/citas-webhook", expect.objectContaining({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "ba_session=mock-jwt-token"
      }
    }));
    
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.cita_id).toBe(179);
  });
});
