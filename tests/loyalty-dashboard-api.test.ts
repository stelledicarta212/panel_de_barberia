import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("LOYALTY DASHBOARD API HANDLERS", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.POSTGREST_BASE_URL = postgrestBase;
    process.env.SESSION_ME_ENDPOINT = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("1. GET /api/loyalty (Summary)", () => {
    it("Retorna 401 para peticiones anónimas sin ba_session", async () => {
      const { GET } = await import("../src/app/api/loyalty/route");
      const req = new Request("http://localhost/api/loyalty", { method: "GET" });
      const res = await GET(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("no_autorizado_anonimo");
    });

    it("Retorna 403 cuando el rol no tiene permisos de visualización (barbero)", async () => {
      const { GET } = await import("../src/app/api/loyalty/route");
      const barberoToken = createJwt({
        sub: 10,
        barberia_id: 1,
        role: "barbero",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const req = new Request("http://localhost/api/loyalty", {
        method: "GET",
        headers: { Cookie: `ba_session=${barberoToken}` }
      });
      const res = await GET(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("rol_no_autorizado");
    });

    it("Retorna 403 si intenta acceder a otra barbería (cross-tenant)", async () => {
      const { GET } = await import("../src/app/api/loyalty/route");
      const tenantAToken = createJwt({
        sub: 10,
        barberia_id: 1,
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const req = new Request("http://localhost/api/loyalty?barberia_id=2", {
        method: "GET",
        headers: { Cookie: `ba_session=${tenantAToken}` }
      });
      const res = await GET(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("barberia_ajena");
    });

    it("Retorna 200 con config, rewards, balances y ledger canónicos", async () => {
      const { GET } = await import("../src/app/api/loyalty/route");
      const ownerToken = createJwt({
        sub: 1,
        barberia_id: 100,
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      // Mock parallel PostgREST queries: config, rewards, balances, ledger, redemptions, clients
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse([
            {
              barberia_id: 100,
              activo: true,
              program_type: "stamps",
              sellos_requeridos: 8,
              recompensa_default: "Corte Gratis",
              accrual_start_at: "2026-09-01T00:00:00Z",
              created_at: "2026-09-01T00:00:00Z",
              updated_at: "2026-09-01T00:00:00Z"
            }
          ])
        )
        .mockResolvedValueOnce(
          jsonResponse([
            {
              id: 1,
              barberia_id: 100,
              nombre: "Corte gratis",
              costo_en_sellos: 8,
              activo: true
            }
          ])
        )
        .mockResolvedValueOnce(
          jsonResponse([
            {
              barberia_id: 100,
              cliente_id: 55,
              saldo_sellos: 5,
              total_acumulaciones: 5,
              total_canjes: 0,
              ultimo_movimiento_at: "2026-09-28T12:00:00Z"
            }
          ])
        )
        .mockResolvedValueOnce(
          jsonResponse([
            {
              id: 10,
              barberia_id: 100,
              cliente_id: 55,
              delta: 1,
              tipo_movimiento: "acumulacion",
              created_at: "2026-09-28T12:00:00Z"
            }
          ])
        )
        .mockResolvedValueOnce(jsonResponse([]))
        .mockResolvedValueOnce(
          jsonResponse([
            {
              id: 55,
              nombre: "Carlos Gómez",
              telefono: "3001234567"
            }
          ])
        );

      const req = new Request("http://localhost/api/loyalty", {
        method: "GET",
        headers: { Cookie: `ba_session=${ownerToken}` }
      });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.config.sellos_requeridos).toBe(8);
      expect(data.config.activo).toBe(true);
      expect(data.rewards).toHaveLength(1);
      expect(data.balances[0].cliente_nombre).toBe("Carlos Gómez");
      expect(data.balances[0].saldo_sellos).toBe(5);
      expect(data.total_sellos_emitidos).toBe(5);
    });
  });

  describe("2. PATCH /api/loyalty/config", () => {
    it("Rechaza modificación si el usuario es cajero (solo owner/admin)", async () => {
      const { PATCH } = await import("../src/app/api/loyalty/route");
      const cajeroToken = createJwt({
        sub: 5,
        barberia_id: 100,
        role: "cajero",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const req = new Request("http://localhost/api/loyalty", {
        method: "PATCH",
        headers: { Cookie: `ba_session=${cajeroToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sellos_requeridos: 12 })
      });
      const res = await PATCH(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("rol_no_autorizado");
    });

    it("Rechaza manipulación de accrual_start_at o campos de seguridad", async () => {
      const { PATCH } = await import("../src/app/api/loyalty/route");
      const ownerToken = createJwt({
        sub: 1,
        barberia_id: 100,
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const req = new Request("http://localhost/api/loyalty", {
        method: "PATCH",
        headers: { Cookie: `ba_session=${ownerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          sellos_requeridos: 10,
          accrual_start_at: "1970-01-01T00:00:00Z"
        })
      });
      const res = await PATCH(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("campo_restringido");
    });

    it("Actualiza sellos_requeridos y recompensa_default exitosamente", async () => {
      const { PATCH } = await import("../src/app/api/loyalty/route");
      const ownerToken = createJwt({
        sub: 1,
        barberia_id: 100,
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      // 1. check exists -> true
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse([{ barberia_id: 100 }]))
        // 2. PATCH -> representation
        .mockResolvedValueOnce(
          jsonResponse([
            {
              barberia_id: 100,
              activo: true,
              sellos_requeridos: 10,
              recompensa_default: "Barba Gratis",
              accrual_start_at: "2026-09-01T00:00:00Z"
            }
          ])
        );

      const req = new Request("http://localhost/api/loyalty", {
        method: "PATCH",
        headers: { Cookie: `ba_session=${ownerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sellos_requeridos: 10, recompensa_default: "Barba Gratis" })
      });
      const res = await PATCH(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.config.sellos_requeridos).toBe(10);
      expect(data.config.recompensa_default).toBe("Barba Gratis");
    });
  });

  describe("3. POST & PATCH /api/loyalty/rewards", () => {
    it("POST /api/loyalty/rewards valida nombre y costo > 0", async () => {
      const { POST } = await import("../src/app/api/loyalty/rewards/route");
      const ownerToken = createJwt({
        sub: 1,
        barberia_id: 100,
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const req = new Request("http://localhost/api/loyalty/rewards", {
        method: "POST",
        headers: { Cookie: `ba_session=${ownerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: "", costo_en_sellos: -5 })
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("nombre_requerido");
    });

    it("POST /api/loyalty/rewards crea la recompensa correctamente", async () => {
      const { POST } = await import("../src/app/api/loyalty/rewards/route");
      const ownerToken = createJwt({
        sub: 1,
        barberia_id: 100,
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse([
          {
            id: 25,
            barberia_id: 100,
            nombre: "Lavado Premium",
            costo_en_sellos: 5,
            activo: true
          }
        ])
      );

      const req = new Request("http://localhost/api/loyalty/rewards", {
        method: "POST",
        headers: { Cookie: `ba_session=${ownerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: "Lavado Premium", costo_en_sellos: 5 })
      });
      const res = await POST(req);

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.reward.id).toBe(25);
      expect(data.reward.nombre).toBe("Lavado Premium");
    });

    it("PATCH /api/loyalty/rewards/[id] permite desactivar recompensa preservando historial", async () => {
      const { PATCH } = await import("../src/app/api/loyalty/rewards/[id]/route");
      const ownerToken = createJwt({
        sub: 1,
        barberia_id: 100,
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse([
          {
            id: 25,
            barberia_id: 100,
            nombre: "Lavado Premium",
            costo_en_sellos: 5,
            activo: false
          }
        ])
      );

      const req = new Request("http://localhost/api/loyalty/rewards/25", {
        method: "PATCH",
        headers: { Cookie: `ba_session=${ownerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ activo: false })
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: "25" }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.reward.activo).toBe(false);
    });
  });

  describe("4. POST /api/loyalty/redeem", () => {
    it("Permite a cajero ejecutar canje con saldo suficiente", async () => {
      const { POST } = await import("../src/app/api/loyalty/redeem/route");
      const cajeroToken = createJwt({
        sub: 7,
        barberia_id: 100,
        role: "cajero",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({
          success: true,
          status: "redeemed",
          redemption_id: 901,
          ledger_id: 902,
          cliente_id: 42,
          barberia_id: 100,
          reward_nombre: "Corte Gratis",
          costo_sellos: 8,
          saldo_restante: 2,
          message: "Canje completado exitosamente"
        })
      );

      const req = new Request("http://localhost/api/loyalty/redeem", {
        method: "POST",
        headers: { Cookie: `ba_session=${cajeroToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: 42, reward_id: 1 })
      });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.status).toBe("redeemed");
      expect(data.saldo_restante).toBe(2);
    });

    it("Retorna 422 cuando la RPC rechaza por saldo insuficiente", async () => {
      const { POST } = await import("../src/app/api/loyalty/redeem/route");
      const cajeroToken = createJwt({
        sub: 7,
        barberia_id: 100,
        role: "cajero",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({
          success: false,
          status: "insufficient_balance",
          saldo_actual: 3,
          costo_requerido: 8,
          message: "Saldo insuficiente para canjear la recompensa"
        })
      );

      const req = new Request("http://localhost/api/loyalty/redeem", {
        method: "POST",
        headers: { Cookie: `ba_session=${cajeroToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: 42, reward_id: 1 })
      });
      const res = await POST(req);

      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.status).toBe("insufficient_balance");
      expect(data.saldo_actual).toBe(3);
      expect(data.costo_requerido).toBe(8);
    });
  });
});
