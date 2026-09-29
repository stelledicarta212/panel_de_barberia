import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOGOTA_TIMEZONE,
  getBogotaToday,
  bogotaYmdToIso,
  getBogotaWeekRange,
  getBogotaMonthRange,
  computeDateRange,
  isDateInRange,
  validateDateRangeParams,
  formatBogotaDateDisplay,
  isoToBogotaYmd,
  buildCalendarDays
} from "../src/lib/loyalty-date";
import { LoyaltyService } from "../src/lib/loyalty.service";
import { fetchLoyaltySummary } from "../src/lib/loyalty-client";
import { GET } from "../src/app/api/loyalty/route";

const postgrestBase = "https://postgrest.test";

function jsonResponse(body: unknown, status = 200): Response {
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

describe("LOYALTY DATE FILTERING & TIMEZONE AWARENESS (AMERICA/BOGOTA)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.POSTGREST_BASE_URL = postgrestBase;
    process.env.SESSION_ME_ENDPOINT = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // 1. Default = Hoy en America/Bogota
  it("1. Calcula el día 'Hoy' en base a America/Bogota en tiempo de ejecución", () => {
    // 2026-09-29 at 02:00:00 UTC is 2026-09-28 at 21:00:00 in Bogota (UTC-5)
    const lateUtc = new Date("2026-09-29T02:00:00Z");
    const bogotaDay = getBogotaToday(lateUtc);
    expect(bogotaDay).toBe("2026-09-28");

    // 2026-09-29 at 05:00:00 UTC is exactly 2026-09-29 at 00:00:00 in Bogota
    const midnightUtc = new Date("2026-09-29T05:00:00Z");
    expect(getBogotaToday(midnightUtc)).toBe("2026-09-29");

    const range = computeDateRange("hoy", undefined, undefined, midnightUtc);
    expect(range.preset).toBe("hoy");
    expect(range.startDate).toBe("2026-09-29");
    expect(range.endDate).toBe("2026-09-29");
    expect(range.label).toContain("Hoy");
    expect(range.label).toContain("29 sep 2026");
  });

  // 2. Cambio de día en Bogota (medianoche UTC-5)
  it("2. Maneja el cambio de día en Bogota en la medianoche exacta UTC-5", () => {
    // Just before midnight: 23:59:59.999 in Bogota (04:59:59.999 UTC next calendar day)
    const justBeforeMidnight = new Date("2026-09-29T04:59:59.999Z");
    expect(getBogotaToday(justBeforeMidnight)).toBe("2026-09-28");

    // Exact midnight in Bogota: 00:00:00.000 in Bogota (05:00:00.000 UTC)
    const exactMidnight = new Date("2026-09-29T05:00:00.000Z");
    expect(getBogotaToday(exactMidnight)).toBe("2026-09-29");
  });

  // 3. Preset Ayer
  it("3. Preset 'Ayer' genera el día anterior completo [start, end) en Bogota", () => {
    const reference = new Date("2026-09-29T12:00:00-05:00");
    const range = computeDateRange("ayer", undefined, undefined, reference);

    expect(range.preset).toBe("ayer");
    expect(range.startDate).toBe("2026-09-28");
    expect(range.endDate).toBe("2026-09-28");
    expect(range.startIso).toBe(new Date("2026-09-28T00:00:00-05:00").toISOString());
    expect(range.endIso).toBe(new Date("2026-09-29T00:00:00-05:00").toISOString());
    expect(range.label).toContain("Ayer");
    expect(range.label).toContain("28 sep 2026");
  });

  // 4. Preset Esta semana (lunes a domingo)
  it("4. Preset 'Esta semana' abarca de lunes a domingo en Bogota", () => {
    // 2026-09-29 is Tuesday
    const tuesday = new Date("2026-09-29T15:00:00-05:00");
    const week = getBogotaWeekRange("2026-09-29");
    expect(week.mondayYmd).toBe("2026-09-28");
    expect(week.sundayYmd).toBe("2026-10-04");

    const range = computeDateRange("esta_semana", undefined, undefined, tuesday);
    expect(range.preset).toBe("esta_semana");
    expect(range.startDate).toBe("2026-09-28");
    expect(range.endDate).toBe("2026-10-04");
    expect(range.startIso).toBe(new Date("2026-09-28T00:00:00-05:00").toISOString());
    // endIso is next day exclusive (2026-10-05T00:00:00-05:00)
    expect(range.endIso).toBe(new Date("2026-10-05T00:00:00-05:00").toISOString());
    expect(range.label).toContain("Esta semana");
  });

  // 5. Preset Este mes
  it("5. Preset 'Este mes' abarca del 1 al último día del mes en Bogota", () => {
    const septemberDate = new Date("2026-09-15T10:00:00-05:00");
    const month = getBogotaMonthRange("2026-09-15");
    expect(month.firstDayYmd).toBe("2026-09-01");
    expect(month.lastDayYmd).toBe("2026-09-30");

    const range = computeDateRange("este_mes", undefined, undefined, septemberDate);
    expect(range.preset).toBe("este_mes");
    expect(range.startDate).toBe("2026-09-01");
    expect(range.endDate).toBe("2026-09-30");
    expect(range.startIso).toBe(new Date("2026-09-01T00:00:00-05:00").toISOString());
    expect(range.endIso).toBe(new Date("2026-10-01T00:00:00-05:00").toISOString());
    expect(range.label).toContain("Septiembre 2026");
  });

  // 6. Rango personalizado válido
  it("6. Rango personalizado genera intervalo semiabierto [startIso, endIso)", () => {
    const range = computeDateRange("personalizado", "2026-09-10", "2026-09-20");
    expect(range.preset).toBe("personalizado");
    expect(range.startDate).toBe("2026-09-10");
    expect(range.endDate).toBe("2026-09-20");
    expect(range.startIso).toBe(new Date("2026-09-10T00:00:00-05:00").toISOString());
    // endIso is start of next day (2026-09-21)
    expect(range.endIso).toBe(new Date("2026-09-21T00:00:00-05:00").toISOString());
    expect(range.label).toContain("10 sep 2026 - 20 sep 2026");
  });

  // 7. Rango personalizado invertido (desde > hasta) normalizado por computeDateRange
  it("7. computeDateRange normaliza rangos invertidos (desde > hasta)", () => {
    const range = computeDateRange("personalizado", "2026-09-25", "2026-09-20");
    expect(range.startDate).toBe("2026-09-20");
    expect(range.endDate).toBe("2026-09-25");
    expect(range.startIso).toBe(new Date("2026-09-20T00:00:00-05:00").toISOString());
    expect(range.endIso).toBe(new Date("2026-09-26T00:00:00-05:00").toISOString());
  });

  // 8. Filtrado de transacciones del ledger dentro del rango (límites semiabiertos)
  it("8. isDateInRange respeta rigurosamente el intervalo semiabierto [start, end)", () => {
    const range = computeDateRange("hoy", undefined, undefined, new Date("2026-09-29T10:00:00-05:00"));

    // Exactly at start boundary: 00:00:00-05:00 -> INCLUDED
    expect(isDateInRange("2026-09-29T00:00:00-05:00", range)).toBe(true);

    // Midday -> INCLUDED
    expect(isDateInRange("2026-09-29T14:30:00-05:00", range)).toBe(true);

    // 23:59:59.999 in Bogota -> INCLUDED
    expect(isDateInRange("2026-09-29T23:59:59.999-05:00", range)).toBe(true);

    // 00:00:00 of next day in Bogota -> EXCLUDED
    expect(isDateInRange("2026-09-30T00:00:00-05:00", range)).toBe(false);

    // Previous day 23:59:59 -> EXCLUDED
    expect(isDateInRange("2026-09-28T23:59:59-05:00", range)).toBe(false);

    // Null/undefined/invalid -> EXCLUDED
    expect(isDateInRange(null, range)).toBe(false);
    expect(isDateInRange("fecha_invalida", range)).toBe(false);
  });

  // 9. Filtrado de canjes dentro del rango
  it("9. Filtra redemptions verificando si caen en el período seleccionado", () => {
    const range = computeDateRange("hoy", undefined, undefined, new Date("2026-09-29T12:00:00-05:00"));

    const redemptions = [
      { id: 1, created_at: "2026-09-29T10:00:00-05:00" },
      { id: 2, created_at: "2026-09-28T22:00:00-05:00" }, // Yesterday
      { id: 3, created_at: "2026-09-29T18:45:00-05:00" }
    ];

    const filtered = redemptions.filter((r) => isDateInRange(r.created_at, range));
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.id)).toEqual([1, 3]);
  });

  // 10. Clientes participantes calculados sobre el período
  it("10. Clientes participantes se calculan como el conjunto único con eventos en el período", () => {
    const range = computeDateRange("hoy", undefined, undefined, new Date("2026-09-29T12:00:00-05:00"));

    const ledger = [
      { id: 1, cliente_id: 101, delta: 1, created_at: "2026-09-29T09:00:00-05:00" },
      { id: 2, cliente_id: 102, delta: 1, created_at: "2026-09-29T10:00:00-05:00" },
      { id: 3, cliente_id: 101, delta: 1, created_at: "2026-09-29T11:00:00-05:00" }, // Duplicate client
      { id: 4, cliente_id: 103, delta: 1, created_at: "2026-09-28T15:00:00-05:00" }  // Out of period
    ];

    const redemptions = [
      { id: 1, cliente_id: 104, created_at: "2026-09-29T12:00:00-05:00" },
      { id: 2, cliente_id: 102, created_at: "2026-09-29T13:00:00-05:00" }  // Already in ledger
    ];

    const periodLedger = ledger.filter((l) => isDateInRange(l.created_at, range));
    const periodRedemptions = redemptions.filter((r) => isDateInRange(r.created_at, range));

    const participantSet = new Set<number>();
    periodLedger.forEach((l) => participantSet.add(l.cliente_id));
    periodRedemptions.forEach((r) => participantSet.add(r.cliente_id));

    // Expected unique participants: 101, 102, 104 (total 3)
    expect(participantSet.size).toBe(3);
    expect(Array.from(participantSet).sort()).toEqual([101, 102, 104]);
  });

  // 11. Sellos emitidos/canjeados en el período calculados correctamente
  it("11. Calcula sellos emitidos (+delta) y canjeados (-delta) en el período", () => {
    const range = computeDateRange("hoy", undefined, undefined, new Date("2026-09-29T12:00:00-05:00"));

    const ledger = [
      { id: 1, delta: 2, tipo_movimiento: "acumulacion", created_at: "2026-09-29T09:00:00-05:00" },
      { id: 2, delta: 1, tipo_movimiento: "acumulacion", created_at: "2026-09-29T10:00:00-05:00" },
      { id: 3, delta: -8, tipo_movimiento: "canje", created_at: "2026-09-29T11:00:00-05:00" },
      { id: 4, delta: 5, tipo_movimiento: "acumulacion", created_at: "2026-09-28T12:00:00-05:00" } // Yesterday
    ];

    const periodLedger = ledger.filter((l) => isDateInRange(l.created_at, range));
    const emitted = periodLedger.filter((l) => l.delta > 0).reduce((sum, l) => sum + l.delta, 0);
    const redeemed = periodLedger.filter((l) => l.delta < 0).reduce((sum, l) => sum + Math.abs(l.delta), 0);

    expect(emitted).toBe(3);   // 2 + 1
    expect(redeemed).toBe(8);  // |-8|
  });

  // 12. Respeto estricto de barberia_id (multi-tenant no contaminado)
  it("12. LoyaltyService.getSummary propaga el filtro de fecha e incluye barberia_id", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/barberia_loyalty_config")) {
        return Promise.resolve(jsonResponse([{ barberia_id: 42, activo: true, sellos_requeridos: 8 }]));
      }
      if (url.includes("/loyalty_rewards")) {
        return Promise.resolve(jsonResponse([{ id: 1, barberia_id: 42, nombre: "Corte", costo_en_sellos: 8, activo: true }]));
      }
      if (url.includes("/v_loyalty_client_balance")) {
        return Promise.resolve(jsonResponse([{ barberia_id: 42, cliente_id: 5, saldo_sellos: 10, total_acumulaciones: 12, total_canjes: 1 }]));
      }
      if (url.includes("/loyalty_ledger")) {
        expect(url).toContain("barberia_id=eq.42");
        expect(url).toContain("created_at=gte.");
        expect(url).toContain("created_at=lt.");
        return Promise.resolve(jsonResponse([
          { id: 10, barberia_id: 42, cliente_id: 5, delta: 2, tipo_movimiento: "acumulacion", created_at: "2026-09-29T10:00:00Z" }
        ]));
      }
      if (url.includes("/loyalty_redemptions")) {
        expect(url).toContain("barberia_id=eq.42");
        expect(url).toContain("created_at=gte.");
        expect(url).toContain("created_at=lt.");
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes("/clientes_finales")) {
        return Promise.resolve(jsonResponse([{ id: 5, nombre: "Carlos Perez", telefono: "3001234567" }]));
      }
      return Promise.resolve(jsonResponse([]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const fromIso = "2026-09-29T05:00:00.000Z";
    const toIso = "2026-09-30T05:00:00.000Z";
    const summary = await LoyaltyService.getSummary(42, undefined, { from: fromIso, to: toIso });

    expect(summary.ok).toBe(true);
    expect(summary.periodo).toEqual({ from: fromIso, to: toIso });
    expect(summary.total_sellos_emitidos).toBe(2);
    expect(summary.total_canjes_realizados).toBe(0);
  });

  // 13. Preservación del filtro al invocar fetchLoyaltySummary con dateRange
  it("13. fetchLoyaltySummary envía from y to correctamente como query params", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      expect(url).toContain("barberia_id=42");
      expect(url).toContain("from=2026-09-29T05%3A00%3A00.000Z");
      expect(url).toContain("to=2026-09-30T05%3A00%3A00.000Z");
      return Promise.resolve(jsonResponse({ ok: true, config: null, rewards: [], balances: [], ledger: [], redemptions: [], total_sellos_emitidos: 0, total_canjes_realizados: 0 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchLoyaltySummary(42, {
      from: "2026-09-29T05:00:00.000Z",
      to: "2026-09-30T05:00:00.000Z"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // 14. Estado vacío si no hay movimientos en el rango
  it("14. Maneja estado vacío sin movimientos en el rango sin romper cálculos", () => {
    const range = computeDateRange("ayer", undefined, undefined, new Date("2026-09-29T12:00:00-05:00"));

    const emptyLedger: Array<{ id: number; cliente_id: number; delta: number; created_at: string }> = [];
    const emptyRedemptions: Array<{ id: number; cliente_id: number; created_at: string }> = [];

    const periodLedger = emptyLedger.filter((l) => isDateInRange(l.created_at, range));
    const periodRedemptions = emptyRedemptions.filter((r) => isDateInRange(r.created_at, range));

    const participantSet = new Set<number>();
    periodLedger.forEach((l) => participantSet.add(l.cliente_id));
    periodRedemptions.forEach((r) => participantSet.add(r.cliente_id));

    const emitted = periodLedger.filter((l) => l.delta > 0).reduce((sum, l) => sum + l.delta, 0);
    const redeemed = periodLedger.filter((l) => l.delta < 0).reduce((sum, l) => sum + Math.abs(l.delta), 0);

    expect(participantSet.size).toBe(0);
    expect(emitted).toBe(0);
    expect(redeemed).toBe(0);
    expect(periodRedemptions.length).toBe(0);
  });

  // 15. Configuración y catálogo intactos independientemente de la fecha
  it("15. Configuración y catálogo permanecen intactos independientemente del dateRange", async () => {
    const configData = { barberia_id: 1, activo: true, sellos_requeridos: 10, recompensa_default: "Corte" };
    const rewardsData = [
      { id: 1, barberia_id: 1, nombre: "Corte Gratis", costo_en_sellos: 10, activo: true },
      { id: 2, barberia_id: 1, nombre: "Lavado", costo_en_sellos: 5, activo: false }
    ];

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/barberia_loyalty_config")) return Promise.resolve(jsonResponse([configData]));
      if (url.includes("/loyalty_rewards")) return Promise.resolve(jsonResponse(rewardsData));
      if (url.includes("/v_loyalty_client_balance")) return Promise.resolve(jsonResponse([]));
      if (url.includes("/loyalty_ledger")) return Promise.resolve(jsonResponse([]));
      if (url.includes("/loyalty_redemptions")) return Promise.resolve(jsonResponse([]));
      if (url.includes("/clientes_finales")) return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse([]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const summary = await LoyaltyService.getSummary(1, undefined, {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z"
    });

    expect(summary.config?.activo).toBe(true);
    expect(summary.config?.sellos_requeridos).toBe(10);
    expect(summary.rewards).toHaveLength(2);
    expect(summary.rewards[0].nombre).toBe("Corte Gratis");
  });

  // 16. API rejection of invalid date ranges
  describe("16. Validación de parámetros en /api/loyalty GET", () => {
    it("Rechaza rango cuando 'from' es posterior a 'to' con status 400", async () => {
      const token = createJwt({ sub: 1, barberia_id: 1, role: "owner", exp: Math.floor(Date.now() / 1000) + 3600 });
      const req = new Request("http://localhost/api/loyalty?from=2026-09-30T00:00:00Z&to=2026-09-20T00:00:00Z", {
        headers: { Cookie: `ba_session=${token}` }
      });
      const res = await GET(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("rango_fechas_invalido");
      expect(data.message).toContain("no puede ser posterior");
    });

    it("Rechaza cuando se especifica 'from' sin 'to' con status 400", async () => {
      const token = createJwt({ sub: 1, barberia_id: 1, role: "owner", exp: Math.floor(Date.now() / 1000) + 3600 });
      const req = new Request("http://localhost/api/loyalty?from=2026-09-30T00:00:00Z", {
        headers: { Cookie: `ba_session=${token}` }
      });
      const res = await GET(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("rango_fechas_invalido");
      expect(data.message).toContain("'to' es obligatorio");
    });

    it("Rechaza fechas malformadas con status 400", async () => {
      const token = createJwt({ sub: 1, barberia_id: 1, role: "owner", exp: Math.floor(Date.now() / 1000) + 3600 });
      const req = new Request("http://localhost/api/loyalty?from=not-a-date&to=2026-09-30T00:00:00Z", {
        headers: { Cookie: `ba_session=${token}` }
      });
      const res = await GET(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("rango_fechas_invalido");
      expect(data.message).toContain("ISO válida");
    });

    it("Acepta rango válido y lo procesa correctamente", async () => {
      const token = createJwt({ sub: 1, barberia_id: 1, role: "owner", exp: Math.floor(Date.now() / 1000) + 3600 });
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/barberia_loyalty_config")) return Promise.resolve(jsonResponse([]));
        if (url.includes("/loyalty_rewards")) return Promise.resolve(jsonResponse([]));
        if (url.includes("/v_loyalty_client_balance")) return Promise.resolve(jsonResponse([]));
        if (url.includes("/loyalty_ledger")) return Promise.resolve(jsonResponse([]));
        if (url.includes("/loyalty_redemptions")) return Promise.resolve(jsonResponse([]));
        if (url.includes("/clientes_finales")) return Promise.resolve(jsonResponse([]));
        return Promise.resolve(jsonResponse([]));
      });
      vi.stubGlobal("fetch", fetchMock);

      const req = new Request("http://localhost/api/loyalty?from=2026-09-20T00:00:00Z&to=2026-09-30T00:00:00Z", {
        headers: { Cookie: `ba_session=${token}` }
      });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.periodo?.from).toBe("2026-09-20T00:00:00.000Z");
      expect(data.periodo?.to).toBe("2026-09-30T00:00:00.000Z");
    });
  });

  describe("17. Selección de día arbitrario en el calendario interactivo", () => {
    it("Permite seleccionar un solo día arbitrario (ej. 15 sep 2026) con intervalo exacto de 24h", () => {
      const singleDay = computeDateRange("personalizado", "2026-09-15", "2026-09-15");
      expect(singleDay.startDate).toBe("2026-09-15");
      expect(singleDay.endDate).toBe("2026-09-15");
      expect(singleDay.startIso).toBe("2026-09-15T05:00:00.000Z");
      expect(singleDay.endIso).toBe("2026-09-16T05:00:00.000Z");
      expect(singleDay.label).toBe("15 sep 2026");

      // Interval verification
      expect(isDateInRange("2026-09-15T00:00:00-05:00", singleDay)).toBe(true);
      expect(isDateInRange("2026-09-15T23:59:59.999-05:00", singleDay)).toBe(true);
      expect(isDateInRange("2026-09-16T00:00:00-05:00", singleDay)).toBe(false);
      expect(isDateInRange("2026-09-14T23:59:59-05:00", singleDay)).toBe(false);
    });

    it("BOGOTA_TIMEZONE es America/Bogota y bogotaYmdToIso convierte correctamente", () => {
      expect(BOGOTA_TIMEZONE).toBe("America/Bogota");
      expect(bogotaYmdToIso("2026-09-15", false)).toBe("2026-09-15T05:00:00.000Z");
      expect(bogotaYmdToIso("2026-09-15", true)).toBe("2026-09-16T05:00:00.000Z");
      expect(formatBogotaDateDisplay("2026-09-15")).toBe("15 sep 2026");
      expect(validateDateRangeParams("2026-09-15T05:00:00Z", "2026-09-16T05:00:00Z").valid).toBe(true);
    });
  });

  describe("18. Calendario civil dinámico, fuente de verdad y navegación", () => {
    it("isoToBogotaYmd convierte marcas temporales ISO a fecha YYYY-MM-DD en America/Bogota", () => {
      // 05:00 UTC = 00:00 en Colombia
      expect(isoToBogotaYmd("2026-09-15T05:00:00.000Z")).toBe("2026-09-15");
      // 04:59:59 UTC = 23:59:59 en Colombia del día anterior
      expect(isoToBogotaYmd("2026-09-15T04:59:59.000Z")).toBe("2026-09-14");
      // Marca temporal con offset explícito
      expect(isoToBogotaYmd("2026-09-28T22:00:00-05:00")).toBe("2026-09-28");
      // Entrada inválida
      expect(isoToBogotaYmd("invalido")).toBeNull();
    });

    it("buildCalendarDays calcula dinámicamente días bisiestos y longitudes de mes", () => {
      // Febrero 2024 (año bisiesto) -> 29 días reales
      const feb2024 = buildCalendarDays(2024, 1);
      const feb2024Days = feb2024.filter((c) => c.day !== null);
      expect(feb2024Days.length).toBe(29);
      expect(feb2024Days[28].day).toBe(29);
      expect(feb2024Days[28].ymd).toBe("2024-02-29");
      expect(feb2024.length % 7).toBe(0);

      // Febrero 2026 (no bisiesto) -> 28 días reales
      const feb2026 = buildCalendarDays(2026, 1);
      const feb2026Days = feb2026.filter((c) => c.day !== null);
      expect(feb2026Days.length).toBe(28);
      expect(feb2026.length % 7).toBe(0);

      // Septiembre 2026 (30 días)
      const sep2026 = buildCalendarDays(2026, 8);
      const sep2026Days = sep2026.filter((c) => c.day !== null);
      expect(sep2026Days.length).toBe(30);
      expect(sep2026.length % 7).toBe(0);

      // Octubre 2026 (31 días)
      const oct2026 = buildCalendarDays(2026, 9);
      const oct2026Days = oct2026.filter((c) => c.day !== null);
      expect(oct2026Days.length).toBe(31);
      expect(oct2026.length % 7).toBe(0);
    });

    it("Semántica de día operativo 28 septiembre 2026 produce [28 Sep 00:00, 29 Sep 00:00) exclusive", () => {
      const range = computeDateRange("personalizado", "2026-09-28", "2026-09-28");
      expect(range.startDate).toBe("2026-09-28");
      expect(range.endDate).toBe("2026-09-28");
      expect(range.startIso).toBe("2026-09-28T05:00:00.000Z");
      expect(range.endIso).toBe("2026-09-29T05:00:00.000Z");
      expect(range.label).toBe("28 sep 2026");

      expect(isDateInRange("2026-09-28T00:00:00-05:00", range)).toBe(true);
      expect(isDateInRange("2026-09-28T23:59:59.999-05:00", range)).toBe(true);
      expect(isDateInRange("2026-09-29T00:00:00-05:00", range)).toBe(false);
    });
  });
});
