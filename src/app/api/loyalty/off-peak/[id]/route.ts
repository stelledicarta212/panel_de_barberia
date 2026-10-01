import { NextResponse } from "next/server";
import { authenticateLoyaltyRequest } from "@/lib/loyalty-auth";
import { OffPeakService, validateOffPeakInput } from "@/lib/off-peak.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id: rawId } = await params;
    const ruleId = Number(rawId);
    if (!Number.isFinite(ruleId) || ruleId <= 0) {
      return NextResponse.json(
        { ok: false, code: "id_invalido", message: "ID de regla inválido" },
        { status: 400 }
      );
    }

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

    const input: Record<string, unknown> = {};
    if (body.nombre !== undefined) input.nombre = body.nombre ? String(body.nombre) : null;
    if (body.dias_semana !== undefined) {
      input.dias_semana = Array.isArray(body.dias_semana) ? body.dias_semana.map(Number) : [];
    }
    if (body.hora_inicio !== undefined) input.hora_inicio = String(body.hora_inicio);
    if (body.hora_fin !== undefined) input.hora_fin = String(body.hora_fin);
    if (body.descuento_porcentaje !== undefined) input.descuento_porcentaje = Number(body.descuento_porcentaje);
    if (body.aplica_todos_servicios !== undefined) input.aplica_todos_servicios = Boolean(body.aplica_todos_servicios);
    if (body.servicios_ids !== undefined) {
      input.servicios_ids = Array.isArray(body.servicios_ids) ? body.servicios_ids.map(Number) : null;
    }
    if (body.aplica_todos_barberos !== undefined) input.aplica_todos_barberos = Boolean(body.aplica_todos_barberos);
    if (body.barberos_ids !== undefined) {
      input.barberos_ids = Array.isArray(body.barberos_ids) ? body.barberos_ids.map(Number) : null;
    }
    if (body.activo !== undefined) input.activo = Boolean(body.activo);

    const validation = validateOffPeakInput(input);
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, code: "validacion_invalida", message: validation.error },
        { status: 400 }
      );
    }

    const updatedRule = await OffPeakService.updateRule(ruleId, auth.barberiaId, input, auth.baSession);
    return NextResponse.json({ ok: true, rule: updatedRule });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "off_peak_update_error",
        message: error instanceof Error ? error.message : "Error actualizando regla de tiempos muertos"
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id: rawId } = await params;
    const ruleId = Number(rawId);
    if (!Number.isFinite(ruleId) || ruleId <= 0) {
      return NextResponse.json(
        { ok: false, code: "id_invalido", message: "ID de regla inválido" },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const queryBarberiaId = url.searchParams.get("barberia_id");
    const explicitBarberiaId = queryBarberiaId ? Number(queryBarberiaId) : null;

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

    await OffPeakService.deleteRule(ruleId, auth.barberiaId, auth.baSession);
    return NextResponse.json({ ok: true, message: "Regla eliminada exitosamente" });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "off_peak_delete_error",
        message: error instanceof Error ? error.message : "Error eliminando regla de tiempos muertos"
      },
      { status: 500 }
    );
  }
}
