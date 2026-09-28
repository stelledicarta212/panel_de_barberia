import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stateEndpoint = "https://dashboard.test/api/dashboard/state";
const posEndpoint = "https://n8n.test/webhook/pos";
const postgrestBase = "https://postgrest.test";

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
      ...(withSession ? { Cookie: "ba_session=test-session.payload.sig" } : {})
    },
    body: JSON.stringify(body)
  });
}

async function loadHandler() {
  vi.resetModules();
  process.env.DASHBOARD_STATE_ENDPOINT = stateEndpoint;
  process.env.POS_SALE_ENDPOINT = posEndpoint;
  process.env.POSTGREST_BASE_URL = postgrestBase;
  return (await import("../src/app/api/pos/route")).POST;
}

async function responseJson(response: Response) {
  return (await response.json()) as JsonRecord;
}

describe("POS + LOYALTY FAST-PATH INTEGRATION", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("1. Pago POS exitoso ejecuta fast-path y acredita sello (+1)", async () => {
    vi.mocked(fetch)
      // 1. Estado de dashboard / validación de cita
      .mockResolvedValueOnce(jsonResponse({ reservas: [{ id: 10, estado: "realizada" }] }))
      // 2. Operación canónica de cobro POS
      .mockResolvedValueOnce(jsonResponse({ ok: true, pago_id: 501, cita_id: 10, total: 25000 }))
      // 3. Fast-path de fidelización PostgREST
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          status: "credited",
          ledger_id: 99,
          pago_id: 501,
          cliente_id: 42
        })
      );

    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 1, cita_id: 10, monto_total: 25000 }));

    expect(response.status).toBe(200);
    const body = await responseJson(response);
    expect(body.ok).toBe(true);
    expect(body.pago_id).toBe(501);
    expect(body.loyalty).toMatchObject({
      status: "credited",
      ledger_id: 99,
      pago_id: 501
    });

    // Verificar que fast-path llamó al endpoint correcto con p_pago_id
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      `${postgrestBase}/rpc/ba_loyalty_acumular_pago`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ p_pago_id: 501 })
      })
    );
  });

  it("2. Fast-path detecta idempotencia cuando el pago ya fue acreditado", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ reservas: [{ id: 11, estado: "realizada" }] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, pago_id: 502, cita_id: 11 }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          status: "already_credited",
          ledger_id: 88,
          pago_id: 502
        })
      );

    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 1, cita_id: 11, monto_total: 20000 }));

    expect(response.status).toBe(200);
    const body = await responseJson(response);
    expect(body.ok).toBe(true);
    expect(body.pago_id).toBe(502);
    expect(body.loyalty).toMatchObject({
      status: "already_credited",
      ledger_id: 88
    });
  });

  it("3. INVARIANTE CRÍTICO: Falla total de Loyalty NO anula el pago POS", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ reservas: [{ id: 12, estado: "realizada" }] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, pago_id: 503, cita_id: 12 }))
      // Fast-path falla con HTTP 500 en PostgREST
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }));

    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 1, cita_id: 12, monto_total: 30000 }));

    // El cobro POS sigue siendo exitoso con HTTP 200
    expect(response.status).toBe(200);
    const body = await responseJson(response);
    expect(body.ok).toBe(true);
    expect(body.pago_id).toBe(503);
    // Loyalty reporta falla aislada sin interrumpir al usuario
    expect(body.loyalty).toMatchObject({
      status: "failed",
      code: "http_500"
    });
  });

  it("4. Excepción de red en Loyalty fast-path es capturada sin lanzar error", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ reservas: [{ id: 13, estado: "realizada" }] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, pago_id: 504, cita_id: 13 }))
      // Excepción simulada de red
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 1, cita_id: 13, monto_total: 20000 }));

    expect(response.status).toBe(200);
    const body = await responseJson(response);
    expect(body.ok).toBe(true);
    expect(body.pago_id).toBe(504);
    expect(body.loyalty).toMatchObject({
      status: "failed",
      code: "network_error"
    });
  });

  it("5. Si el pago POS falla, el fast-path NUNCA se invoca", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ reservas: [{ id: 14, estado: "realizada" }] }))
      // El POS upstream rechaza la venta
      .mockResolvedValueOnce(jsonResponse({ ok: false, code: "error_cobro", message: "Tarjeta rechazada" }, 409));

    const POST = await loadHandler();
    const response = await POST(request({ barberia_id: 1, cita_id: 14, monto_total: 20000 }));

    expect(response.status).toBe(409);
    const body = await responseJson(response);
    expect(body.ok).toBe(false);
    // Solo se hicieron 2 llamadas fetch (estado y cobro POS); fast-path nunca se llamó
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("INTERNAL RECONCILIATION ROUTE", () => {
  const internalSecret = "test_internal_token_secret_xyz";

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.LOYALTY_INTERNAL_TOKEN = internalSecret;
    process.env.POSTGREST_BASE_URL = postgrestBase;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function loadReconcileHandler() {
    vi.resetModules();
    process.env.LOYALTY_INTERNAL_TOKEN = internalSecret;
    process.env.POSTGREST_BASE_URL = postgrestBase;
    return (await import("../src/app/api/internal/loyalty/reconcile/route")).POST;
  }

  it("1. Rechaza petición sin cabecera de autorización (401)", async () => {
    const POST = await loadReconcileHandler();
    const req = new Request("http://localhost/api/internal/loyalty/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barberia_id: 1 })
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("2. Rechaza petición con token interno incorrecto (401)", async () => {
    const POST = await loadReconcileHandler();
    const req = new Request("http://localhost/api/internal/loyalty/reconcile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid_secret_token"
      },
      body: JSON.stringify({ barberia_id: 1 })
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("3. Ejecuta reconciliación con token interno válido (200)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        success: true,
        status: "reconciliation_completed",
        barberia_id: 1,
        processed: 2,
        credited: 2,
        already_credited: 0,
        skipped: 0
      })
    );

    const POST = await loadReconcileHandler();
    const req = new Request("http://localhost/api/internal/loyalty/reconcile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalSecret}`
      },
      body: JSON.stringify({ barberia_id: 1, limit: 25 })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonRecord;
    expect(body.ok).toBe(true);
    expect(body.result).toMatchObject({
      success: true,
      status: "reconciliation_completed",
      credited: 2
    });
  });
});
