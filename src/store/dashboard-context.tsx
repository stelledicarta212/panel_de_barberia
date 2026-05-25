"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getDashboardState,
  normalizeMergedFromState,
  publishBarbershopViaRpc,
  saveLandingDraft
} from "@/lib/dashboard-api";
import { env } from "@/lib/env";
import { MOCK_MERGED } from "@/lib/mock-dashboard-data";
import {
  resolveBarbershopIdentity,
  setBarbershopContext
} from "@/lib/barbershop-context";
import type {
  DashboardIdentity,
  DashboardMerged,
  DashboardStateResponse,
  PublishResponse
} from "@/types/dashboard-state";
import { EMPTY_MERGED } from "@/types/dashboard-state";

type ScalarMergedKey = Exclude<keyof DashboardMerged, "services" | "barbers" | "hours">;
type CollectionMergedKey = Extract<keyof DashboardMerged, "services" | "barbers" | "hours">;
const DASHBOARD_MERGED_CACHE_PREFIX = "ba_dashboard_merged_cache";

function cacheKeyForIdentity(input: DashboardIdentity): string {
  const idPart = String(input.barberia_id ?? "no-id");
  const slugPart = String(input.slug ?? "no-slug");
  return `${DASHBOARD_MERGED_CACHE_PREFIX}:${idPart}:${slugPart}`;
}

function readMergedCache(input: DashboardIdentity): DashboardMerged | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKeyForIdentity(input));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return { ...EMPTY_MERGED, ...(parsed as Partial<DashboardMerged>) };
  } catch {
    return null;
  }
}

function writeMergedCache(input: DashboardIdentity, value: DashboardMerged) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKeyForIdentity(input), JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

type DashboardContextValue = {
  identity: DashboardIdentity | null;
  rawState: DashboardStateResponse | null;
  merged: DashboardMerged;
  loading: boolean;
  saving: boolean;
  publishing: boolean;
  error: string | null;
  message: string | null;
  refresh: () => Promise<void>;
  setField: (key: ScalarMergedKey, value: string) => void;
  setCollection: (key: CollectionMergedKey, value: Array<Record<string, unknown>>) => void;
  saveDraft: () => Promise<void>;
  publish: () => Promise<void>;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

function normalizeIdentity(input: { id: string | null; slug: string | null }): DashboardIdentity {
  const idNum = Number(input.id ?? 0);
  return {
    barberia_id: Number.isFinite(idNum) && idNum > 0 ? idNum : null,
    slug: input.slug?.trim() || null
  };
}

function pickIdentityFromPublishResponse(response: PublishResponse): DashboardIdentity | null {
  const idNum = Number(response.barberia_id ?? response.data?.barberia_id ?? 0);
  const slug = String(response.slug ?? response.data?.slug ?? "").trim();
  if (idNum > 0 || slug) {
    return {
      barberia_id: idNum > 0 ? idNum : null,
      slug: slug || null
    };
  }
  return null;
}

function getPublicBaseUrl(): string {
  const configured = String(env.publicBaseUrl || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin.replace(/\/+$/, "");
  return "";
}

function joinBaseAndPath(baseUrl: string, path: string): string {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  const rawPath = String(path || "").trim();
  if (!base || !rawPath) return "";
  return `${base}${rawPath.startsWith("/") ? rawPath : `/${rawPath}`}`;
}

function mapPublishError(errorCode: string): string {
  switch (errorCode) {
    case "barberia_no_encontrada":
      return "No se encontró la barbería para publicar.";
    case "falta_nombre_barberia":
      return "Falta el nombre de la barbería.";
    case "faltan_servicios_activos":
      return "Debes tener al menos un servicio activo para publicar.";
    case "faltan_barberos_activos":
      return "Debes tener al menos un barbero activo para publicar.";
    default:
      return "No se pudo publicar la barbería.";
  }
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<DashboardIdentity | null>(() => {
    const resolved = normalizeIdentity(resolveBarbershopIdentity());
    return resolved.barberia_id || resolved.slug ? resolved : null;
  });
  const [rawState, setRawState] = useState<DashboardStateResponse | null>(null);
  const [merged, setMerged] = useState<DashboardMerged>(() =>
    env.disableRemoteFetch ? { ...MOCK_MERGED } : EMPTY_MERGED
  );
  const [loading, setLoading] = useState<boolean>(() => Boolean(identity));
  const [saving, setSaving] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(() =>
    identity ? null : "No se encontro identidad en URL/storage/seed."
  );
  const [message, setMessage] = useState<string | null>(null);

  const loadState = useCallback(async (incoming: DashboardIdentity) => {
    if (env.disableRemoteFetch) {
      setLoading(false);
      setError(null);
      setMessage(null);
      setMerged((prev) => ({
        ...MOCK_MERGED,
        ...prev,
        biz_slug: prev.biz_slug || incoming.slug || MOCK_MERGED.biz_slug
      }));
      return;
    }

    if (!incoming.barberia_id && !incoming.slug) {
      setLoading(false);
      setError("No hay identidad de barberia (id/slug).");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await getDashboardState({
        barberia_id: incoming.barberia_id,
        slug: incoming.slug
      });
      const normalized = normalizeMergedFromState(response);
      const apiIdentity = response.identity;
      const effectiveIdentity: DashboardIdentity = {
        barberia_id: apiIdentity?.barberia_id ?? incoming.barberia_id,
        slug: apiIdentity?.slug ?? incoming.slug
      };

      if (effectiveIdentity.barberia_id || effectiveIdentity.slug) {
        setBarbershopContext(
          String(effectiveIdentity.barberia_id ?? ""),
          String(effectiveIdentity.slug ?? "")
        );
      }

      setIdentity(effectiveIdentity);
      setRawState(response);
      setMerged(normalized);
      writeMergedCache(effectiveIdentity, normalized);
      const nextMessage = String(response.message ?? "").trim();
      setMessage(nextMessage.toLowerCase().startsWith("fallback:") ? null : (nextMessage || null));
    } catch {
      const fallback = readMergedCache(incoming);
      const fallbackMerged = fallback ?? {
        ...MOCK_MERGED,
        biz_slug: incoming.slug || MOCK_MERGED.biz_slug
      };
      setMerged(fallbackMerged);
      setError(null);
      setMessage(
        "No se pudo cargar estado remoto (temporal). Mostrando datos guardados para continuar."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!identity) return;
    const timer = window.setTimeout(() => {
      loadState(identity).catch(() => {
        // handled in loadState
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [identity, loadState]);

  const refresh = useCallback(async () => {
    if (!identity) return;
    if (env.disableRemoteFetch) {
      setMessage(null);
      return;
    }
    await loadState(identity);
  }, [identity, loadState]);

  const saveDraftAction = useCallback(async () => {
    if (!identity) {
      setError("No hay identidad para guardar.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        barberia_id: identity.barberia_id,
        slug: identity.slug,
        draft_seed_barberia_id: identity.barberia_id ?? 0,
        draft_seed_slug: identity.slug ?? "",
        ...merged,
        runtimePublishData: {
          public_landing_url: merged.public_landing_url,
          reservation_url: merged.reservation_url,
          qr_url: merged.qr_url
        },
        source: "dashboard"
      };
      const response = await saveLandingDraft(payload);
      setRawState((prev) => ({
        ...(prev ?? { ok: true }),
        draft: payload
      }));
      setMessage(String(response.message ?? "Borrador guardado."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar borrador");
    } finally {
      setSaving(false);
    }
  }, [identity, merged]);

  const publishAction = useCallback(async () => {
    if (!identity) {
      setError("No hay identidad para publicar.");
      return;
    }
    if (!identity.barberia_id) {
      setError("No hay barberia_id para publicar.");
      return;
    }

    setPublishing(true);
    setError(null);
    try {
      const response = await publishBarbershopViaRpc(identity.barberia_id);
      const ok = response.ok === true || response.success === true;
      if (!ok) {
        throw new Error(mapPublishError(String(response.error || "").trim()));
      }
      const nextIdentity = pickIdentityFromPublishResponse(response);
      const baseUrl = getPublicBaseUrl();
      const publicLandingUrl = joinBaseAndPath(baseUrl, String(response.public_path || ""));
      const qrTargetUrl = joinBaseAndPath(baseUrl, String(response.qr_path || ""));
      const qrImageUrl = qrTargetUrl
        ? `https://quickchart.io/qr?size=320&margin=2&text=${encodeURIComponent(qrTargetUrl)}`
        : "";

      const nextMerged: DashboardMerged = {
        ...merged,
        public_landing_url: publicLandingUrl || merged.public_landing_url,
        reservation_url: publicLandingUrl ? `${publicLandingUrl}#reservas` : merged.reservation_url,
        qr_url: qrImageUrl || merged.qr_url
      };

      setMerged(nextMerged);
      setRawState((prev) => ({
        ...(prev ?? { ok: true }),
        published: {
          ...(prev?.published ?? {}),
          public_landing_url: nextMerged.public_landing_url,
          reservation_url: nextMerged.reservation_url,
          qr_url: nextMerged.qr_url,
          template_id: nextMerged.template_id,
          qr_code: response.qr_code,
          qr_path: response.qr_path,
          public_path: response.public_path
        }
      }));
      setMessage("Landing publicada correctamente.");

      if (nextIdentity) {
        setIdentity(nextIdentity);
        setBarbershopContext(String(nextIdentity.barberia_id ?? ""), String(nextIdentity.slug ?? ""));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo publicar");
    } finally {
      setPublishing(false);
    }
  }, [identity, merged]);

  const value = useMemo<DashboardContextValue>(() => ({
    identity,
    rawState,
    merged,
    loading,
    saving,
    publishing,
    error,
    message,
    refresh,
    setField: (key, value) => {
      setMerged((prev) => ({ ...prev, [key]: value }));
    },
    setCollection: (key, value) => {
      setMerged((prev) => ({ ...prev, [key]: value }));
    },
    saveDraft: saveDraftAction,
    publish: publishAction
  }), [
    error,
    identity,
    refresh,
    loading,
    merged,
    message,
    publishAction,
    publishing,
    rawState,
    saveDraftAction,
    saving
  ]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard debe usarse dentro de DashboardProvider");
  }
  return context;
}
