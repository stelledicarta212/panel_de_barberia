import { readStorage, writeStorage } from "@/lib/storage";
import { env } from "@/lib/env";

const BARBERSHOP_ID_KEY = "ba_barberia_id";
const BARBERSHOP_SLUG_KEY = "ba_barberia_slug";
const LANDING_SEED_KEY = "ba_landing_seed";

type BarbershopIdentity = { id: string | null; slug: string | null };

function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseRaw(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readLandingSeed(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  const fromSession = parseRaw(window.sessionStorage.getItem(LANDING_SEED_KEY));
  const fromLocal = parseRaw(window.localStorage.getItem(LANDING_SEED_KEY));
  return fromSession ?? fromLocal;
}

export function resolveIdentityFromUrl(): BarbershopIdentity {
  if (typeof window === "undefined") return { id: null, slug: null };
  const params = new URLSearchParams(window.location.search || "");
  const slug = safeText(
    params.get("slug") ??
      params.get("barberia_slug") ??
      params.get("slug_barberia")
  );
  const id = safeText(
    params.get("barberia_id") ??
      params.get("id_barberia") ??
      params.get("id")
  );
  return { id: id || null, slug: slug || null };
}

export function resolveIdentityFromSeed(): BarbershopIdentity {
  const seed = readLandingSeed();
  const barberia = (seed?.barberia as Record<string, unknown>) ?? {};
  const id =
    safeText(String(seed?.barberia_id ?? "")) ||
    safeText(String(seed?.id_barberia ?? "")) ||
    safeText(String(seed?.id ?? "")) ||
    safeText(String(barberia.id ?? ""));
  const slug = safeText(seed?.slug) || safeText(barberia.slug);
  return {
    id: id || null,
    slug: slug || null
  };
}

export function setBarbershopContext(id: string, slug: string): void {
  writeStorage(BARBERSHOP_ID_KEY, id, "local");
  writeStorage(BARBERSHOP_ID_KEY, id, "session");
  writeStorage(BARBERSHOP_SLUG_KEY, slug, "local");
  writeStorage(BARBERSHOP_SLUG_KEY, slug, "session");
}

export function getBarbershopContext(): BarbershopIdentity {
  const idLocal = readStorage(BARBERSHOP_ID_KEY, "local");
  const idSession = readStorage(BARBERSHOP_ID_KEY, "session");
  const slugLocal = readStorage(BARBERSHOP_SLUG_KEY, "local");
  const slugSession = readStorage(BARBERSHOP_SLUG_KEY, "session");

  return {
    id: idLocal ?? idSession,
    slug: slugSession ?? slugLocal
  };
}

export function resolveBarbershopIdentity(): BarbershopIdentity {
  // Temporal: forzar foco del dashboard en barberia-58 (id 101).
  return {
    id: "101",
    slug: "barberia-58"
  };

  const fromUrl = resolveIdentityFromUrl();
  if (fromUrl.id || fromUrl.slug) return fromUrl;

  const fromStorage = getBarbershopContext();
  if (fromStorage.id || fromStorage.slug) return fromStorage;

  const fromSeed = resolveIdentityFromSeed();
  if (fromSeed.id || fromSeed.slug) return fromSeed;

  return {
    id: safeText(env.testBarberiaId) || "101",
    slug: safeText(env.testBarberiaSlug) || "barberia-58"
  };
}
