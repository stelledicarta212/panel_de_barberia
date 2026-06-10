import { readStorage, removeStorage, writeStorage } from "@/lib/storage";

const LEGACY_TEST_ID = "101";
const LEGACY_TEST_SLUG = "barberia-58";

export type BarbershopIdentity = { id: string | null; slug: string | null };

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

function cacheKeyForUser(userId: string | number): string {
  return `ba_barberia_identity:${userId}`;
}

export function setBarbershopContext(userId: string | number | null | undefined, id: string, slug: string): void {
  if (!userId) return; // Rule 4: If no user_id yet, do not save context
  const key = cacheKeyForUser(userId);
  const data = JSON.stringify({ id, slug });
  writeStorage(key, data, "local");
  writeStorage(key, data, "session");
}

export function getBarbershopContext(userId: string | number | null | undefined): BarbershopIdentity {
  if (!userId) return { id: null, slug: null };
  const key = cacheKeyForUser(userId);
  const localVal = readStorage(key, "local");
  const sessionVal = readStorage(key, "session");
  const parsed = parseRaw(sessionVal ?? localVal);
  return {
    id: parsed ? safeText(parsed.id) || null : null,
    slug: parsed ? safeText(parsed.slug) || null : null
  };
}

export function clearBarbershopContext(userId: string | number | null | undefined): void {
  if (!userId) return;
  const key = cacheKeyForUser(userId);
  removeStorage(key, "local");
  removeStorage(key, "session");
}

function clearLegacyTestIdentity(userId?: string | number | null | undefined): void {
  if (!userId) return;
  const current = getBarbershopContext(userId);
  if (current.id !== LEGACY_TEST_ID && current.slug !== LEGACY_TEST_SLUG) return;
  clearBarbershopContext(userId);
}

export function resolveBarbershopIdentity(userId?: string | number | null | undefined): BarbershopIdentity {
  const fromUrl = resolveIdentityFromUrl();
  if (fromUrl.id || fromUrl.slug) return fromUrl;

  if (userId) {
    clearLegacyTestIdentity(userId);
  }

  // localStorage/sessionStorage are UX cache only. They must never resolve
  // the final private tenant identity; session/me owns that decision.
  return { id: null, slug: null };
}

