"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getDashboardState,
  loginDashboard,
  normalizeMergedFromState,
  publishBarbershopViaRpc,
  saveLandingDraft
} from "@/lib/dashboard-api";
import { env } from "@/lib/env";
import { MOCK_MERGED } from "@/lib/mock-dashboard-data";
import {
  setBarbershopContext,
  resolveIdentityFromUrl,
  clearBarbershopContext
} from "@/lib/barbershop-context";
import { NO_PERMISSIONS, resolveDashboardAccess, resolveLoginAccess } from "@/lib/dashboard-access";
import { getSessionMe } from "@/lib/session-me";
import type {
  DashboardIdentity,
  DashboardLoginSession,
  DashboardMerged,
  DashboardStateResponse,
  DashboardUserAccess,
  PublishResponse
} from "@/types/dashboard-state";
import { EMPTY_MERGED } from "@/types/dashboard-state";

type CollectionMergedKey = Extract<keyof DashboardMerged, "services" | "barbers" | "hours" | "clients" | "appointments" | "descansos">;
type ScalarMergedKey = Exclude<keyof DashboardMerged, CollectionMergedKey>;
const DASHBOARD_SESSION_PREFIX = "ba_dashboard_session";

type DashboardContextValue = {
  identity: DashboardIdentity | null;
  rawState: DashboardStateResponse | null;
  access: DashboardUserAccess;
  session: DashboardLoginSession | null;
  isAuthenticated: boolean;
  merged: DashboardMerged;
  loading: boolean;
  saving: boolean;
  publishing: boolean;
  error: string | null;
  message: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setField: (key: ScalarMergedKey, value: string) => void;
  setCollection: (key: CollectionMergedKey, value: Array<Record<string, unknown>>) => void;
  saveDraft: () => Promise<void>;
  publish: () => Promise<void>;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

const LOCKED_ACCESS: DashboardUserAccess = {
  user_id: null,
  role: "guest",
  permissions: NO_PERMISSIONS,
  barber_id: null,
  source: "locked"
};

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

function sessionKeyForIdentity(input: DashboardIdentity): string {
  const idPart = String(input.barberia_id ?? "no-id");
  const slugPart = String(input.slug ?? "no-slug");
  return `${DASHBOARD_SESSION_PREFIX}:${idPart}:${slugPart}`;
}

function readLoginSession(input: DashboardIdentity | null): DashboardLoginSession | null {
  if (typeof window === "undefined" || !input) return null;
  try {
    const raw = window.localStorage.getItem(sessionKeyForIdentity(input));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardLoginSession;
    if (!parsed?.identity || !parsed?.access?.permissions) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLoginSession(value: DashboardLoginSession) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(sessionKeyForIdentity(value.identity), JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

function clearLoginSession(input: DashboardIdentity | null) {
  if (typeof window === "undefined" || !input) return;
  try {
    window.localStorage.removeItem(sessionKeyForIdentity(input));
  } catch {
    // ignore storage errors
  }
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<DashboardIdentity | null>(null);
  const [rawState, setRawState] = useState<DashboardStateResponse | null>(null);
  const [merged, setMerged] = useState<DashboardMerged>(() =>
    env.disableRemoteFetch ? { ...MOCK_MERGED } : EMPTY_MERGED
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [session, setSession] = useState<DashboardLoginSession | null>(null);
  
  const fallbackAccess = useMemo(() => resolveDashboardAccess(rawState), [rawState]);
  const access = session?.access ?? (session ? fallbackAccess : LOCKED_ACCESS);
  const isAuthenticated = Boolean(session?.access?.user_id);

  // Mount effect to check session and resolve/validate identity
  useEffect(() => {
    async function initSession() {
      if (env.disableRemoteFetch) {
        setIdentity({
          barberia_id: Number(env.testBarberiaId) || 101,
          slug: env.testBarberiaSlug || "barberia-58"
        });
        setLoading(false);
        return;
      }
      
      setLoading(true);
      setError(null);
      try {
        const sessionMe = await getSessionMe();
        const fromUrl = normalizeIdentity(resolveIdentityFromUrl());

        if (!sessionMe.ok) {
          setSession(null);
          if (fromUrl.barberia_id || fromUrl.slug) {
            setIdentity(fromUrl);
            setError(null);
          } else {
            setIdentity(null);
            setError("Falta identidad de barbería para iniciar sesión.");
          }
          setLoading(false);
          return;
        }

        const userBarberias = sessionMe.barberias ?? [];
        let activeIdentity: DashboardIdentity | null = null;

        if (fromUrl.barberia_id || fromUrl.slug) {
          // Validate the URL parameters against the user's barberias list
          const matched = userBarberias.find(b => {
            if (fromUrl.barberia_id && fromUrl.slug) {
              return Number(b.id) === fromUrl.barberia_id && b.slug === fromUrl.slug;
            }
            if (fromUrl.barberia_id) {
              return Number(b.id) === fromUrl.barberia_id;
            }
            if (fromUrl.slug) {
              return b.slug === fromUrl.slug;
            }
            return false;
          });

          if (matched) {
            activeIdentity = {
              barberia_id: Number(matched.id),
              slug: matched.slug
            };
          } else {
            // Mismatch or unauthorized! Return 403 visual error and stop.
            setSession(null);
            // Preservar la identidad candidata de la URL para permitir re-autenticación
            setIdentity(fromUrl);
            setError("403 - No tienes permisos para acceder a esta barbería.");
            setLoading(false);
            return;
          }
        } else {
          // No URL identity, check sessionMe for current_barberia
          if (sessionMe.current_barberia) {
            activeIdentity = {
              barberia_id: Number(sessionMe.current_barberia.id),
              slug: sessionMe.current_barberia.slug
            };
          } else if (userBarberias.length > 0) {
            setSession(null);
            setIdentity(null);
            setError("Por favor, selecciona una barbería para continuar.");
            setLoading(false);
            return;
          } else {
            setSession(null);
            setIdentity(null);
            setError("No tienes ninguna barbería asociada.");
            setLoading(false);
            return;
          }
        }

        if (activeIdentity) {
          // Cache the resolved context strictly for UX
          const userId = (sessionMe.user_id as string | number | undefined) ?? (sessionMe.user?.id as string | number | undefined);
          setBarbershopContext(
            userId,
            String(activeIdentity.barberia_id),
            String(activeIdentity.slug)
          );
          setIdentity(activeIdentity);

          const resolvedRole = (sessionMe.role ?? sessionMe.current_barberia?.role ?? null);
          const sessionData: DashboardLoginSession = {
            user: sessionMe.user ?? {
              id: sessionMe.user_id,
              email: sessionMe.email,
              nombre: sessionMe.nombre,
              apellido: sessionMe.apellido
            },
            identity: activeIdentity,
            access: {
              ...resolveLoginAccess({
                user: sessionMe.user ?? {
                  id: sessionMe.user_id,
                  email: sessionMe.email,
                  nombre: sessionMe.nombre,
                  apellido: sessionMe.apellido
                },
                role: resolvedRole,
                permissions: sessionMe.permissions
              }),
              source: "session_me"
            }
          };

          setSession(sessionData);
        }
      } catch (err) {
        console.error("Error initializing session:", err);
        setError("Error al conectar con el servidor de autenticación.");
        setSession(null);
        setIdentity(null);
      } finally {
        setLoading(false);
      }
    }

    initSession();
  }, []);

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
        const userId = session?.access?.user_id ?? (session?.user?.id as string | number | undefined);
        setBarbershopContext(
          userId,
          String(effectiveIdentity.barberia_id ?? ""),
          String(effectiveIdentity.slug ?? "")
        );
      }

      setIdentity(effectiveIdentity);
      setSession((prev) => prev ?? readLoginSession(effectiveIdentity));
      setRawState(response);
      setMerged(normalized);
      const nextMessage = String(response.message ?? "").trim();
      setMessage(nextMessage.toLowerCase().startsWith("fallback:") ? null : (nextMessage || null));
    } catch (cause) {
      console.error("Error loading dashboard state:", cause);
      setMerged(EMPTY_MERGED);
      setError("No se pudo cargar la fuente de verdad.");
      setMessage(null);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!identity || !session) return;
    const timer = window.setTimeout(() => {
      loadState(identity).catch(() => {
        // handled in loadState
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [identity, session, loadState]);

  const refresh = useCallback(async () => {
    if (!identity) return;
    if (env.disableRemoteFetch) {
      setMessage(null);
      return;
    }
    await loadState(identity);
  }, [identity, loadState]);

  const loginAction = useCallback(async (email: string, password: string) => {
    if (!identity || (!identity.barberia_id && !identity.slug)) {
      setError("Falta identidad de barbería para iniciar sesión.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await loginDashboard({ identity, email, password });
      if (!response.ok) {
        throw new Error(String(response.message || "No se pudo iniciar sesion."));
      }
      const sessionMe = await getSessionMe();
      if (!sessionMe.ok) {
        throw new Error(String(sessionMe.message || "No se pudo validar la sesion."));
      }
      const nextIdentity: DashboardIdentity | null = sessionMe.current_barberia
        ? {
            barberia_id: Number(sessionMe.current_barberia.id),
            slug: sessionMe.current_barberia.slug
          }
        : response.identity ?? null;
      if (!nextIdentity?.barberia_id || !nextIdentity.slug) {
        throw new Error("No se pudo resolver la barberia activa.");
      }
      const nextSession: DashboardLoginSession = {
        user: sessionMe.user ?? response.user ?? {},
        identity: nextIdentity,
        access: resolveLoginAccess({
          user: sessionMe.user ?? response.user,
          role: sessionMe.role ?? sessionMe.current_barberia?.role ?? response.role,
          permissions: sessionMe.permissions ?? response.permissions
        })
      };
      const nextUserId = (sessionMe.user_id as string | number | undefined) ?? (sessionMe.user?.id as string | number | undefined) ?? (response.user?.id as string | number | undefined);
      setBarbershopContext(nextUserId, String(nextIdentity.barberia_id), String(nextIdentity.slug));
      writeLoginSession(nextSession);
      setSession(nextSession);
      setIdentity(nextIdentity);
      setError(null);
      setMessage("Sesion iniciada correctamente.");
    } catch (cause) {
      setSession(null);
      clearLoginSession(identity);
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar sesion.");
    } finally {
      setSaving(false);
    }
  }, [identity]);

  const logoutAction = useCallback(() => {
    const userId = session?.access?.user_id ?? (session?.user?.id as string | number | undefined);
    clearBarbershopContext(userId);
    clearLoginSession(identity);
    setSession(null);
    setMessage(null);
  }, [identity, session]);

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
      const response = await publishBarbershopViaRpc(identity, merged);
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
        const userId = session?.access?.user_id ?? (session?.user?.id as string | number | undefined);
        setBarbershopContext(userId, String(nextIdentity.barberia_id ?? ""), String(nextIdentity.slug ?? ""));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo publicar");
    } finally {
      setPublishing(false);
    }
  }, [identity, merged, session]);

  const value = useMemo<DashboardContextValue>(() => ({
    identity,
    rawState,
    access,
    session,
    isAuthenticated,
    merged,
    loading,
    saving,
    publishing,
    error,
    message,
    login: loginAction,
    logout: logoutAction,
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
    access,
    session,
    isAuthenticated,
    loginAction,
    logoutAction,
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
