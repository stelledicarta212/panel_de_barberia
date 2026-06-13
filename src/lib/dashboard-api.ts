import { apiPostJson } from "@/lib/api";
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

export function buildIdentityQuery(identity: IdentityInput): string {
  const normalized = normalizeIdentity(identity);
  if (normalized.barberia_id) {
    return `barberia_id=${encodeURIComponent(String(normalized.barberia_id))}`;
  }
  if (normalized.slug) {
    return `slug=${encodeURIComponent(normalized.slug)}`;
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
    ),
    descansos: pickFirstArray(
      merged.descansos,
      draft["descansos"],
      seed["descansos"],
      (seed["inherited"] as Record<string, unknown> | undefined)?.["descansos"],
      raw.descansos
    )
  };
}

export async function getDashboardState(identity: IdentityInput): Promise<DashboardStateResponse> {
  const query = buildIdentityQuery(identity);
  if (!query) {
    return { ok: false, message: "Falta identidad de barberia" };
  }
  const path = `/api/dashboard/state?${query}&_t=${Date.now()}`;
  try {
    const res = await fetch(path, {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
    const text = await res.text().catch(() => "");
    let response = {} as DashboardStateResponse;
    try {
      response = text ? (JSON.parse(text) as DashboardStateResponse) : ({} as DashboardStateResponse);
    } catch {
      throw new Error("Respuesta no JSON de dashboard/state");
    }
    if (!res.ok) {
      throw new Error(response.message || `Error ${res.status} de dashboard/state`);
    }
    return response;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Error consultando dashboard/state";
    throw new Error(`No se pudo cargar dashboard/state: ${message}`);
  }
}

export async function loginDashboard(payload: {
  identity: DashboardIdentity | null;
  email: string;
  password: string;
}): Promise<DashboardLoginResponse> {
  const response = await fetch("/api/session/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      barberia_id: payload.identity?.barberia_id ?? null,
      slug: payload.identity?.slug ?? null,
      email: payload.email,
      password: payload.password
    })
  });

  const text = await response.text().catch(() => "");
  let data: { ok?: boolean; message?: string; error?: string } = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    throw new Error(data.message || data.error || `Error en el login (${response.status})`);
  }
  return data as DashboardLoginResponse;
}

export async function recoverPasswordRequest(payload: {
  email: string;
  identity?: IdentityInput | null;
}): Promise<{ ok: boolean; message: string }> {
  return apiPostJson<{ ok: boolean; message: string }, Record<string, unknown>>(
    "/api/auth/recover/request",
    {
      email: payload.email,
      barberia_id: payload.identity?.barberia_id ?? null,
      slug: payload.identity?.slug ?? null,
      identity: payload.identity ?? null
    }
  );
}

export async function recoverPasswordReset(payload: {
  token: string;
  new_password: string;
}): Promise<{ ok: boolean; message: string }> {
  return apiPostJson<{ ok: boolean; message: string }, Record<string, unknown>>(
    "/api/auth/recover/reset",
    {
      token: payload.token,
      new_password: payload.new_password
    }
  );
}

export async function saveLandingDraft(payload: Record<string, unknown>): Promise<DraftSaveResponse> {
  return apiPostJson<DraftSaveResponse, Record<string, unknown>>("/api/editor/draft", payload, {
    credentials: "include"
  });
}

export async function publishLanding(payload: Record<string, unknown>): Promise<PublishResponse> {
  return apiPostJson<PublishResponse, Record<string, unknown>>("/api/editor/publish", payload, {
    credentials: "include"
  });
}

export async function publishBarbershopViaRpc(identity: DashboardIdentity, currentPayload: DashboardMerged): Promise<PublishResponse> {
  try {
    const response = await fetch("/api/editor/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        p_barberia_id: identity.barberia_id,
        barberia_id: identity.barberia_id,
        slug: identity.slug,
        payload: currentPayload,
        source: "dashboard_editor"
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.ok === false) {
      return {
        ok: false,
        error: data?.error || data?.message || "Error al publicar la barbería."
      };
    }

    return data;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error de red al publicar."
    };
  }
}

const BARBEROS_ADMIN_WEBHOOK = "/api/dashboard/barberos";
const RESERVAS_CREATE_WEBHOOK = "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/reservas/create";
const RESERVAS_SLOTS_WEBHOOK = "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/reservas/slots";

async function callBarberosAdminGateway(payload: Record<string, unknown>): Promise<{ ok: boolean; message?: string; data?: unknown }> {
  try {
    const response = await fetch(BARBEROS_ADMIN_WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.ok === false) {
      return {
        ok: false,
        message: data?.message || data?.error || "Error en gateway de barberos."
      };
    }

    return {
      ok: true,
      data
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error de red en el gateway."
    };
  }
}

export async function addBarberDescanso(payload: {
  barberia_id: number;
  barbero_id: number;
  fecha: string;
}): Promise<{ ok: boolean; message?: string }> {
  return callBarberosAdminGateway({
    action: "add_descanso",
    ...payload
  });
}

export async function deleteBarberDescanso(barberoId: number, fecha: string): Promise<{ ok: boolean; message?: string }> {
  return callBarberosAdminGateway({
    action: "delete_descanso",
    barbero_id: barberoId,
    fecha
  });
}

export async function updateBarberActiveStatus(payload: {
  barberia_id: number;
  slug: string;
  barbero_id: number;
  activo: boolean;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch("/api/configuracion/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        mode: "edit",
        barberia_id: payload.barberia_id,
        slug: payload.slug,
        patch: {},
        collections_patch: {
          barberos: {
            upsert: [
              {
                id: payload.barbero_id,
                activo: payload.activo
              }
            ],
            deactivate: []
          }
        }
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false, message: data.message || "Error al actualizar estado del barbero." };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error de red." };
  }
}

export async function addServicio(payload: {
  barberia_id: number;
  slug: string;
  nombre: string;
  precio: number;
  duracion_min: number;
  imagen_url?: string;
}): Promise<{ ok: boolean; message?: string; data?: unknown }> {
  try {
    const res = await fetch("/api/configuracion/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        mode: "edit",
        barberia_id: payload.barberia_id,
        slug: payload.slug,
        patch: {},
        collections_patch: {
          servicios: {
            upsert: [
              {
                nombre: payload.nombre,
                precio: payload.precio,
                duracion_min: payload.duracion_min,
                imagen_url: payload.imagen_url,
                activo: true
              }
            ],
            deactivate: []
          }
        }
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false, message: data.message || "Error al agregar servicio." };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error de red." };
  }
}

export async function updateServicio(payload: {
  barberia_id: number;
  slug: string;
  id: number;
  nombre: string;
  precio: number;
  duracion_min: number;
  imagen_url?: string;
  activo: boolean;
}): Promise<{ ok: boolean; message?: string; data?: unknown }> {
  try {
    const res = await fetch("/api/configuracion/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        mode: "edit",
        barberia_id: payload.barberia_id,
        slug: payload.slug,
        patch: {},
        collections_patch: {
          servicios: {
            upsert: [
              {
                id: payload.id,
                nombre: payload.nombre,
                precio: payload.precio,
                duracion_min: payload.duracion_min,
                imagen_url: payload.imagen_url,
                activo: payload.activo
              }
            ],
            deactivate: []
          }
        }
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false, message: data.message || "Error al actualizar servicio." };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error de red." };
  }
}

export async function deleteServicio(payload: {
  barberia_id: number;
  slug: string;
  id: number;
}): Promise<{ ok: boolean; message?: string; data?: unknown }> {
  try {
    const res = await fetch("/api/configuracion/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        mode: "edit",
        barberia_id: payload.barberia_id,
        slug: payload.slug,
        patch: {},
        collections_patch: {
          servicios: {
            upsert: [],
            deactivate: [payload.id]
          }
        }
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false, message: data.message || "Error al desactivar servicio." };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error de red." };
  }
}

const CITAS_ADMIN_WEBHOOK = "/api/dashboard/citas";

async function callCitasAdminGateway(payload: Record<string, unknown>): Promise<{ ok: boolean; message?: string; data?: unknown }> {
  try {
    const response = await fetch(CITAS_ADMIN_WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.ok === false) {
      return {
        ok: false,
        message: data?.message || data?.error || "Error en gateway de citas."
      };
    }

    return {
      ok: true,
      data: data.data
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error de red en el gateway de citas."
    };
  }
}

export async function addCitaDashboard(payload: {
  barberia_id: number;
  cliente_nombre: string;
  cliente_tel: string;
  barbero_id: number;
  servicio_id: number;
  fecha: string;
  hora_inicio: string;
  estado?: string;
  notas?: string;
}): Promise<{ ok: boolean; message?: string; data?: unknown }> {
  return callCitasAdminGateway({
    action: "add_cita",
    ...payload
  });
}

export async function updateCitaDashboard(payload: {
  barberia_id: number;
  id: number;
  cliente_nombre: string;
  cliente_tel: string;
  barbero_id: number;
  servicio_id: number;
  fecha: string;
  hora_inicio: string;
  estado?: string;
  notas?: string;
}): Promise<{ ok: boolean; message?: string; data?: unknown }> {
  return callCitasAdminGateway({
    action: "update_cita",
    ...payload
  });
}

export async function cancelCitaDashboard(payload: {
  barberia_id: number;
  id: number;
}): Promise<{ ok: boolean; message?: string; data?: unknown }> {
  return callCitasAdminGateway({
    action: "cancel_cita",
    ...payload
  });
}

export type ReservationSlot = {
  barbero_id?: string | number;
  id_barbero?: string | number;
  hora_inicio?: string;
  hora?: string;
  start?: string;
  [key: string]: unknown;
};

export async function fetchReservationSlotsDashboard(params: {
  barberia_id: number;
  fecha: string;
  servicio_id?: string | number;
  barbero_id?: string | number;
}): Promise<{ ok: boolean; message?: string; slots: ReservationSlot[] }> {
  try {
    const query = new URLSearchParams({
      barberia_id: String(params.barberia_id),
      fecha: params.fecha,
      _: String(Date.now())
    });
    if (params.servicio_id) query.set("servicio_id", String(params.servicio_id));
    if (params.barbero_id) query.set("barbero_id", String(params.barbero_id));

    const response = await fetch(`${RESERVAS_SLOTS_WEBHOOK}?${query.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      return {
        ok: false,
        message: data?.message || data?.error || "No fue posible consultar disponibilidad.",
        slots: []
      };
    }
    return {
      ok: true,
      slots: Array.isArray(data?.slots) ? data.slots : []
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error de red consultando disponibilidad.",
      slots: []
    };
  }
}

export async function createReservationDashboard(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  message?: string;
  data?: Record<string, unknown>;
  cita_confirmada?: Record<string, unknown> | null;
}> {
  try {
    const response = await fetch(RESERVAS_CREATE_WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      return {
        ok: false,
        message: data?.message || data?.error || "No fue posible crear la cita.",
        data
      };
    }
    return {
      ok: true,
      message: data?.message,
      data,
      cita_confirmada: data?.cita_confirmada || null
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error de red creando la cita."
    };
  }
}
export async function savePosSale(payload: {
  barberia_id: number;
  cliente_nombre: string;
  cliente_id?: string;
  barbero_id: string | number;
  metodo_pago: string;
  monto_total: number;
  servicios: Array<{ id: string | number; name: string; amount: number }>;
  cita_id?: string | number;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/pos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: data.message || "Error en el servidor de facturación." };
    }
    return { ok: true, message: data.message || "Cobro procesado con éxito." };
  } catch (err) {
    console.error("Error en savePosSale relative fetch:", err);
    return { ok: false, message: "Error de red al conectar con el servidor de cobro." };
  }
}

