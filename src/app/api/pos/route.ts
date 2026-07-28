import { NextResponse } from "next/server";

const POS_SALE_ENDPOINT =
  process.env.POS_SALE_ENDPOINT;

const DASHBOARD_STATE_ENDPOINT =
  process.env.DASHBOARD_STATE_ENDPOINT;

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
    if (!POS_SALE_ENDPOINT) {
      return NextResponse.json(
        {
          ok: false,
          code: "pos_endpoint_not_configured",
          message: "El servidor no esta configurado correctamente."
        },
        { status: 500 }
      );
    }
    if (!DASHBOARD_STATE_ENDPOINT) {
      return NextResponse.json(
        {
          ok: false,
          code: "dashboard_state_endpoint_not_configured",
          message: "El servidor no esta configurado correctamente."
        },
        { status: 500 }
      );
    }

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

    // No permitir monto negativo desde el proxy
    const montoTotal = Number(body.monto_total ?? body.total ?? 0);
    if (montoTotal < 0) {
      return NextResponse.json(
        { ok: false, code: "monto_negativo", message: "No se permiten montos negativos." },
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

    const stateData = await stateResponse.json().catch(() => null);
    if (!stateData) {
      return NextResponse.json(
        { ok: false, message: "Error al cargar el estado de la barbería." },
        { status: 500 }
      );
    }

    // Validar cita_id si viene en el payload
    const citaId = body.cita_id ?? body.id_cita;
    const hasCitaId = citaId !== undefined && citaId !== null && String(citaId).trim() !== "" && String(citaId) !== "undefined" && String(citaId) !== "null" && !String(citaId).startsWith("cita-");

    if (hasCitaId) {
      const appointments = (stateData.reservas || stateData.merged?.appointments || stateData.seed?.appointments || []) as Array<Record<string, unknown>>;
      const targetCita = appointments.find((c) => {
        const cid = c.id ?? c.cita_id;
        return cid !== undefined && String(cid) === String(citaId);
      });

      if (!targetCita) {
        return NextResponse.json(
          { ok: false, code: "cita_ajena", message: "La cita no pertenece a esta barbería." },
          { status: 403 }
        );
      }

      // Validar si la cita ya fue pagada
      const rawMethod = targetCita.metodo_pago || targetCita.pago_metodo || targetCita.metodo || targetCita.method;
      const hasPayment = Boolean(targetCita.pago_id || targetCita.pagado_en || targetCita.total_pagado || (typeof rawMethod === "string" && rawMethod.trim().length > 0));
      const isPagadaState = String(targetCita.estado || "").toLowerCase() === "pagada";

      if (hasPayment || isPagadaState) {
        return NextResponse.json(
          { ok: false, code: "cita_ya_pagada", message: "La cita ya fue pagada." },
          { status: 409 }
        );
      }

      // Validar que la cita esté realizada para poder ser cobrada
      const citaEstado = String(targetCita.estado || "").toLowerCase();
      if (citaEstado !== "realizada") {
        return NextResponse.json(
          { ok: false, code: "cita_no_realizada", message: "La cita debe estar en estado realizada para poder ser cobrada." },
          { status: 409 }
        );
      }
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
    
    if (!response.ok || data.ok === false) {
      return NextResponse.json(
        { ok: false, code: data.code || "error_cobro", message: data.message || "Error en el servidor de facturación." },
        { status: response.status >= 400 ? response.status : 409 }
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
