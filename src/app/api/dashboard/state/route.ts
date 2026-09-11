import { NextResponse } from "next/server";
import { getCorsHeaders } from "../../editor/auth";

const DASHBOARD_STATE_ENDPOINT =
  process.env.DASHBOARD_STATE_ENDPOINT;

const POSTGREST_BASE_URL =
  process.env.POSTGREST_BASE_URL ??
  process.env.POSTGREST_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "";

function readBaSession(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  return match ? match[1] : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveBarberiaId(body: unknown, searchParams: URLSearchParams): number | null {
  const identity = isRecord(body) && isRecord(body.identity) ? body.identity : {};
  const fromBody = Number(identity.barberia_id ?? 0);
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody;
  const fromQuery = Number(searchParams.get("barberia_id") ?? 0);
  return Number.isFinite(fromQuery) && fromQuery > 0 ? fromQuery : null;
}

async function loadDescansos(barberiaId: number): Promise<Array<Record<string, unknown>>> {
  const base = String(POSTGREST_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error("POSTGREST_BASE_URL no configurado para dashboard/state");
  }
  const url = `${base}/barberos_descansos?select=barbero_id,fecha&barberia_id=eq.${encodeURIComponent(String(barberiaId))}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`barberos_descansos devolvio ${response.status}`);
  }
  try {
    const rows = text ? JSON.parse(text) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    throw new Error("barberos_descansos devolvio respuesta no JSON");
  }
}

async function loadPublishedLanding(barberiaId: number): Promise<Record<string, unknown> | null> {
  const base = String(POSTGREST_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) {
    return null;
  }
  const url = `${base}/barberia_landing_publish?barberia_id=eq.${encodeURIComponent(String(barberiaId))}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    });
    if (!response.ok) return null;
    const text = await response.text().catch(() => "");
    const rows = text ? JSON.parse(text) : [];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

async function loadProductState(userId: number): Promise<Record<string, unknown> | null> {
  const base = String(POSTGREST_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base || !userId) {
    return null;
  }
  const url = `${base}/rpc/ba_resolve_user_product_state`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ p_user_id: userId }),
      cache: "no-store"
    });
    if (!response.ok) return null;
    const text = await response.text().catch(() => "");
    const data = text ? JSON.parse(text) : null;
    return isRecord(data) ? data : null;
  } catch {
    return null;
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}

export async function GET(request: Request) {
  const corsHeaders = getCorsHeaders(request);

  if (!DASHBOARD_STATE_ENDPOINT) {
    return NextResponse.json(
      {
        ok: false,
        code: "dashboard_state_endpoint_not_configured",
        message: "El servidor no esta configurado correctamente."
      },
      { status: 500, headers: corsHeaders }
    );
  }

  const { searchParams } = new URL(request.url);
  const baSession = readBaSession(request.headers.get("cookie") || "");
  const cookieHeader = baSession ? `ba_session=${baSession}` : "";

  const queryStr = searchParams.toString();
  const url = `${DASHBOARD_STATE_ENDPOINT}${queryStr ? `?${queryStr}` : ""}`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      cache: "no-store"
    });

    const text = await upstream.text().catch(() => "");
    let rawJson: unknown = {};
    try {
      rawJson = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        {
          ok: false,
          message: "dashboard/state devolvió respuesta no JSON"
        },
        { status: 502, headers: corsHeaders }
      );
    }

    let body: Record<string, unknown> = isRecord(rawJson) ? { ...rawJson } : {};

    if (upstream.ok && isRecord(rawJson)) {
      const barberiaId = resolveBarberiaId(body, searchParams);
      if (barberiaId) {
        const descansos = await loadDescansos(barberiaId);
        const publishedLanding = await loadPublishedLanding(barberiaId);
        const seed = isRecord(body.seed) ? body.seed : {};
        const merged = isRecord(body.merged) ? body.merged : {};
        body = {
          ...body,
          descansos,
          published: publishedLanding || undefined,
          seed: {
            ...seed,
            descansos
          },
          merged: {
            ...merged,
            descansos
          }
        };
      }

      // Phase D: Canonical product state enrichment
      const rawUser = isRecord(body.user) ? body.user : isRecord(body.owner) ? body.owner : {};
      const candidateUserId = Number(rawUser.id ?? body.user_id ?? 0);
      let productState: Record<string, unknown> | null = isRecord(body.product_state) ? body.product_state : null;
      if (!productState && candidateUserId > 0) {
        productState = await loadProductState(candidateUserId);
      }
      if (productState) {
        body = {
          ...body,
          product_state: productState,
          barberia_state: productState.barberia_state ?? body.barberia_state ?? "none",
          subscription_state: productState.subscription_state ?? body.subscription_state ?? "ZERO_BARBERIA",
          plan_code: productState.plan_code ?? body.plan_code ?? null,
          plan_name: productState.plan_name ?? body.plan_name ?? null,
          billing_term: productState.billing_term ?? body.billing_term ?? null,
          period_start: productState.period_start ?? body.period_start ?? null,
          period_end: productState.period_end ?? body.period_end ?? null,
          days_remaining: productState.days_remaining ?? body.days_remaining ?? null
        };
      }
    }

    return NextResponse.json(body, { status: upstream.status, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Error conectando con dashboard/state"
      },
      { status: 502, headers: corsHeaders }
    );
  }
}
