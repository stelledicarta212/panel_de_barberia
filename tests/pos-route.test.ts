import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stateEndpoint = "https://dashboard.test/api/dashboard/state";
const posEndpoint = "https://n8n.test/webhook/pos";

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function request(body: JsonRecord, withSession = true): Request {
  return new Request("http://localhost/api/pos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(withSession ? { Cookie: "ba_session=test-session" } : {})
    },
    body: JSON.stringify(body)
  });
}

async function loadHandler() {
  vi.resetModules();
  process.env.DASHBOARD_STATE_ENDPOINT = stateEndpoint;
  process.env.POS_SALE_ENDPOINT = posEndpoint;
  return (await import("../src/app/api/pos/route")).POST;
}

async function responseJson(response: Response) {
  return (await response.json()) as JsonRecord;
}

describe("REAL_NEXTJS_HANDLER POST /api/pos", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retorna 401 sin sesion", async () => {
    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 10 }, false));
    expect(response.status).toBe(401);
    expect(await responseJson(response)).toMatchObject({ ok: false, code: "sesion_requerida" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retorna 400 con barberia_id invalido", async () => {
    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 0 }));
    expect(response.status).toBe(400);
    expect(await responseJson(response)).toMatchObject({ ok: false, code: "barberia_id_requerido" });
  });

  it("retorna 400 con monto negativo", async () => {
    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 10, monto_total: -1 }));
    expect(response.status).toBe(400);
    expect(await responseJson(response)).toMatchObject({ ok: false, code: "monto_negativo" });
  });

  it("retorna 403 para cita ajena", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ reservas: [{ id: 1, estado: "realizada" }] }));
    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 10, cita_id: 999, monto_total: 20000 }));
    expect(response.status).toBe(403);
    expect(await responseJson(response)).toMatchObject({ ok: false, code: "cita_ajena" });
  });

  it("retorna 409 para cita no realizada", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ reservas: [{ id: 2, estado: "confirmada" }] }));
    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 10, cita_id: 2, monto_total: 20000 }));
    expect(response.status).toBe(409);
    expect(await responseJson(response)).toMatchObject({ ok: false, code: "cita_no_realizada" });
  });

  it("retorna 409 para cita ya pagada", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ reservas: [{ id: 3, estado: "pagada", pago_id: 55 }] })
    );
    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 10, cita_id: 3, monto_total: 20000 }));
    expect(response.status).toBe(409);
    expect(await responseJson(response)).toMatchObject({ ok: false, code: "cita_ya_pagada" });
  });

  it("retorna 200 para cita realizada valida", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ reservas: [{ id: 4, estado: "realizada" }] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, pago_id: 101 }));
    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 10, cita_id: 4, monto_total: 20000 }));
    expect(response.status).toBe(200);
    expect(await responseJson(response)).toMatchObject({ ok: true, pago_id: 101 });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      posEndpoint,
      expect.objectContaining({ method: "POST", body: expect.any(String) })
    );
  });

  it("transforma n8n ok false con HTTP 200 en 409", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ reservas: [{ id: 5, estado: "realizada" }] }))
      .mockResolvedValueOnce(jsonResponse({ ok: false, code: "cita_ya_pagada", message: "Duplicado" }));
    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 10, cita_id: 5, monto_total: 20000 }));
    expect(response.status).toBe(409);
    expect(await responseJson(response)).toMatchObject({ ok: false, code: "cita_ya_pagada" });
  });

  it("propaga error HTTP de n8n", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ reservas: [{ id: 6, estado: "realizada" }] }))
      .mockResolvedValueOnce(jsonResponse({ ok: false, code: "upstream_error", message: "No disponible" }, 503));
    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 10, cita_id: 6, monto_total: 20000 }));
    expect(response.status).toBe(503);
    expect(await responseJson(response)).toMatchObject({ ok: false, code: "upstream_error" });
  });
});
