/* eslint-disable @typescript-eslint/no-explicit-any */
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

describe("normalizeMergedFromState URLs and QR resolution", () => {
  it("payload con public_url hidrata URL", () => {
    const rawState = {
      ok: true,
      published: {
        public_url: "https://barberagency.host/b/barberia-url"
      }
    };
    const normalized = normalizeMergedFromState(rawState as any);
    expect(normalized.public_landing_url).toBe("https://barberagency.host/b/barberia-url");
  });

  it("payload con landing_url hidrata URL", () => {
    const rawState = {
      ok: true,
      published: {
        landing_url: "https://barberagency.host/b/barberia-landing"
      }
    };
    const normalized = normalizeMergedFromState(rawState as any);
    expect(normalized.public_landing_url).toBe("https://barberagency.host/b/barberia-landing");
  });

  it("payload con qr_url hidrata QR", () => {
    const rawState = {
      ok: true,
      published: {
        qr_url: "https://quickchart.io/qr?text=1"
      }
    };
    const normalized = normalizeMergedFromState(rawState as any);
    expect(normalized.qr_url).toBe("https://quickchart.io/qr?text=1");
  });

  it("caso sin publicación mantiene los valores vacíos (mensaje 'Publica para generar el QR estable' en UI)", () => {
    const rawState = {
      ok: true
    };
    const normalized = normalizeMergedFromState(rawState as any);
    expect(normalized.public_landing_url).toBe("");
    expect(normalized.qr_url).toBe("");
  });

  it("resolves from alternate qr keys like qr_public_url or qr_image", () => {
    const rawState = {
      ok: true,
      published: {
        qr_image: "https://quickchart.io/qr?text=2"
      }
    };
    const normalized = normalizeMergedFromState(rawState as any);
    expect(normalized.qr_url).toBe("https://quickchart.io/qr?text=2");

    const rawState2 = {
      ok: true,
      published: {
        qr_public_url: "https://quickchart.io/qr?text=3"
      }
    };
    const normalized2 = normalizeMergedFromState(rawState2 as any);
    expect(normalized2.qr_url).toBe("https://quickchart.io/qr?text=3");
  });

  it("resolves public_url from raw.public_url or raw.public_landing_url", () => {
    const rawState = {
      ok: true,
      public_landing_url: "https://barberagency.host/b/barberia-raw"
    };
    const normalized = normalizeMergedFromState(rawState as any);
    expect(normalized.public_landing_url).toBe("https://barberagency.host/b/barberia-raw");
  });
});
