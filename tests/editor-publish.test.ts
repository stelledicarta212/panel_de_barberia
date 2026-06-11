import { describe, expect, it } from "vitest";
import { normalizePublishPayloadForUpstream } from "../src/app/api/editor/publish/route";

describe("editor publish upstream payload normalization", () => {
  it("promotes nested p_payload tenant fields to the root payload", () => {
    const normalized = normalizePublishPayloadForUpstream(
      {
        action: "publish",
        p_payload: {
          barberia_id: 198,
          slug: "barberia-prueba-4",
          landing: { theme: "dark" }
        }
      },
      { barberiaId: 198, slug: "barberia-prueba-4" }
    );

    expect(normalized.barberia_id).toBe(198);
    expect(normalized.p_barberia_id).toBe(198);
    expect(normalized.id_barberia).toBe(198);
    expect(normalized.slug).toBe("barberia-prueba-4");
    expect(normalized.biz_slug).toBe("barberia-prueba-4");
  });

  it("keeps p_payload while normalizing tenant identity inside it", () => {
    const normalized = normalizePublishPayloadForUpstream(
      {
        p_payload: {
          barberia_id: 198,
          slug: "barberia-prueba-4",
          landing: { hero: "ok" }
        }
      },
      { barberiaId: 198, slug: "barberia-prueba-4" }
    );

    expect(normalized.p_payload).toMatchObject({
      barberia_id: 198,
      p_barberia_id: 198,
      id_barberia: 198,
      slug: "barberia-prueba-4",
      biz_slug: "barberia-prueba-4",
      landing: { hero: "ok" }
    });
  });

  it("uses validated tenant identity over manipulated frontend values", () => {
    const normalized = normalizePublishPayloadForUpstream(
      {
        barberia_id: 999,
        slug: "slug-ajeno",
        p_payload: {
          barberia_id: 777,
          p_barberia_id: 777,
          id_barberia: 777,
          slug: "otro-slug",
          biz_slug: "otro-slug"
        }
      },
      { barberiaId: 198, slug: "barberia-prueba-4" }
    );

    expect(normalized.barberia_id).toBe(198);
    expect(normalized.p_barberia_id).toBe(198);
    expect(normalized.id_barberia).toBe(198);
    expect(normalized.slug).toBe("barberia-prueba-4");
    expect(normalized.biz_slug).toBe("barberia-prueba-4");
    expect(normalized.p_payload).toMatchObject({
      barberia_id: 198,
      p_barberia_id: 198,
      id_barberia: 198,
      slug: "barberia-prueba-4",
      biz_slug: "barberia-prueba-4"
    });
  });
});
