import { apiGetJson, apiPostJson } from "@/lib/api";
import { env } from "@/lib/env";
import type {
  DashboardIdentity,
  DashboardLoginResponse,
  DashboardMerged,
  DashboardStateResponse,
  DraftSaveResponse,
  IdentityInput,
  PublishResponse
} from "@/types/dashboard-state";
import { EMPTY_MERGED } from "@/types/dashboard-state";

function ensureArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function pickFirstArray(...values: unknown[]): Array<Record<string, unknown>> {
  for (const value of values) {
    const arr = ensureArray(value);
    if (arr.length) return arr;
  }
  return [];
}

function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeKey(value: unknown): string {
  const raw = String(value ?? "").trim();
  return raw;
}

function normalizeIdentity(identity?: IdentityInput): DashboardIdentity {
  const idNum = Number(identity?.barberia_id ?? 0);
  return {
    barberia_id: Number.isFinite(idNum) && idNum > 0 ? idNum : null,
    slug: safeText(identity?.slug) || null
  };
}

function pickFirstText(...values: unknown[]): string {
  for (const value of values) {
    const current = safeText(value);
    if (current) return current;
  }
  return "";
}

async function getPublicProfile(identity: IdentityInput): Promise<Record<string, unknown> | null> {
  const normalized = normalizeIdentity(identity);
  const path = normalized.barberia_id
    ? `/barberia_public_profiles?select=*&barberia_id=eq.${encodeURIComponent(String(normalized.barberia_id))}&limit=1`
    : normalized.slug
      ? `/barberia_public_profiles?select=*&slug=eq.${encodeURIComponent(normalized.slug)}&limit=1`
      : "";
  if (!path) return null;
  try {
    const rows = await apiGetJson<Array<Record<string, unknown>>>(path);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

function mergeStateWithPublicProfile(
  state: DashboardStateResponse,
  profile: Record<string, unknown> | null
): DashboardStateResponse {
  if (!profile) return state;
  const profileMerged: Partial<DashboardMerged> = {
    biz_name: safeText(profile.nombre_publico),
    biz_slug: safeText(profile.slug),
    address: safeText(profile.direccion),
    maps_url: safeText(profile.maps_url),
    logo_url: safeText(profile.logo_url),
    cover_url: safeText(profile.cover_url),
    public_landing_url: safeText(profile.public_landing_url),
    reservation_url: safeText(profile.reservation_url),
    qr_url: safeText(profile.qr_url)
  };
  return {
    ...state,
    identity: {
      barberia_id: Number(profile.barberia_id) > 0 ? Number(profile.barberia_id) : state.identity?.barberia_id ?? null,
      slug: safeText(profile.slug) || state.identity?.slug || null
    },
    published: {
      ...(state.published ?? {}),
      ...profileMerged
    },
    merged: {
      ...(state.merged ?? {}),
      ...profileMerged
    }
  };
}

function normalizeRpcJsonb<T extends Record<string, unknown>>(raw: unknown): T {
  if (!raw || typeof raw !== "object") return {} as T;
  const obj = raw as Record<string, unknown>;
  const firstValue = Object.values(obj)[0];
  if (firstValue && typeof firstValue === "object" && !Array.isArray(firstValue)) {
    const firstObj = firstValue as Record<string, unknown>;
    if ("ok" in firstObj || "error" in firstObj || "public_path" in firstObj || "redirect_path" in firstObj) {
      return firstObj as T;
    }
  }
  return obj as T;
}

async function safeGetArray(path: string): Promise<Array<Record<string, unknown>>> {
  try {
    const rows = await apiGetJson<Array<Record<string, unknown>>>(path);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function buildIdentityQuery(identity: IdentityInput): string {
  const normalized = normalizeIdentity(identity);
  if (normalized.slug) {
    return `slug=${encodeURIComponent(normalized.slug)}`;
  }
  if (normalized.barberia_id) {
    return `barberia_id=${encodeURIComponent(String(normalized.barberia_id))}`;
  }
  return "";
}

export function normalizeMergedFromState(raw: DashboardStateResponse): DashboardMerged {
  const seed = raw.seed ?? {};
  const draft = raw.draft ?? {};
  const published = raw.published ?? {};
  const merged = raw.merged ?? {};

  return {
    ...EMPTY_MERGED,
    biz_name: pickFirstText(merged.biz_name, draft["biz_name"], seed["nombre"], seed["biz_name"]),
    biz_slug: pickFirstText(merged.biz_slug, draft["biz_slug"], seed["slug"], seed["biz_slug"]),
    address: pickFirstText(merged.address, draft["address"], seed["direccion"], seed["address"]),
    maps_url: pickFirstText(merged.maps_url, draft["maps_url"], seed["maps_url"]),
    palette_primary: pickFirstText(merged.palette_primary, draft["palette_primary"]) || EMPTY_MERGED.palette_primary,
    palette_secondary:
      pickFirstText(merged.palette_secondary, draft["palette_secondary"]) || EMPTY_MERGED.palette_secondary,
    palette_accent: pickFirstText(merged.palette_accent, draft["palette_accent"]) || EMPTY_MERGED.palette_accent,
    palette_text: pickFirstText(merged.palette_text, draft["palette_text"]) || EMPTY_MERGED.palette_text,
    logo_url: pickFirstText(merged.logo_url, draft["logo_url"], seed["logo_url"]),
    cover_url: pickFirstText(merged.cover_url, draft["cover_url"], seed["cover_url"]),
    hero_title: pickFirstText(merged.hero_title, draft["hero_title"]),
    hero_subtitle: pickFirstText(merged.hero_subtitle, draft["hero_subtitle"]),
    template_id: pickFirstText(merged.template_id, draft["template_id"], published["template_id"]) || "v7",
    public_landing_url: pickFirstText(
      merged.public_landing_url,
      draft["public_landing_url"],
      published["public_landing_url"]
    ),
    reservation_url: pickFirstText(
      merged.reservation_url,
      draft["reservation_url"],
      published["reservation_url"],
      published["url_reservas"]
    ),
    qr_url: pickFirstText(merged.qr_url, draft["qr_url"], published["qr_url"]),
    services: pickFirstArray(
      merged.services,
      draft["services"],
      draft["servicios"],
      (draft["inherited"] as Record<string, unknown> | undefined)?.["servicios"],
      seed["servicios"],
      seed["services"],
      (seed["inherited"] as Record<string, unknown> | undefined)?.["servicios"]
    ),
    barbers: pickFirstArray(
      merged.barbers,
      draft["barbers"],
      draft["barberos"],
      (draft["inherited"] as Record<string, unknown> | undefined)?.["barberos"],
      seed["barberos"],
      seed["barbers"],
      (seed["inherited"] as Record<string, unknown> | undefined)?.["barberos"]
    ),
    hours: pickFirstArray(
      merged.hours,
      draft["hours"],
      draft["horarios"],
      (draft["inherited"] as Record<string, unknown> | undefined)?.["horarios"],
      seed["horarios"],
      seed["hours"],
      (seed["inherited"] as Record<string, unknown> | undefined)?.["horarios"]
    ),
    clients: pickFirstArray(merged.clients, draft["clients"], draft["clientes"], seed["clientes"], seed["clients"]),
    appointments: pickFirstArray(
      merged.appointments,
      draft["appointments"],
      draft["citas"],
      seed["citas"],
      seed["appointments"]
    )
  };
}

export async function getDashboardState(identity: IdentityInput): Promise<DashboardStateResponse> {
  const query = buildIdentityQuery(identity);
  if (!query) {
    return { ok: false, message: "Falta identidad de barberia" };
  }
  if (!String(env.apiBaseUrl || "").trim()) {
    return {
      ok: false,
      message: "Falta configurar NEXT_PUBLIC_API_BASE_URL o NEXT_PUBLIC_API_URL en .env.local"
    };
  }
  const path = `${env.dashboardStateEndpoint}?${query}`;
  try {
    const response = await apiGetJson<DashboardStateResponse>(path);
    const responseIdentity = response.identity ?? normalizeIdentity(identity);
    const profile = await getPublicProfile(responseIdentity);
    return mergeStateWithPublicProfile(response, profile);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Error consultando dashboard/state";
    const fallbackBySlug = normalizeIdentity(identity).slug;
    const fallbackById = normalizeIdentity(identity).barberia_id;

    const row = (await getPublicProfile({ barberia_id: fallbackById, slug: fallbackBySlug })) ?? {};
    const id = Number(row?.barberia_id || fallbackById || 0);
    const slug = safeText(row?.slug) || fallbackBySlug || "";
    const safeId = id > 0 ? id : 0;

    const servicesRows = safeId
      ? await safeGetArray(`/servicios?select=*&barberia_id=eq.${encodeURIComponent(String(safeId))}`)
      : [];

    let barbersRows = safeId
      ? await safeGetArray(`/barberos?select=*&barberia_id=eq.${encodeURIComponent(String(safeId))}`)
      : [];
    const clientsRows = safeId
      ? await safeGetArray(`/clientes_finales?select=*&barberia_id=eq.${encodeURIComponent(String(safeId))}&order=id.desc`)
      : [];
    const appointmentsRows = safeId
      ? await safeGetArray(`/citas?select=*&barberia_id=eq.${encodeURIComponent(String(safeId))}&order=fecha.desc,hora_inicio.desc`)
      : [];
    const servicesById = new Map(servicesRows.map((item) => [safeKey(item.id), item]));
    const barbersById = new Map(barbersRows.map((item) => [safeKey(item.id), item]));
    const appointmentsWithLabels = appointmentsRows.map((item) => {
      const service = servicesById.get(safeKey(item.servicio_id));
      const barber = barbersById.get(safeKey(item.barbero_id));
      return {
        ...item,
        servicio_nombre: safeText(item.servicio_nombre) || safeText(service?.nombre ?? service?.name),
        barbero_nombre: safeText(item.barbero_nombre) || safeText(barber?.nombre ?? barber?.name),
        total: Number(item.total ?? service?.precio ?? service?.price ?? 0)
      };
    });

    if (!barbersRows.length && slug) {
      barbersRows = await safeGetArray(`/barberos?select=*&slug=eq.${encodeURIComponent(slug)}`);
    }

    if (!barbersRows.length) {
      barbersRows = [
        {
          id: "b-1011",
          nombre: "Alex M.",
          image_url:
            "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/04/barbero1.1.png",
          rating: 4.9,
          activo: true
        },
        {
          id: "b-1012",
          nombre: "James V.",
          image_url:
            "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/04/barbero2.1.png",
          rating: 4.8,
          activo: true
        },
        {
          id: "b-1013",
          nombre: "Aldo H.",
          image_url:
            "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/04/barbero3.1.png",
          rating: 4.7,
          activo: true
        }
      ];
    }

    return {
      ok: true,
      message: `Fallback: dashboard/state no disponible, usando barberia_public_profiles + servicios/barberos. ${message}`,
      identity: {
        barberia_id: id > 0 ? id : null,
        slug: slug || null
      },
      merged: {
        biz_name: safeText(row?.nombre_publico),
        biz_slug: slug,
        address: safeText(row?.direccion),
        logo_url: safeText(row?.logo_url),
        public_landing_url: safeText(row?.public_landing_url),
        reservation_url: safeText(row?.reservation_url),
        qr_url: safeText(row?.qr_url),
        template_id: "v7"
      },
      seed: {
        servicios: servicesRows,
        barberos: barbersRows,
        clientes: clientsRows,
        citas: appointmentsWithLabels
      }
    };
  }
}

export async function loginDashboard(payload: {
  identity: DashboardIdentity;
  email: string;
  password: string;
}): Promise<DashboardLoginResponse> {
  return apiPostJson<DashboardLoginResponse, Record<string, unknown>>(env.dashboardLoginEndpoint, {
    barberia_id: payload.identity.barberia_id,
    slug: payload.identity.slug,
    email: payload.email,
    password: payload.password
  });
}

export async function recoverPasswordRequest(payload: {
  email: string;
}): Promise<{ ok: boolean; message: string }> {
  return apiPostJson<{ ok: boolean; message: string }, Record<string, unknown>>(
    env.dashboardRecoverRequestEndpoint,
    { email: payload.email }
  );
}

export async function recoverPasswordReset(payload: {
  token: string;
  new_password: string;
}): Promise<{ ok: boolean; message: string }> {
  return apiPostJson<{ ok: boolean; message: string }, Record<string, unknown>>(
    env.dashboardRecoverResetEndpoint,
    {
      token: payload.token,
      new_password: payload.new_password
    }
  );
}

export async function saveLandingDraft(payload: Record<string, unknown>): Promise<DraftSaveResponse> {
  return apiPostJson<DraftSaveResponse, Record<string, unknown>>(env.draftSaveEndpoint, payload);
}

export async function publishLanding(payload: Record<string, unknown>): Promise<PublishResponse> {
  return apiPostJson<PublishResponse, Record<string, unknown>>(env.publishEndpoint, payload);
}

export async function publishBarbershopViaRpc(barberiaId: number): Promise<PublishResponse> {
  const response = await apiPostJson<Record<string, unknown>, { p_barberia_id: number }>(
    env.publishRpcEndpoint,
    { p_barberia_id: barberiaId }
  );
  return normalizeRpcJsonb<PublishResponse>(response);
}
