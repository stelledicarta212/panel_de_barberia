import { NextResponse } from "next/server";

const POS_SALE_ENDPOINT =
  process.env.POS_SALE_ENDPOINT ??
  "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/pos/create-sale";

const DASHBOARD_STATE_ENDPOINT =
  process.env.DASHBOARD_STATE_ENDPOINT ??
  "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/dashboard/state";

function readBaSession(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  return match ? match[1] : "";
}

function readBarberiaId(body: unknown): number {
  if (!body || typeof body !== "object" || Array.isArray(body)) return 0;
  const record = body as Record<string, unknown>;
  const value = record.barberia_id ?? record.id_barberia ?? record.barbershop_id;
  const id = Number(value ?? 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

export async function POST(request: Request) {
  try {
    const baSession = readBaSession(request.headers.get("cookie") || "");
    if (!baSession) {
      return NextResponse.json(
        { ok: false, code: "sesion_requerida", message: "Sesion requerida para registrar POS." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const barberiaId = readBarberiaId(body);
    if (!barberiaId) {
      return NextResponse.json(
        { ok: false, code: "barberia_id_requerido", message: "barberia_id es requerido para registrar POS." },
        { status: 400 }
      );
    }

    const stateUrl = `${DASHBOARD_STATE_ENDPOINT}?barberia_id=${encodeURIComponent(String(barberiaId))}`;
    const stateResponse = await fetch(stateUrl, {
      method: "GET",
      headers: { Cookie: `ba_session=${baSession}` },
      cache: "no-store"
    });

    if (!stateResponse.ok) {
      const stateData = await stateResponse.json().catch(() => ({}));
      return NextResponse.json(
        {
          ok: false,
          code: stateResponse.status === 401 ? "sesion_no_valida" : "sin_permiso",
          message:
            typeof stateData.message === "string"
              ? stateData.message
              : "No tienes permisos para registrar POS en esta barberia."
        },
        { status: stateResponse.status === 401 ? 401 : 403 }
      );
    }

    const response = await fetch(POS_SALE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `ba_session=${baSession}`
      },
      body: JSON.stringify(body)
    });
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
    
    if (!response.ok) {
      return NextResponse.json(
        { ok: false, message: data.message || "Error en el servidor de facturación." },
        { status: response.status }
      );
    }
    
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    console.error("Error proxying POS sale:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Error interno de red en el proxy." },
      { status: 500 }
    );
  }
}
