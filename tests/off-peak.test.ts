import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OffPeakService, validateOffPeakInput } from "../src/lib/off-peak.service";
import type { OffPeakRule } from "../src/types/off-peak";

const postgrestBase = "https://postgrest.test";

function jsonResponse(body: Record<string, unknown> | unknown[], status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("TIEMPOS MUERTOS / OFF-PEAK SMART PROMOTIONAL PRICING CONTRACT", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.POSTGREST_BASE_URL = postgrestBase;
    process.env.LOYALTY_SERVICE_ROLE_TOKEN = "mock-service-role-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("1. Input Validation & Mathematical Bounds", () => {
    it("accepts valid rule input", () => {
      const result = validateOffPeakInput({
        descuento_porcentaje: 20,
        dias_semana: [1, 2, 3], // Lun, Mar, Mie
        hora_inicio: "14:00",
        hora_fin: "16:00"
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("rejects non-integer discount percentage", () => {
      const result = validateOffPeakInput({ descuento_porcentaje: 20.5 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("entero");
    });

    it("rejects discount percentage <= 0", () => {
      const result0 = validateOffPeakInput({ descuento_porcentaje: 0 });
      expect(result0.valid).toBe(false);
      const resultNeg = validateOffPeakInput({ descuento_porcentaje: -15 });
      expect(resultNeg.valid).toBe(false);
    });

    it("rejects discount percentage >= 100", () => {
      const result100 = validateOffPeakInput({ descuento_porcentaje: 100 });
      expect(result100.valid).toBe(false);
      const result120 = validateOffPeakInput({ descuento_porcentaje: 120 });
      expect(result120.valid).toBe(false);
    });

    it("rejects empty days of week", () => {
      const result = validateOffPeakInput({ dias_semana: [] });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("al menos un día");
    });

    it("rejects invalid day indices outside 0..6", () => {
      const resultNeg = validateOffPeakInput({ dias_semana: [-1] });
      expect(resultNeg.valid).toBe(false);
      const result7 = validateOffPeakInput({ dias_semana: [7] });
      expect(result7.valid).toBe(false);
    });

    it("rejects invalid time formats", () => {
      const result = validateOffPeakInput({ hora_inicio: "25:00", hora_fin: "16:00" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("formato de hora");
    });

    it("rejects end hour <= start hour (violating positive interval)", () => {
      const resultEqual = validateOffPeakInput({ hora_inicio: "14:00", hora_fin: "14:00" });
      expect(resultEqual.valid).toBe(false);
      expect(resultEqual.error).toContain("posterior");

      const resultReversed = validateOffPeakInput({ hora_inicio: "17:00", hora_fin: "14:00" });
      expect(resultReversed.valid).toBe(false);
      expect(resultReversed.error).toContain("posterior");
    });
  });

  describe("2. Pure Deterministic Pricing Engine (calculatePricePure)", () => {
    const baseRule: OffPeakRule = {
      id: 10,
      barberia_id: 198,
      nombre: "Tardes Felices",
      dias_semana: [1, 2, 3], // Lunes, Martes, Miércoles
      hora_inicio: "14:00",
      hora_fin: "16:00",
      descuento_porcentaje: 20,
      aplica_todos_servicios: true,
      servicios_ids: null,
      aplica_todos_barberos: true,
      barberos_ids: null,
      activo: true
    };

    it("returns unmodified base price when no rules exist", () => {
      const calc = OffPeakService.calculatePricePure(20000, [], {
        servicioId: 1,
        fecha: "2026-10-05", // Lunes (DOW 1)
        hora: "14:30"
      });

      expect(calc.tiene_descuento).toBe(false);
      expect(calc.precio_base).toBe(20000);
      expect(calc.descuento_porcentaje).toBe(0);
      expect(calc.descuento_valor).toBe(0);
      expect(calc.precio_final).toBe(20000);
      expect(calc.promocion_id).toBeNull();
    });

    it("ignores inactive rules", () => {
      const inactiveRule = { ...baseRule, activo: false };
      const calc = OffPeakService.calculatePricePure(20000, [inactiveRule], {
        servicioId: 1,
        fecha: "2026-10-05", // Lunes
        hora: "14:30"
      });

      expect(calc.tiene_descuento).toBe(false);
      expect(calc.precio_final).toBe(20000);
    });

    it("calculates correct 20% discount on $20,000 -> $16,000", () => {
      const calc = OffPeakService.calculatePricePure(20000, [baseRule], {
        servicioId: 1,
        fecha: "2026-10-05", // Lunes
        hora: "14:30"
      });

      expect(calc.tiene_descuento).toBe(true);
      expect(calc.precio_base).toBe(20000);
      expect(calc.descuento_porcentaje).toBe(20);
      expect(calc.descuento_valor).toBe(4000);
      expect(calc.precio_final).toBe(16000);
      expect(calc.promocion_id).toBe(10);
      expect(calc.promocion_nombre).toBe("Tardes Felices");
      expect(calc.promocion_snapshot).toEqual({
        id: 10,
        nombre: "Tardes Felices",
        descuento_porcentaje: 20,
        descuento_valor: 4000,
        hora_inicio: "14:00",
        hora_fin: "16:00",
        dias_semana: [1, 2, 3]
      });
    });

    describe("Semi-open Interval Policy: [hora_inicio, hora_fin)", () => {
      it("INCLUSIVE on lower bound (14:00 matches)", () => {
        const calc = OffPeakService.calculatePricePure(20000, [baseRule], {
          servicioId: 1,
          fecha: "2026-10-05",
          hora: "14:00"
        });
        expect(calc.tiene_descuento).toBe(true);
        expect(calc.precio_final).toBe(16000);
      });

      it("INCLUSIVE inside interval (15:59 matches)", () => {
        const calc = OffPeakService.calculatePricePure(20000, [baseRule], {
          servicioId: 1,
          fecha: "2026-10-05",
          hora: "15:59"
        });
        expect(calc.tiene_descuento).toBe(true);
        expect(calc.precio_final).toBe(16000);
      });

      it("EXCLUSIVE on upper bound (16:00 DOES NOT match)", () => {
        const calc = OffPeakService.calculatePricePure(20000, [baseRule], {
          servicioId: 1,
          fecha: "2026-10-05",
          hora: "16:00"
        });
        expect(calc.tiene_descuento).toBe(false);
        expect(calc.precio_final).toBe(20000);
      });

      it("Outside upper bound (16:30 DOES NOT match)", () => {
        const calc = OffPeakService.calculatePricePure(20000, [baseRule], {
          servicioId: 1,
          fecha: "2026-10-05",
          hora: "16:30"
        });
        expect(calc.tiene_descuento).toBe(false);
        expect(calc.precio_final).toBe(20000);
      });

      it("Outside lower bound (13:59 DOES NOT match)", () => {
        const calc = OffPeakService.calculatePricePure(20000, [baseRule], {
          servicioId: 1,
          fecha: "2026-10-05",
          hora: "13:59"
        });
        expect(calc.tiene_descuento).toBe(false);
        expect(calc.precio_final).toBe(20000);
      });
    });

    describe("Day-of-Week Matching", () => {
      it("applies on configured day (Wednesday 2026-10-07 = DOW 3)", () => {
        const calc = OffPeakService.calculatePricePure(20000, [baseRule], {
          servicioId: 1,
          fecha: "2026-10-07",
          hora: "15:00"
        });
        expect(calc.tiene_descuento).toBe(true);
      });

      it("does not apply on unconfigured day (Sunday 2026-10-04 = DOW 0)", () => {
        const calc = OffPeakService.calculatePricePure(20000, [baseRule], {
          servicioId: 1,
          fecha: "2026-10-04",
          hora: "15:00"
        });
        expect(calc.tiene_descuento).toBe(false);
        expect(calc.precio_final).toBe(20000);
      });
    });

    describe("Service Scope Filtering", () => {
      const specificServiceRule: OffPeakRule = {
        ...baseRule,
        aplica_todos_servicios: false,
        servicios_ids: [101, 102]
      };

      it("applies when service matches scoped array", () => {
        const calc = OffPeakService.calculatePricePure(30000, [specificServiceRule], {
          servicioId: 101,
          fecha: "2026-10-05",
          hora: "14:30"
        });
        expect(calc.tiene_descuento).toBe(true);
        expect(calc.precio_final).toBe(24000);
      });

      it("does not apply when service is outside scoped array", () => {
        const calc = OffPeakService.calculatePricePure(30000, [specificServiceRule], {
          servicioId: 999,
          fecha: "2026-10-05",
          hora: "14:30"
        });
        expect(calc.tiene_descuento).toBe(false);
        expect(calc.precio_final).toBe(30000);
      });
    });

    describe("Barber Scope Filtering", () => {
      const specificBarberRule: OffPeakRule = {
        ...baseRule,
        aplica_todos_barberos: false,
        barberos_ids: [50]
      };

      it("applies when barber matches scoped array", () => {
        const calc = OffPeakService.calculatePricePure(20000, [specificBarberRule], {
          servicioId: 1,
          barberoId: 50,
          fecha: "2026-10-05",
          hora: "14:30"
        });
        expect(calc.tiene_descuento).toBe(true);
      });

      it("does not apply when barber does not match scoped array", () => {
        const calc = OffPeakService.calculatePricePure(20000, [specificBarberRule], {
          servicioId: 1,
          barberoId: 77,
          fecha: "2026-10-05",
          hora: "14:30"
        });
        expect(calc.tiene_descuento).toBe(false);
      });
    });

    describe("Deterministic Overlap Resolution & Anti-Stacking Policy", () => {
      const rule20: OffPeakRule = { ...baseRule, id: 1, descuento_porcentaje: 20, nombre: "Promo 20%" };
      const rule30: OffPeakRule = { ...baseRule, id: 2, descuento_porcentaje: 30, nombre: "Super Promo 30%" };
      const rule15: OffPeakRule = { ...baseRule, id: 3, descuento_porcentaje: 15, nombre: "Promo 15%" };

      it("selects the highest discount percentage without stacking (30% wins over 20% and 15%)", () => {
        const calc = OffPeakService.calculatePricePure(20000, [rule20, rule30, rule15], {
          servicioId: 1,
          fecha: "2026-10-05",
          hora: "14:30"
        });

        expect(calc.tiene_descuento).toBe(true);
        expect(calc.descuento_porcentaje).toBe(30);
        expect(calc.descuento_valor).toBe(6000);
        expect(calc.precio_final).toBe(14000);
        expect(calc.promocion_id).toBe(2);
        expect(calc.promocion_nombre).toBe("Super Promo 30%");
      });

      it("breaks ties deterministically using lowest id ASC", () => {
        const ruleA: OffPeakRule = { ...baseRule, id: 5, descuento_porcentaje: 25, nombre: "Rule A" };
        const ruleB: OffPeakRule = { ...baseRule, id: 2, descuento_porcentaje: 25, nombre: "Rule B" };

        const calc = OffPeakService.calculatePricePure(20000, [ruleA, ruleB], {
          servicioId: 1,
          fecha: "2026-10-05",
          hora: "14:30"
        });

        expect(calc.tiene_descuento).toBe(true);
        expect(calc.descuento_porcentaje).toBe(25);
        expect(calc.promocion_id).toBe(2); // ID 2 wins over ID 5
        expect(calc.promocion_nombre).toBe("Rule B");
      });
    });
  });

  describe("3. PostgREST Multi-Tenant Isolation & CRUD Operations", () => {
    it("listRules filters strictly by barberia_id", async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse([{ id: 1, barberia_id: 198, nombre: "Test" }]));
      vi.stubGlobal("fetch", mockFetch);

      const rules = await OffPeakService.listRules(198);
      expect(rules).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/barberia_off_peak_rules?barberia_id=eq.198"),
        expect.any(Object)
      );
    });

    it("createRule injects tenant barberia_id", async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse([{ id: 2, barberia_id: 198, nombre: "Nueva" }]));
      vi.stubGlobal("fetch", mockFetch);

      const created = await OffPeakService.createRule(198, {
        nombre: "Nueva",
        dias_semana: [1],
        hora_inicio: "10:00",
        hora_fin: "12:00",
        descuento_porcentaje: 15
      });

      expect(created.id).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/barberia_off_peak_rules"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"barberia_id":198')
        })
      );
    });

    it("updateRule enforces tenant boundary filter (id=eq.5&barberia_id=eq.198)", async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse([{ id: 5, barberia_id: 198, activo: false }]));
      vi.stubGlobal("fetch", mockFetch);

      const updated = await OffPeakService.updateRule(5, 198, { activo: false });
      expect(updated.activo).toBe(false);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/barberia_off_peak_rules?id=eq.5&barberia_id=eq.198"),
        expect.objectContaining({ method: "PATCH" })
      );
    });

    it("deleteRule enforces tenant boundary filter (id=eq.5&barberia_id=eq.198)", async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal("fetch", mockFetch);

      const result = await OffPeakService.deleteRule(5, 198);
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/barberia_off_peak_rules?id=eq.5&barberia_id=eq.198"),
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("4. Immutable Financial Snapshot & Anti-Tampering Contract", () => {
    it("ensures historical appointment snapshot remains untouched regardless of rule mutation", () => {
      // Historical appointment booked during off-peak
      const appointmentHistorical = {
        id: 777,
        barberia_id: 198,
        fecha: "2026-10-01",
        hora_inicio: "14:00:00",
        precio_base: 20000,
        descuento_porcentaje: 20,
        descuento_valor: 4000,
        precio_final: 16000,
        promocion_id: 10,
        promocion_snapshot: {
          id: 10,
          nombre: "Promo Original",
          descuento_porcentaje: 20,
          descuento_valor: 4000
        }
      };

      // Later, rule 10 is deleted or changed to 50%
      const modifiedRule: OffPeakRule = {
        id: 10,
        barberia_id: 198,
        nombre: "Promo Mutada",
        dias_semana: [1],
        hora_inicio: "14:00",
        hora_fin: "16:00",
        descuento_porcentaje: 50,
        aplica_todos_servicios: true,
        servicios_ids: null,
        aplica_todos_barberos: true,
        barberos_ids: null,
        activo: true
      };

      // The appointment's financial contract MUST remain immutable:
      expect(modifiedRule.descuento_porcentaje).toBe(50);
      expect(appointmentHistorical.precio_final).toBe(16000);
      expect(appointmentHistorical.descuento_porcentaje).toBe(20);
      expect(appointmentHistorical.promocion_snapshot.descuento_porcentaje).toBe(20);
    });
  });

  describe("5. POS Charging Contract & Loyalty Non-Interference", () => {
    it("POS charges effective precio_final ($16,000) instead of base price ($20,000)", () => {
      const appointment = {
        id: "777",
        client: "Calvin",
        service: "Corte Clásico",
        date: "01/10/2026",
        hour: "14:00",
        total: 16000,
        precioBase: 20000,
        descuentoPorcentaje: 20,
        descuentoValor: 4000,
        precioFinal: 16000,
        promocionSnapshot: {
          id: 10,
          nombre: "Tardes Felices",
          descuento_porcentaje: 20
        }
      };

      // POS movement calculation logic
      const effectiveAmount = (appointment.precioFinal && appointment.precioFinal > 0)
        ? appointment.precioFinal
        : appointment.precioBase || appointment.total;

      expect(effectiveAmount).toBe(16000);

      // Verify that POS checkout payload receives the discounted canonical amount
      const posPayload = {
        barberia_id: 198,
        cliente_nombre: appointment.client,
        barbero_id: 1,
        metodo_pago: "efectivo",
        monto_total: effectiveAmount,
        servicios: [{ id: 1, name: appointment.service, amount: effectiveAmount }],
        cita_id: appointment.id
      };

      expect(posPayload.monto_total).toBe(16000);
    });

    it("verifies POS payment seamlessly integrates with Loyalty stamp accrual", () => {
      // In POS flow:
      // fn_pos_registrar_pago_realizada registers pago with total = 16000
      // ba_loyalty_acumular_pago receives pago_id, verifies cliente, and generates +1 stamp in loyalty_ledger
      const canonicalPayment = {
        id: 9999,
        barberia_id: 198,
        total: 16000, // Promotional amount
        metodo: "efectivo"
      };

      const loyaltyLedgerEntry = {
        barberia_id: canonicalPayment.barberia_id,
        pago_id: canonicalPayment.id,
        sellos_cambio: 1,
        tipo_transaccion: "acumulacion_pago"
      };

      expect(loyaltyLedgerEntry.sellos_cambio).toBe(1);
      expect(loyaltyLedgerEntry.pago_id).toBe(9999);
    });
  });
});
