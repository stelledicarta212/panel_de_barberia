import { NextResponse } from "next/server";
import { authenticateLoyaltyRequest } from "@/lib/loyalty-auth";
import { OffPeakService, validateOffPeakInput } from "@/lib/off-peak.service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queryBarberiaId = url.searchParams.get("barberia_id");
    const explicitBarberiaId = queryBarberiaId ? Number(queryBarberiaId) : null;

    const auth = await authenticateLoyaltyRequest(request, {
      explicitBarberiaId: Number.isFinite(explicitBarberiaId) ? explicitBarberiaId : null,
      allowedRoles: ["owner", "admin", "cajero", "super_admin"]
    });

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, code: auth.code, message: auth.message },
        { status: auth.status }
      );
    }

    const rules = await OffPeakService.listRules(auth.barberiaId, auth.baSession);
    return NextResponse.json({ ok: true, rules });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "off_peak_list_error",
        message: error instanceof Error ? error.message : "Error consultando reglas de tiempos muertos"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "body_invalido", message: "JSON inválido en el cuerpo de la petición" },
        { status: 400 }
      );
    }

    const explicitBarberiaId = body.barberia_id != null ? Number(body.barberia_id) : null;

    // Only owner and admin can configure promotional discount rules
    const auth = await authenticateLoyaltyRequest(request, {
      explicitBarberiaId: Number.isFinite(explicitBarberiaId) ? explicitBarberiaId : null,
      allowedRoles: ["owner", "admin", "super_admin"]
    });

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, code: auth.code, message: auth.message },
        { status: auth.status }
      );
    }

    const input = {
      nombre: body.nombre ? String(body.nombre) : null,
      dias_semana: Array.isArray(body.dias_semana) ? body.dias_semana.map(Number) : [],
      hora_inicio: String(body.hora_inicio || ""),
      hora_fin: String(body.hora_fin || ""),
      descuento_porcentaje: Number(body.descuento_porcentaje),
      aplica_todos_servicios: body.aplica_todos_servicios !== false,
      servicios_ids: Array.isArray(body.servicios_ids) ? body.servicios_ids.map(Number) : null,
      aplica_todos_barberos: body.aplica_todos_barberos !== false,
      barberos_ids: Array.isArray(body.barberos_ids) ? body.barberos_ids.map(Number) : null,
      activo: body.activo !== false
    };

    const validation = validateOffPeakInput(input);
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, code: "validacion_invalida", message: validation.error },
        { status: 400 }
      );
    }

    const createdRule = await OffPeakService.createRule(auth.barberiaId, input, auth.baSession);
    return NextResponse.json({ ok: true, rule: createdRule }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "off_peak_create_error",
        message: error instanceof Error ? error.message : "Error creando regla de tiempos muertos"
      },
      { status: 500 }
    );
  }
}
