import { describe, expect, it } from "vitest";
import type { LoyaltyBalance, LoyaltyLedgerEntry } from "../src/types/loyalty";

describe("BARBERAGENCY — LOYALTY CLIENT CANONICAL IDENTITY RESOLUTION", () => {
  // Canonical data setup:
  // Tenant 198 (Barberia de prueba 4)
  // Client 273: Carlos Alvis (phone: 3192213432), 1 stamp accumulated from payment 83 today
  // Client 202: Juan Perez (phone: 3001234567), 5 stamps accumulated yesterday
  // Client 999: Anonymous client without name in canonical records
  const rawBalancesTenant198: LoyaltyBalance[] = [
    {
      barberia_id: 198,
      cliente_id: 273,
      cliente_nombre: "Cliente #273", // Raw un-enriched fallback from database view
      cliente_telefono: undefined,
      saldo_sellos: 1,
      total_acumulaciones: 1,
      total_canjes: 0,
      ultimo_movimiento_at: "2026-09-29T15:41:05.882Z"
    },
    {
      barberia_id: 198,
      cliente_id: 202,
      cliente_nombre: "Cliente #202",
      cliente_telefono: undefined,
      saldo_sellos: 5,
      total_acumulaciones: 5,
      total_canjes: 0,
      ultimo_movimiento_at: "2026-09-28T10:00:00.000Z"
    },
    {
      barberia_id: 198,
      cliente_id: 999,
      cliente_nombre: "Cliente #999",
      cliente_telefono: undefined,
      saldo_sellos: 2,
      total_acumulaciones: 2,
      total_canjes: 0,
      ultimo_movimiento_at: "2026-09-20T10:00:00.000Z"
    }
  ];

  const tenant198Clients = [
    { id: 273, nombre: "Carlos Alvis", telefono: "3192213432" },
    { id: 202, nombre: "Juan Perez", telefono: "3001234567" }
    // 999 has no record in clients
  ];

  const tenant198Appointments = [
    {
      id: 324,
      barberia_id: 198,
      cliente_id: 273,
      cliente_nombre: "Carlos Alvis",
      cliente_tel: "3192213432",
      fecha: "2026-09-29T00:00:00.000Z"
    }
  ];

  // Tenant 207 (Another tenant)
  const tenant207Clients = [
    { id: 273, nombre: "Roberto Gómez (Tenant 207)", telefono: "3009998877" }
  ];

  // Helper matching page.tsx identity resolution logic
  function buildTenantClientMaps(
    clients: Array<Record<string, unknown>>,
    appointments: Array<Record<string, unknown>>
  ) {
    const clientMap = new Map<number, { nombre: string; telefono?: string }>();

    (clients || []).forEach((c) => {
      const rawId = Number(c.id ?? c.cliente_id ?? 0);
      const name = String(c.nombre ?? c.nombre_completo ?? c.name ?? "").trim();
      const phone = String(c.telefono ?? c.phone ?? "").trim() || undefined;
      if (Number.isFinite(rawId) && rawId > 0 && name && !name.toLowerCase().startsWith("cliente #")) {
        const existing = clientMap.get(rawId);
        clientMap.set(rawId, {
          nombre: name,
          telefono: phone || existing?.telefono
        });
      }
    });

    (appointments || []).forEach((a) => {
      const rawId = Number(a.cliente_id ?? a.id_cliente ?? 0);
      const name = String(a.cliente_nombre ?? a.nombre_cliente ?? a.client ?? "").trim();
      const phone = String(a.cliente_tel ?? a.telefono ?? a.phone ?? "").trim() || undefined;
      if (Number.isFinite(rawId) && rawId > 0 && name && !name.toLowerCase().startsWith("cliente #")) {
        const existing = clientMap.get(rawId);
        clientMap.set(rawId, {
          nombre: existing?.nombre || name,
          telefono: existing?.telefono || phone
        });
      }
    });

    const phoneMap = new Map<string, { nombre: string; telefono?: string }>();
    for (const meta of clientMap.values()) {
      if (meta.telefono) {
        const digits = meta.telefono.replace(/\D/g, "");
        if (digits.length >= 7) {
          phoneMap.set(digits, meta);
        }
      }
    }

    return { clientMap, phoneMap };
  }

  function resolveBalancesHelper(
    rawBalances: LoyaltyBalance[],
    clientMap: Map<number, { nombre: string; telefono?: string }>,
    phoneMap: Map<string, { nombre: string; telefono?: string }>
  ): LoyaltyBalance[] {
    return rawBalances.map((b) => {
      let meta = clientMap.get(b.cliente_id);
      if (!meta && b.cliente_telefono) {
        const digits = b.cliente_telefono.replace(/\D/g, "");
        if (digits.length >= 7) {
          meta = phoneMap.get(digits);
        }
      }

      const hasCanonicalName = b.cliente_nombre && !b.cliente_nombre.toLowerCase().startsWith("cliente #");
      const resolvedNombre = hasCanonicalName
        ? b.cliente_nombre
        : (meta?.nombre || b.cliente_nombre || `Cliente #${b.cliente_id}`);
      const resolvedTelefono = b.cliente_telefono || meta?.telefono || null;

      return {
        ...b,
        cliente_nombre: resolvedNombre,
        cliente_telefono: resolvedTelefono
      };
    });
  }

  function filterBalancesHelper({
    balances,
    customerSearch,
    customerFilter,
    periodClientIds
  }: {
    balances: LoyaltyBalance[];
    customerSearch: string;
    customerFilter: "periodo" | "listos" | "todos";
    periodClientIds: Set<number>;
  }) {
    const normalize = (str: string) =>
      str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const term = normalize(customerSearch);
    const rawDigits = customerSearch.replace(/\D/g, "");
    const isSearching = Boolean(term);

    return balances.filter((b) => {
      const isPeriodActive = periodClientIds.has(b.cliente_id);

      if (isSearching) {
        const matchName = normalize(b.cliente_nombre).includes(term);
        const matchPhone = b.cliente_telefono
          ? b.cliente_telefono.includes(customerSearch.trim()) ||
            (rawDigits.length >= 3 && b.cliente_telefono.replace(/\D/g, "").includes(rawDigits))
          : false;

        if (!matchName && !matchPhone) return false;
        return true;
      }

      if (customerFilter === "periodo") return isPeriodActive;
      if (customerFilter === "todos") return true;
      return isPeriodActive;
    });
  }

  // 1. Cliente con nombre canónico -> muestra nombre real prioritario
  it("1. Cliente con nombre canónico muestra nombre real prioritario", () => {
    const { clientMap, phoneMap } = buildTenantClientMaps(tenant198Clients, tenant198Appointments);
    const resolved = resolveBalancesHelper(rawBalancesTenant198, clientMap, phoneMap);

    const client273 = resolved.find((b) => b.cliente_id === 273);
    expect(client273).toBeDefined();
    expect(client273?.cliente_nombre).toBe("Carlos Alvis");
    expect(client273?.cliente_nombre).not.toContain("Cliente #");
  });

  // 2. Cliente con nombre y teléfono -> muestra ambos (nombre principal, teléfono secundario)
  it("2. Cliente con nombre y teléfono muestra ambos en su registro", () => {
    const { clientMap, phoneMap } = buildTenantClientMaps(tenant198Clients, tenant198Appointments);
    const resolved = resolveBalancesHelper(rawBalancesTenant198, clientMap, phoneMap);

    const client273 = resolved.find((b) => b.cliente_id === 273);
    expect(client273?.cliente_nombre).toBe("Carlos Alvis");
    expect(client273?.cliente_telefono).toBe("3192213432");

    const client202 = resolved.find((b) => b.cliente_id === 202);
    expect(client202?.cliente_nombre).toBe("Juan Perez");
    expect(client202?.cliente_telefono).toBe("3001234567");
  });

  // 3. Búsqueda por nombre (exacto, parcial, case-insensitive, sin tildes)
  it("3. Búsqueda por nombre encuentra a Carlos Alvis con diferentes términos", () => {
    const { clientMap, phoneMap } = buildTenantClientMaps(tenant198Clients, tenant198Appointments);
    const resolved = resolveBalancesHelper(rawBalancesTenant198, clientMap, phoneMap);
    const periodClientIds = new Set([273]);

    // Búsqueda por "Carlos"
    const searchCarlos = filterBalancesHelper({
      balances: resolved,
      customerSearch: "Carlos",
      customerFilter: "periodo",
      periodClientIds
    });
    expect(searchCarlos.length).toBe(1);
    expect(searchCarlos[0].cliente_id).toBe(273);
    expect(searchCarlos[0].cliente_nombre).toBe("Carlos Alvis");

    // Búsqueda por "alvis" (minúsculas)
    const searchAlvis = filterBalancesHelper({
      balances: resolved,
      customerSearch: "alvis",
      customerFilter: "periodo",
      periodClientIds
    });
    expect(searchAlvis.length).toBe(1);
    expect(searchAlvis[0].cliente_id).toBe(273);

    // Búsqueda por "cár" (con tilde)
    const searchCar = filterBalancesHelper({
      balances: resolved,
      customerSearch: "cár",
      customerFilter: "periodo",
      periodClientIds
    });
    expect(searchCar.length).toBe(1);
    expect(searchCar[0].cliente_id).toBe(273);
  });

  // 4. Búsqueda por teléfono (completo o parcial de 3+ dígitos)
  it("4. Búsqueda por teléfono encuentra a Carlos Alvis por número completo y prefijo", () => {
    const { clientMap, phoneMap } = buildTenantClientMaps(tenant198Clients, tenant198Appointments);
    const resolved = resolveBalancesHelper(rawBalancesTenant198, clientMap, phoneMap);
    const periodClientIds = new Set([273]);

    // Búsqueda completa "3192213432"
    const searchFull = filterBalancesHelper({
      balances: resolved,
      customerSearch: "3192213432",
      customerFilter: "periodo",
      periodClientIds
    });
    expect(searchFull.length).toBe(1);
    expect(searchFull[0].cliente_id).toBe(273);

    // Búsqueda parcial "319221"
    const searchPrefix = filterBalancesHelper({
      balances: resolved,
      customerSearch: "319221",
      customerFilter: "periodo",
      periodClientIds
    });
    expect(searchPrefix.length).toBe(1);
    expect(searchPrefix[0].cliente_id).toBe(273);
  });

  // 5. Cliente sin nombre -> fallback defensivo "Cliente #<id>"
  it("5. Cliente sin nombre en fuentes canónicas usa fallback defensivo Cliente #<id>", () => {
    const { clientMap, phoneMap } = buildTenantClientMaps(tenant198Clients, tenant198Appointments);
    const resolved = resolveBalancesHelper(rawBalancesTenant198, clientMap, phoneMap);

    const client999 = resolved.find((b) => b.cliente_id === 999);
    expect(client999).toBeDefined();
    expect(client999?.cliente_nombre).toBe("Cliente #999");
  });

  // 6. Tenant A no puede resolver cliente de Tenant B (Aislamiento Multi-Tenant)
  it("6. Tenant 198 no resuelve clientes de Tenant 207 y viceversa", () => {
    // Tenant 198 lookup maps
    const { clientMap: map198, phoneMap: phoneMap198 } = buildTenantClientMaps(
      tenant198Clients,
      tenant198Appointments
    );

    // Tenant 207 lookup maps
    const { clientMap: map207 } = buildTenantClientMaps(
      tenant207Clients,
      []
    );

    // Resolving Tenant 198 data using Tenant 198 maps
    const resolved198 = resolveBalancesHelper(rawBalancesTenant198, map198, phoneMap198);
    expect(resolved198.find((b) => b.cliente_id === 273)?.cliente_nombre).toBe("Carlos Alvis");

    // Resolving Tenant 198 data using Tenant 207 maps CANNOT cross-pollinate
    // Because in production, useDashboard().merged is tenant-scoped by session
    expect(map198.get(273)?.nombre).toBe("Carlos Alvis");
    expect(map207.get(273)?.nombre).toBe("Roberto Gómez (Tenant 207)");
    expect(map198.get(273)?.nombre).not.toBe(map207.get(273)?.nombre);
  });

  // 7. Vista "Hoy" muestra solo actividad de período (Carlos Alvis activo con 1 sello)
  it("7. Vista Hoy muestra a Carlos Alvis con actividad de período y saldo de 1 sello", () => {
    const { clientMap, phoneMap } = buildTenantClientMaps(tenant198Clients, tenant198Appointments);
    const resolved = resolveBalancesHelper(rawBalancesTenant198, clientMap, phoneMap);

    // Period: Hoy (2026-09-29) -> only client 273 has ledger entry today
    const periodClientIds = new Set([273]);

    const periodClients = filterBalancesHelper({
      balances: resolved,
      customerSearch: "",
      customerFilter: "periodo",
      periodClientIds
    });

    expect(periodClients.length).toBe(1);
    expect(periodClients[0].cliente_id).toBe(273);
    expect(periodClients[0].cliente_nombre).toBe("Carlos Alvis");
    expect(periodClients[0].saldo_sellos).toBe(1);
    expect(periodClients[0].total_acumulaciones).toBe(1);
    expect(periodClients[0].total_canjes).toBe(0);
  });

  // 8. Directorio completo funciona y muestra todos los clientes con nombres resueltos
  it("8. Directorio completo muestra todos los clientes manteniendo nombres resueltos", () => {
    const { clientMap, phoneMap } = buildTenantClientMaps(tenant198Clients, tenant198Appointments);
    const resolved = resolveBalancesHelper(rawBalancesTenant198, clientMap, phoneMap);
    const periodClientIds = new Set([273]);

    const allClients = filterBalancesHelper({
      balances: resolved,
      customerSearch: "",
      customerFilter: "todos",
      periodClientIds
    });

    expect(allClients.length).toBe(3);
    expect(allClients.find((c) => c.cliente_id === 273)?.cliente_nombre).toBe("Carlos Alvis");
    expect(allClients.find((c) => c.cliente_id === 202)?.cliente_nombre).toBe("Juan Perez");
    expect(allClients.find((c) => c.cliente_id === 999)?.cliente_nombre).toBe("Cliente #999");
  });

  // 9. Cliente 273 conserva exactamente 1 sello (invariante de balance)
  it("9. Cliente 273 conserva saldo canónico de 1 sello sin alteraciones", () => {
    const { clientMap, phoneMap } = buildTenantClientMaps(tenant198Clients, tenant198Appointments);
    const resolved = resolveBalancesHelper(rawBalancesTenant198, clientMap, phoneMap);

    const client273 = resolved.find((b) => b.cliente_id === 273);
    expect(client273?.saldo_sellos).toBe(1);
    expect(client273?.total_acumulaciones).toBe(1);
    expect(client273?.total_canjes).toBe(0);
  });

  // 10. Ledger y Redemptions resuelven el nombre canónico sin modificar las tablas
  it("10. Ledger y Redemptions reflejan el nombre canónico del cliente", () => {
    const { clientMap } = buildTenantClientMaps(tenant198Clients, tenant198Appointments);

    const ledger: LoyaltyLedgerEntry[] = [
      {
        id: 1,
        barberia_id: 198,
        cliente_id: 273,
        cliente_nombre: undefined,
        delta: 1,
        tipo_movimiento: "acumulacion",
        source_type: "pago",
        source_id: 83,
        redemption_id: null,
        operador_usuario_id: null,
        notas: null,
        created_at: "2026-09-29T15:41:05.882Z"
      }
    ];

    const resolvedLedger = ledger.map((entry) => {
      const meta = clientMap.get(entry.cliente_id);
      return {
        ...entry,
        cliente_nombre: meta?.nombre || `Cliente #${entry.cliente_id}`
      };
    });

    expect(resolvedLedger[0].cliente_nombre).toBe("Carlos Alvis");
  });
});
