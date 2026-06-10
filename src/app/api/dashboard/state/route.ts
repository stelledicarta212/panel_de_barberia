import { NextResponse } from "next/server";

const DASHBOARD_STATE_ENDPOINT =
  process.env.DASHBOARD_STATE_ENDPOINT ??
  "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/dashboard/state";

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

export async function GET(request: Request) {
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
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        {
          ok: false,
          message: "dashboard/state devolvió respuesta no JSON"
        },
        { status: 502 }
      );
    }

    if (upstream.ok && isRecord(body)) {
      const barberiaId = resolveBarberiaId(body, searchParams);
      if (barberiaId) {
        const descansos = await loadDescansos(barberiaId);
        const seed = isRecord(body.seed) ? body.seed : {};
        const merged = isRecord(body.merged) ? body.merged : {};
        body = {
          ...body,
          descansos,
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
    }

    return NextResponse.json(body, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Error conectando con dashboard/state"
      },
      { status: 502 }
    );
  }
}
