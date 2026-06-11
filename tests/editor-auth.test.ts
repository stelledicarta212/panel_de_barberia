import { describe, expect, it } from "vitest";
import { resolvePayloadBarberiaId, resolvePayloadSlug } from "../src/app/api/editor/auth";

describe("editor tenant payload resolution", () => {
  it("reads tenant identity from root payload fields", () => {
    const payload = {
      barberia_id: 198,
      slug: "barberia-prueba-4"
    };

    expect(resolvePayloadBarberiaId(payload)).toBe(198);
    expect(resolvePayloadSlug(payload)).toBe("barberia-prueba-4");
  });

  it("reads tenant identity from nested p_payload fields", () => {
    const payload = {
      p_payload: {
        barberia_id: 198,
        slug: "barberia-prueba-4"
      }
    };

    expect(resolvePayloadBarberiaId(payload)).toBe(198);
    expect(resolvePayloadSlug(payload)).toBe("barberia-prueba-4");
  });

  it("keeps root payload identity authoritative when both root and p_payload exist", () => {
    const payload = {
      barberia_id: 198,
      slug: "barberia-prueba-4",
      p_payload: {
        barberia_id: 3,
        slug: "slug-ajeno"
      }
    };

    expect(resolvePayloadBarberiaId(payload)).toBe(198);
    expect(resolvePayloadSlug(payload)).toBe("barberia-prueba-4");
  });

  it("returns null when tenant identity is absent or invalid", () => {
    expect(resolvePayloadBarberiaId({ p_payload: { slug: "barberia-prueba-4" } })).toBeNull();
    expect(resolvePayloadSlug({ p_payload: { barberia_id: 198 } })).toBeNull();
  });
});
