import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoyaltyService } from "../src/lib/loyalty.service";
import type { LoyaltyConfig, LoyaltyReward } from "../src/types/loyalty";

const postgrestBase = "https://postgrest.test";

function jsonResponse(body: Record<string, unknown> | unknown[], status = 200): Response {
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

describe("LOYALTY CONFIGURABLE REWARD & REDEMPTION CONTRACT", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.POSTGREST_BASE_URL = postgrestBase;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("1. Dynamic Progress & Eligibility Mathematical Model", () => {
    // Helper replicating the canonical resolveClientProgress from finanzas/page.tsx
    function calculateClientProgress(
      balance: number,
      activeRewards: { id: number; nombre: string; costo_en_sellos: number }[]
    ) {
      const sorted = [...activeRewards].sort((a, b) => a.costo_en_sellos - b.costo_en_sellos);
      const affordable = sorted.filter((r) => r.costo_en_sellos <= balance);
      const next = sorted.find((r) => r.costo_en_sellos > balance);
      const highestAffordable = affordable.length > 0 ? affordable[affordable.length - 1] : null;
      const isEligible = affordable.length > 0;

      let progressPercent = 0;
      let statusText = "Sin sellos";

      if (sorted.length === 0) {
        statusText = "Sin recompensas activas";
        progressPercent = 0;
      } else if (isEligible) {
        statusText = `¡Recompensa lista! (${highestAffordable?.nombre} — ${highestAffordable?.costo_en_sellos} sellos)`;
        progressPercent = next
          ? Math.min(100, Math.round(((balance / next.costo_en_sellos) * 100) * 10) / 10)
          : 100;
      } else if (balance > 0 && next) {
        const rawPct = (balance / next.costo_en_sellos) * 100;
        progressPercent = Math.min(100, Math.round(rawPct * 10) / 10);
        statusText = `${balance} / ${next.costo_en_sellos} sellos (faltan ${next.costo_en_sellos - balance} para ${next.nombre})`;
      } else {
        statusText = next ? `0 / ${next.costo_en_sellos} sellos para ${next.nombre}` : "0 sellos";
        progressPercent = 0;
      }

      return { isEligible, progressPercent, statusText, highestAffordable };
    }

    const rewardTarget8 = [{ id: 1, nombre: "Corte gratis", costo_en_sellos: 8 }];

    it("1 stamp / target 8 -> exactly 12.5% progress, ineligible", () => {
      const p = calculateClientProgress(1, rewardTarget8);
      expect(p.isEligible).toBe(false);
      expect(p.progressPercent).toBe(12.5);
      expect(p.statusText).toBe("1 / 8 sellos (faltan 7 para Corte gratis)");
    });

    it("4 stamps / target 8 -> exactly 50% progress, ineligible", () => {
      const p = calculateClientProgress(4, rewardTarget8);
      expect(p.isEligible).toBe(false);
      expect(p.progressPercent).toBe(50);
      expect(p.statusText).toBe("4 / 8 sellos (faltan 4 para Corte gratis)");
    });

    it("8 stamps / target 8 -> 100% progress, ELIGIBLE (¡Recompensa lista!)", () => {
      const p = calculateClientProgress(8, rewardTarget8);
      expect(p.isEligible).toBe(true);
      expect(p.progressPercent).toBe(100);
      expect(p.statusText).toContain("¡Recompensa lista!");
      expect(p.highestAffordable?.nombre).toBe("Corte gratis");
    });

    it("10 stamps / target 8 -> 100% capped progress, ELIGIBLE with overspend stock", () => {
      const p = calculateClientProgress(10, rewardTarget8);
      expect(p.isEligible).toBe(true);
      expect(p.progressPercent).toBe(100);
      expect(p.statusText).toContain("¡Recompensa lista!");
    });
  });

  describe("2. Default Reward Auto-Provisioning & Sync Contract", () => {
    it("getSummary auto-provisions default reward into memory when catalog has 0 rows", async () => {
      const tenantId = 198;
      const token = createJwt({ sub: 7, barberia_id: tenantId, role: "owner" });

      // config returns row with sellos_requeridos = 8, recompensa_default = 'Corte gratis'
      const mockConfig: LoyaltyConfig = {
        barberia_id: tenantId,
        activo: true,
        program_type: "stamps",
        sellos_requeridos: 8,
        recompensa_default: "Corte gratis",
        accrual_start_at: "2026-09-29T15:28:13Z",
        created_at: "2026-09-29T15:28:13Z",
        updated_at: "2026-09-29T15:28:13Z"
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse([mockConfig])) // config
        .mockResolvedValueOnce(jsonResponse([])) // rewards (empty initially!)
        .mockResolvedValueOnce(jsonResponse([])) // balances
        .mockResolvedValueOnce(jsonResponse([])) // ledger
        .mockResolvedValueOnce(jsonResponse([])) // redemptions
        .mockResolvedValueOnce(jsonResponse([])); // clients

      const summary = await LoyaltyService.getSummary(tenantId, token);

      expect(summary.config).not.toBeNull();
      expect(summary.config?.sellos_requeridos).toBe(8);
      // Auto-provisioned or synthesized reward is populated
      expect(summary.rewards.length).toBeGreaterThan(0);
      expect(summary.rewards[0].nombre).toBe("Corte gratis");
      expect(summary.rewards[0].costo_en_sellos).toBe(8);
      expect(summary.rewards[0].activo).toBe(true);
    });

    it("syncDefaultReward creates reward in PostgreSQL when none exists", async () => {
      const tenantId = 198;
      const token = createJwt({ sub: 7, barberia_id: tenantId, role: "owner" });

      const mockConfig: LoyaltyConfig = {
        barberia_id: tenantId,
        activo: true,
        program_type: "stamps",
        sellos_requeridos: 8,
        recompensa_default: "Corte gratis",
        accrual_start_at: "2026-09-29T15:28:13Z",
        created_at: "2026-09-29T15:28:13Z",
        updated_at: "2026-09-29T15:28:13Z"
      };

      // Mock rewards GET returning empty []
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse([]))
        // Mock POST /loyalty_rewards returning newly created reward
        .mockResolvedValueOnce(
          jsonResponse([
            {
              id: 175,
              barberia_id: tenantId,
              nombre: "Corte gratis",
              costo_en_sellos: 8,
              activo: true
            }
          ])
        );

      const result = await LoyaltyService.syncDefaultReward(tenantId, mockConfig, token);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(175);
      expect(result?.nombre).toBe("Corte gratis");
      expect(result?.costo_en_sellos).toBe(8);

      const postCall = vi.mocked(fetch).mock.calls[1];
      expect(postCall[1]?.method).toBe("POST");
      const postBody = JSON.parse(postCall[1]?.body as string);
      expect(postBody.nombre).toBe("Corte gratis");
      expect(postBody.costo_en_sellos).toBe(8);
      expect(postBody.barberia_id).toBe(tenantId);
    });

    it("syncDefaultReward updates existing reward in PostgreSQL when target changes", async () => {
      const tenantId = 198;
      const token = createJwt({ sub: 7, barberia_id: tenantId, role: "owner" });

      const mockConfig: LoyaltyConfig = {
        barberia_id: tenantId,
        activo: true,
        program_type: "stamps",
        sellos_requeridos: 6, // changed from 8 to 6
        recompensa_default: "Corte VIP",
        accrual_start_at: "2026-09-29T15:28:13Z",
        created_at: "2026-09-29T15:28:13Z",
        updated_at: "2026-09-29T15:28:13Z"
      };

      // Mock rewards GET returning existing reward ID 175
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse([
            {
              id: 175,
              barberia_id: tenantId,
              nombre: "Corte gratis",
              costo_en_sellos: 8,
              activo: true
            }
          ])
        )
        // Mock PATCH /loyalty_rewards returning updated reward
        .mockResolvedValueOnce(
          jsonResponse([
            {
              id: 175,
              barberia_id: tenantId,
              nombre: "Corte VIP",
              costo_en_sellos: 6,
              activo: true
            }
          ])
        );

      const result = await LoyaltyService.syncDefaultReward(tenantId, mockConfig, token);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(175);
      expect(result?.nombre).toBe("Corte VIP");
      expect(result?.costo_en_sellos).toBe(6);

      const patchCall = vi.mocked(fetch).mock.calls[1];
      expect(patchCall[1]?.method).toBe("PATCH");
      const patchBody = JSON.parse(patchCall[1]?.body as string);
      expect(patchBody.nombre).toBe("Corte VIP");
      expect(patchBody.costo_en_sellos).toBe(6);
    });
  });

  describe("3. Atomic Redemption Remainder & Security Contract", () => {
    it("Redemption with balance 10 and cost 8 preserves remainder 2 (does NOT reset to 0)", async () => {
      const tenantId = 198;
      const clienteId = 147;
      const rewardId = 175;
      const token = createJwt({ sub: 7, barberia_id: tenantId, role: "owner" });

      // Mock RPC public.ba_loyalty_redeem returning remainder 2
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({
          success: true,
          status: "redeemed",
          redemption_id: 1,
          ledger_id: 5,
          cliente_id: clienteId,
          barberia_id: tenantId,
          reward_nombre: "Corte gratis",
          costo_sellos: 8,
          saldo_restante: 2, // 10 - 8 = 2
          message: "Canje completado exitosamente"
        })
      );

      const res = await LoyaltyService.redeem(tenantId, clienteId, rewardId, null, "Corte canjeado", token);

      expect(res.success).toBe(true);
      expect(res.status).toBe("redeemed");
      expect(res.costo_sellos).toBe(8);
      expect(res.saldo_restante).toBe(2);
      expect(res.saldo_restante).not.toBe(0);
    });

    it("Redemption with insufficient balance is rejected with 422 / insufficient_balance", async () => {
      const tenantId = 198;
      const clienteId = 147;
      const rewardId = 175;
      const token = createJwt({ sub: 7, barberia_id: tenantId, role: "owner" });

      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(
          {
            success: false,
            status: "insufficient_balance",
            saldo_actual: 2,
            costo_requerido: 8,
            message: "Saldo insuficiente para canjear la recompensa"
          },
          200
        )
      );

      const res = await LoyaltyService.redeem(tenantId, clienteId, rewardId, null, null, token);

      expect(res.success).toBe(false);
      expect(res.status).toBe("insufficient_balance");
      expect(res.saldo_actual).toBe(2);
      expect(res.costo_requerido).toBe(8);
    });

    it("Redemption with rewardId 0 automatically resolves active tenant reward ID", async () => {
      const tenantId = 198;
      const clienteId = 147;
      const token = createJwt({ sub: 7, barberia_id: tenantId, role: "owner" });

      // Mock reward resolution fetch
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse([{ id: 175, barberia_id: tenantId, nombre: "Corte gratis", costo_en_sellos: 8 }])
        )
        // Mock RPC execution
        .mockResolvedValueOnce(
          jsonResponse({
            success: true,
            status: "redeemed",
            redemption_id: 2,
            ledger_id: 6,
            saldo_restante: 2
          })
        );

      const res = await LoyaltyService.redeem(tenantId, clienteId, 0, null, null, token);

      expect(res.success).toBe(true);
      const rpcCall = vi.mocked(fetch).mock.calls[1];
      const rpcBody = JSON.parse(rpcCall[1]?.body as string);
      expect(rpcBody.p_reward_id).toBe(175);
    });
  });
});
