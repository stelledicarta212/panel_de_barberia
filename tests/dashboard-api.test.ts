import { describe, expect, it } from "vitest";
import { normalizeMergedFromState } from "../src/lib/dashboard-api";

describe("normalizeMergedFromState appointments resolution", () => {
  it("resolves appointments from state root 'reservas'", () => {
    const rawState = {
      ok: true,
      reservas: [{ id: 1, fecha: "2026-07-10" }]
    };
    const normalized = normalizeMergedFromState(rawState as any);
    expect(normalized.appointments).toEqual([{ id: 1, fecha: "2026-07-10" }]);
  });

  it("resolves appointments from seed.reservas", () => {
    const rawState = {
      ok: true,
      seed: {
        reservas: [{ id: 2, fecha: "2026-07-11" }]
      }
    };
    const normalized = normalizeMergedFromState(rawState as any);
    expect(normalized.appointments).toEqual([{ id: 2, fecha: "2026-07-11" }]);
  });

  it("resolves appointments from draft.reservas", () => {
    const rawState = {
      ok: true,
      draft: {
        reservas: [{ id: 3, fecha: "2026-07-12" }]
      }
    };
    const normalized = normalizeMergedFromState(rawState as any);
    expect(normalized.appointments).toEqual([{ id: 3, fecha: "2026-07-12" }]);
  });

  it("resolves appointments from merged.reservas", () => {
    const rawState = {
      ok: true,
      merged: {
        reservas: [{ id: 4, fecha: "2026-07-13" }]
      }
    };
    const normalized = normalizeMergedFromState(rawState as any);
    expect(normalized.appointments).toEqual([{ id: 4, fecha: "2026-07-13" }]);
  });

  it("prioritizes merged.appointments over other keys", () => {
    const rawState = {
      ok: true,
      merged: {
        appointments: [{ id: 100 }],
        reservas: [{ id: 101 }]
      },
      draft: {
        appointments: [{ id: 102 }],
        reservas: [{ id: 103 }]
      },
      seed: {
        citas: [{ id: 104 }]
      },
      reservas: [{ id: 105 }]
    };
    const normalized = normalizeMergedFromState(rawState as any);
    expect(normalized.appointments).toEqual([{ id: 100 }]);
  });

  it("maintains compatibility with traditional 'citas' key in seed", () => {
    const rawState = {
      ok: true,
      seed: {
        citas: [{ id: 200 }]
      }
    };
    const normalized = normalizeMergedFromState(rawState as any);
    expect(normalized.appointments).toEqual([{ id: 200 }]);
  });

  it("maintains compatibility with 'appointments' key in draft", () => {
    const rawState = {
      ok: true,
      draft: {
        appointments: [{ id: 300 }]
      }
    };
    const normalized = normalizeMergedFromState(rawState as any);
    expect(normalized.appointments).toEqual([{ id: 300 }]);
  });
});
