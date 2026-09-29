import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoyaltyService } from "../src/lib/loyalty.service";
import { executeLoyaltyFastPath } from "../src/lib/pos-loyalty";

const postgrestBase = "https://postgrest.test";

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: JsonRecord | unknown[], status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function createJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.mockSignature`;
}

describe("LOYALTY MULTI-TENANT UNIVERSAL PROVISIONING & ISOLATION", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.POSTGREST_BASE_URL = postgrestBase;
    process.env.SESSION_ME_ENDPOINT = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("1. Multi-Tenant Isolation (Tenant A vs Tenant B)", () => {
    const tenantA_Id = 1001;
    const tenantB_Id = 1002;

    const tokenTenantA = createJwt({
      sub: 10,
      barberia_id: tenantA_Id,
      role: "owner",
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    const tokenTenantB = createJwt({
      sub: 20,
      barberia_id: tenantB_Id,
      role: "owner",
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    it("Tenant A query isolates config, clients, ledger, rewards, and redemptions from Tenant B", async () => {
      // Mock parallel PostgREST queries for Tenant A
      vi.mocked(fetch)
        // config
        .mockResolvedValueOnce(
          jsonResponse([{ barberia_id: tenantA_Id, activo: true, program_type: "stamps", sellos_requeridos: 10 }])
        )
        // rewards
        .mockResolvedValueOnce(
          jsonResponse([{ id: 1, barberia_id: tenantA_Id, nombre: "Corte Tenant A", costo_en_sellos: 10, activo: true }])
        )
        // balances
        .mockResolvedValueOnce(
          jsonResponse([{ barberia_id: tenantA_Id, cliente_id: 501, saldo_sellos: 4, total_acumulaciones: 4, total_canjes: 0 }])
        )
        // ledger
        .mockResolvedValueOnce(
          jsonResponse([{ id: 901, barberia_id: tenantA_Id, cliente_id: 501, delta: 1, tipo_movimiento: "acumulacion" }])
        )
        // redemptions
        .mockResolvedValueOnce(
          jsonResponse([])
        )
        // clients mapping
        .mockResolvedValueOnce(
          jsonResponse([{ id: 501, nombre: "Cliente A1", telefono: "3000000001" }])
        );

      const summaryA = await LoyaltyService.getSummary(tenantA_Id, tokenTenantA);

      expect(summaryA.config?.barberia_id).toBe(tenantA_Id);
      expect(summaryA.rewards).toHaveLength(1);
      expect(summaryA.rewards[0].barberia_id).toBe(tenantA_Id);
      expect(summaryA.balances[0].barberia_id).toBe(tenantA_Id);
      expect(summaryA.ledger[0].barberia_id).toBe(tenantA_Id);

      // Verify fetch URLs were strictly scoped to tenantA_Id
      const calls = vi.mocked(fetch).mock.calls;
      for (const [url] of calls) {
        expect(String(url)).toContain(`barberia_id=eq.${tenantA_Id}`);
        expect(String(url)).not.toContain(`barberia_id=eq.${tenantB_Id}`);
      }
    });

    it("Cross-tenant access attempt is strictly rejected by route handler (Tenant A cannot query Tenant B and vice versa)", async () => {
      const { GET } = await import("../src/app/api/loyalty/route");
      // Tenant A token tries to query Tenant B data
      const reqA = new Request(`http://localhost/api/loyalty?barberia_id=${tenantB_Id}`, {
        method: "GET",
        headers: { Cookie: `ba_session=${tokenTenantA}` }
      });
      const resA = await GET(reqA);
      expect(resA.status).toBe(403);
      const dataA = await resA.json();
      expect(dataA.code).toBe("barberia_ajena");

      // Tenant B token tries to query Tenant A data
      const reqB = new Request(`http://localhost/api/loyalty?barberia_id=${tenantA_Id}`, {
        method: "GET",
        headers: { Cookie: `ba_session=${tokenTenantB}` }
      });
      const resB = await GET(reqB);
      expect(resB.status).toBe(403);
      const dataB = await resB.json();
      expect(dataB.code).toBe("barberia_ajena");
    });
  });

  describe("2. Strict Read-Only Semantics for GET /api/loyalty", () => {
    it("getSummary performs ZERO mutations and returns config=null when tenant has no config", async () => {
      const tenantUnconfiguredId = 1003;
      const token = createJwt({
        sub: 30,
        barberia_id: tenantUnconfiguredId,
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      // Mock parallel PostgREST queries returning empty results
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse([])) // config = empty
        .mockResolvedValueOnce(jsonResponse([])) // rewards = empty
        .mockResolvedValueOnce(jsonResponse([])) // balances = empty
        .mockResolvedValueOnce(jsonResponse([])) // ledger = empty
        .mockResolvedValueOnce(jsonResponse([])) // redemptions = empty
        .mockResolvedValueOnce(jsonResponse([])); // clients = empty

      const summary = await LoyaltyService.getSummary(tenantUnconfiguredId, token);

      expect(summary.config).toBeNull();
      expect(summary.rewards).toEqual([]);
      expect(summary.balances).toEqual([]);
      expect(summary.ledger).toEqual([]);

      // Verify that every single fetch call was a GET, NEVER a POST/PUT/PATCH/DELETE
      const calls = vi.mocked(fetch).mock.calls;
      expect(calls.length).toBe(6);
      for (const [, options] of calls) {
        const method = options?.method ? options.method.toUpperCase() : "GET";
        expect(method).toBe("GET");
      }
    });
  });

  describe("3. Idempotent Provisioning via updateConfig", () => {
    it("Provisions new config row via POST when absent, and PATCHes via UPDATE when existing", async () => {
      const tenantId = 1004;
      const token = createJwt({
        sub: 40,
        barberia_id: tenantId,
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      // Case 1: Row does not exist -> checkRes returns [] -> POST new row
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse([])) // checkRes
        .mockResolvedValueOnce(
          jsonResponse([
            {
              barberia_id: tenantId,
              activo: true,
              program_type: "stamps",
              sellos_requeridos: 10,
              recompensa_default: "Corte Gratis"
            }
          ])
        );

      const created = await LoyaltyService.updateConfig(
        tenantId,
        { activo: true, sellos_requeridos: 10, recompensa_default: "Corte Gratis" },
        token
      );

      expect(created.barberia_id).toBe(tenantId);
      expect(created.activo).toBe(true);

      const firstCallMethod = vi.mocked(fetch).mock.calls[1][1]?.method;
      expect(firstCallMethod).toBe("POST");

      // Case 2: Repeated call -> checkRes returns existing row -> PATCH existing
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse([{ barberia_id: tenantId, activo: true }])) // checkRes
        .mockResolvedValueOnce(
          jsonResponse([
            {
              barberia_id: tenantId,
              activo: false,
              program_type: "stamps",
              sellos_requeridos: 12,
              recompensa_default: "Afeitado Gratis"
            }
          ])
        );

      const updated = await LoyaltyService.updateConfig(
        tenantId,
        { activo: false, sellos_requeridos: 12 },
        token
      );

      expect(updated.barberia_id).toBe(tenantId);
      expect(updated.activo).toBe(false);

      const secondCallMethod = vi.mocked(fetch).mock.calls[3][1]?.method;
      expect(secondCallMethod).toBe("PATCH");
    });
  });

  describe("4. Generic Multi-Tenant POS Accrual", () => {
    it("POS accrual for Tenant A executes RPC with Tenant A payment and credits Tenant A", async () => {
      const pagoA = 701;
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({
          success: true,
          status: "credited",
          ledger_id: 301,
          barberia_id: 1001,
          pago_id: pagoA
        })
      );

      const resultA = await executeLoyaltyFastPath(pagoA, {
        barberiaId: 1001,
        baSession: "mock.jwt.session"
      });

      expect(resultA.status).toBe("credited");
      expect(resultA.ledger_id).toBe(301);
      expect(resultA.barberia_id).toBe(1001);

      const rpcCall = vi.mocked(fetch).mock.calls[0];
      expect(rpcCall[0]).toBe(`${postgrestBase}/rpc/ba_loyalty_acumular_pago`);
      expect(JSON.parse(String(rpcCall[1]?.body))).toEqual({ p_pago_id: pagoA });
    });

    it("POS accrual for Tenant B executes independently and credits Tenant B", async () => {
      const pagoB = 702;
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({
          success: true,
          status: "credited",
          ledger_id: 302,
          barberia_id: 1002,
          pago_id: pagoB
        })
      );

      const resultB = await executeLoyaltyFastPath(pagoB, {
        barberiaId: 1002,
        baSession: "mock.jwt.session"
      });

      expect(resultB.status).toBe("credited");
      expect(resultB.ledger_id).toBe(302);
      expect(resultB.barberia_id).toBe(1002);

      const rpcCall = vi.mocked(fetch).mock.calls[0];
      expect(rpcCall[0]).toBe(`${postgrestBase}/rpc/ba_loyalty_acumular_pago`);
      expect(JSON.parse(String(rpcCall[1]?.body))).toEqual({ p_pago_id: pagoB });
    });
  });
});
