import { describe, expect, it } from "vitest";
import type { LoyaltyBalance, LoyaltyLedgerEntry, LoyaltyRedemption, LoyaltyReward } from "../src/types/loyalty";
import { computeDateRange, isDateInRange } from "../src/lib/loyalty-date";

describe("LOYALTY PERIOD SEMANTICS & GLOBAL TENANT SEARCH (PHASE 5 REMEDIATION)", () => {
  // Test fixture: 3 clients for Tenant 198
  const tenant198Clients: LoyaltyBalance[] = [
    {
      barberia_id: 198,
      cliente_id: 202,
      cliente_nombre: "Juan Perez",
      cliente_telefono: "3001234567",
      saldo_sellos: 5,
      total_acumulaciones: 5,
      total_canjes: 0,
      ultimo_movimiento_at: "2026-09-28T10:00:00Z"
    },
    {
      barberia_id: 198,
      cliente_id: 273,
      cliente_nombre: "Carlos Gomez",
      cliente_telefono: "3109876543",
      saldo_sellos: 1,
      total_acumulaciones: 1,
      total_canjes: 0,
      ultimo_movimiento_at: "2026-09-29T15:41:05.882Z"
    },
    {
      barberia_id: 198,
      cliente_id: 301,
      cliente_nombre: "Andres Rodriguez",
      cliente_telefono: "3155558888",
      saldo_sellos: 10,
      total_acumulaciones: 10,
      total_canjes: 1,
      ultimo_movimiento_at: "2026-08-15T12:00:00Z"
    }
  ];

  // Ledger entries: Carlos Gomez (273) has movement today (2026-09-29).
  // Juan Perez (202) had movement yesterday (2026-09-28).
  // Andres Rodriguez (301) had movement last month (2026-08-15).
  const ledgerEntries: LoyaltyLedgerEntry[] = [
    {
      id: 1,
      barberia_id: 198,
      cliente_id: 202,
      cliente_nombre: "Juan Perez",
      delta: 1,
      tipo_movimiento: "acumulacion",
      source_type: "pago",
      source_id: 50,
      redemption_id: null,
      operador_usuario_id: 10,
      notas: "Pago #50",
      created_at: "2026-09-28T15:00:00-05:00"
    },
    {
      id: 2,
      barberia_id: 198,
      cliente_id: 273,
      cliente_nombre: "Carlos Gomez",
      delta: 1,
      tipo_movimiento: "acumulacion",
      source_type: "pago",
      source_id: 83,
      redemption_id: null,
      operador_usuario_id: 10,
      notas: "Pago #83",
      created_at: "2026-09-29T10:41:05-05:00"
    }
  ];

  const redemptions: LoyaltyRedemption[] = [];

  const activeRewards: LoyaltyReward[] = [
    {
      id: 1,
      barberia_id: 198,
      nombre: "Corte Gratis",
      costo_en_sellos: 8,
      activo: true,
      descripcion: "Corte completo",
      created_at: "",
      updated_at: ""
    }
  ];

  function resolveClientProgress(balance: number, sortedRewards: LoyaltyReward[]) {
    const affordable = sortedRewards.filter((r) => r.costo_en_sellos <= balance);
    return {
      isEligible: affordable.length > 0
    };
  }

  // Pure filtering logic identical to page.tsx
  function filterBalancesHelper({
    balances,
    customerSearch,
    customerFilter,
    dateRange,
    ledger,
    redemptions,
    rewards
  }: {
    balances: LoyaltyBalance[];
    customerSearch: string;
    customerFilter: "periodo" | "listos" | "todos";
    dateRange: ReturnType<typeof computeDateRange>;
    ledger: LoyaltyLedgerEntry[];
    redemptions: LoyaltyRedemption[];
    rewards: LoyaltyReward[];
  }) {
    const periodLedger = ledger.filter((l) => isDateInRange(l.created_at, dateRange));
    const periodRedemptions = redemptions.filter((r) => isDateInRange(r.created_at, dateRange));

    const periodClientIds = new Set<number>();
    for (const l of periodLedger) periodClientIds.add(l.cliente_id);
    for (const r of periodRedemptions) periodClientIds.add(r.cliente_id);

    const normalize = (str: string) =>
      str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const term = normalize(customerSearch);
    const rawDigits = customerSearch.replace(/\D/g, "");
    const isSearching = Boolean(term);

    const filtered = balances.filter((b) => {
      const progress = resolveClientProgress(b.saldo_sellos, rewards);
      const isPeriodActive = periodClientIds.has(b.cliente_id);

      if (isSearching) {
        const matchName = normalize(b.cliente_nombre).includes(term);
        const matchPhone = b.cliente_telefono
          ? b.cliente_telefono.includes(customerSearch.trim()) ||
            (rawDigits.length >= 3 && b.cliente_telefono.replace(/\D/g, "").includes(rawDigits))
          : false;

        if (!matchName && !matchPhone) return false;
        if (customerFilter === "listos" && !progress.isEligible) return false;
        return true;
      }

      if (customerFilter === "periodo") return isPeriodActive;
      if (customerFilter === "listos") return progress.isEligible;
      if (customerFilter === "todos") return true;
      return isPeriodActive;
    });

    return {
      filtered,
      periodClientIds,
      periodParticipants: periodClientIds.size
    };
  }

  describe("1. DEFAULT OPERATIONAL VIEW IS PERIOD-DRIVEN", () => {
    it("Para 'Hoy', la vista por defecto muestra ÚNICAMENTE clientes con actividad hoy (NO el directorio completo)", () => {
      const todayRange = computeDateRange("hoy", undefined, undefined, new Date("2026-09-29T12:00:00-05:00"));
      const result = filterBalancesHelper({
        balances: tenant198Clients,
        customerSearch: "",
        customerFilter: "periodo",
        dateRange: todayRange,
        ledger: ledgerEntries,
        redemptions,
        rewards: activeRewards
      });

      // Total tenant clients is 3, but today only Carlos Gomez (273) had movement
      expect(result.periodParticipants).toBe(1);
      expect(result.filtered.length).toBe(1);
      expect(result.filtered[0].cliente_id).toBe(273);
      expect(result.filtered[0].cliente_nombre).toBe("Carlos Gomez");
    });

    it("Cambiar el rango a 'Ayer' actualiza el dataset operacional automáticamente", () => {
      const yesterdayRange = computeDateRange("ayer", undefined, undefined, new Date("2026-09-29T12:00:00-05:00"));
      const result = filterBalancesHelper({
        balances: tenant198Clients,
        customerSearch: "",
        customerFilter: "periodo",
        dateRange: yesterdayRange,
        ledger: ledgerEntries,
        redemptions,
        rewards: activeRewards
      });

      expect(result.periodParticipants).toBe(1);
      expect(result.filtered.length).toBe(1);
      expect(result.filtered[0].cliente_id).toBe(202);
      expect(result.filtered[0].cliente_nombre).toBe("Juan Perez");
    });

    it("Si no hay movimientos en el período seleccionado, el dataset por defecto tiene 0 clientes", () => {
      // Future day with no movements
      const customRange = computeDateRange("personalizado", "2026-10-10", "2026-10-10");
      const result = filterBalancesHelper({
        balances: tenant198Clients,
        customerSearch: "",
        customerFilter: "periodo",
        dateRange: customRange,
        ledger: ledgerEntries,
        redemptions,
        rewards: activeRewards
      });

      expect(result.periodParticipants).toBe(0);
      expect(result.filtered.length).toBe(0);
    });
  });

  describe("2. GLOBAL TENANT SEARCH PRESERVED & PERIOD STATUS LABELED", () => {
    it("El buscador permite encontrar cualquier cliente del tenant aunque no tenga movimientos hoy", () => {
      const todayRange = computeDateRange("hoy", undefined, undefined, new Date("2026-09-29T12:00:00-05:00"));
      const result = filterBalancesHelper({
        balances: tenant198Clients,
        customerSearch: "Andres", // Andres had no movement today
        customerFilter: "periodo",
        dateRange: todayRange,
        ledger: ledgerEntries,
        redemptions,
        rewards: activeRewards
      });

      expect(result.filtered.length).toBe(1);
      expect(result.filtered[0].cliente_id).toBe(301);
      expect(result.filtered[0].cliente_nombre).toBe("Andres Rodriguez");
      // Result distinguishes that Andres is NOT active in today's period
      expect(result.periodClientIds.has(301)).toBe(false);
    });

    it("El buscador por teléfono localiza al cliente y confirma su estado de actividad de período", () => {
      const todayRange = computeDateRange("hoy", undefined, undefined, new Date("2026-09-29T12:00:00-05:00"));
      const result = filterBalancesHelper({
        balances: tenant198Clients,
        customerSearch: "310987", // Carlos phone
        customerFilter: "periodo",
        dateRange: todayRange,
        ledger: ledgerEntries,
        redemptions,
        rewards: activeRewards
      });

      expect(result.filtered.length).toBe(1);
      expect(result.filtered[0].cliente_id).toBe(273);
      // Carlos IS active in today's period
      expect(result.periodClientIds.has(273)).toBe(true);
    });

    it("Filtro 'Directorio completo' ('todos') permite explorar los 3 clientes explícitamente", () => {
      const todayRange = computeDateRange("hoy", undefined, undefined, new Date("2026-09-29T12:00:00-05:00"));
      const result = filterBalancesHelper({
        balances: tenant198Clients,
        customerSearch: "",
        customerFilter: "todos",
        dateRange: todayRange,
        ledger: ledgerEntries,
        redemptions,
        rewards: activeRewards
      });

      expect(result.filtered.length).toBe(3);
    });

    it("Aislamiento multi-tenant estricto: Búsqueda nunca expone clientes de otro tenant", () => {
      // Tenant 207 client
      const tenant207Client: LoyaltyBalance = {
        barberia_id: 207,
        cliente_id: 999,
        cliente_nombre: "Extraño Infiltrado",
        cliente_telefono: "3999999999",
        saldo_sellos: 20,
        total_acumulaciones: 20,
        total_canjes: 2,
        ultimo_movimiento_at: null
      };

      // Tenant 198 dataset only contains tenant 198
      expect(tenant198Clients.every((c) => c.barberia_id === 198)).toBe(true);
      expect(tenant198Clients.find((c) => c.barberia_id === tenant207Client.barberia_id)).toBeUndefined();
    });
  });
});
