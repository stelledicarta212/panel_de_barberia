import { NextResponse } from "next/server";
import { authenticateLoyaltyRequest } from "@/lib/loyalty-auth";
import { LoyaltyService } from "@/lib/loyalty.service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queryBarberiaId = url.searchParams.get("barberia_id");
    const explicitBarberiaId = queryBarberiaId ? Number(queryBarberiaId) : null;

    const auth = await authenticateLoyaltyRequest(request, {
      explicitBarberiaId: Number.isFinite(explicitBarberiaId) ? explicitBarberiaId : null,
      allowedRoles: ["owner", "admin", "cajero"]
    });

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, code: auth.code, message: auth.message },
        { status: auth.status }
      );
    }

    const summary = await LoyaltyService.getSummary(auth.barberiaId, auth.baSession);
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "loyalty_summary_error",
        message: error instanceof Error ? error.message : "Error obteniendo datos del programa de fidelización"
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
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

    // Only owner and admin can modify loyalty configuration
    const auth = await authenticateLoyaltyRequest(request, {
      explicitBarberiaId: Number.isFinite(explicitBarberiaId) ? explicitBarberiaId : null,
      allowedRoles: ["owner", "admin"]
    });

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, code: auth.code, message: auth.message },
        { status: auth.status }
      );
    }

    // Protection: Disallow client from manipulating internal boundary or IDs
    if ("accrual_start_at" in body || "created_at" in body || "updated_at" in body || "program_type" in body) {
      return NextResponse.json(
        {
          ok: false,
          code: "campo_restringido",
          message: "No se permite la manipulación directa de campos protegidos del sistema"
        },
        { status: 400 }
      );
    }

    const patch: { activo?: boolean; sellos_requeridos?: number; recompensa_default?: string } = {};
    if (typeof body.activo === "boolean") {
      patch.activo = body.activo;
    }
    if (body.sellos_requeridos != null) {
      const s = Number(body.sellos_requeridos);
      if (!Number.isInteger(s) || s <= 0) {
        return NextResponse.json(
          { ok: false, code: "sellos_invalidos", message: "sellos_requeridos debe ser un entero mayor a 0" },
          { status: 400 }
        );
      }
      patch.sellos_requeridos = s;
    }
    if (body.recompensa_default != null) {
      const r = String(body.recompensa_default).trim();
      if (!r) {
        return NextResponse.json(
          { ok: false, code: "recompensa_invalida", message: "recompensa_default no puede estar vacía" },
          { status: 400 }
        );
      }
      patch.recompensa_default = r;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { ok: false, code: "sin_cambios", message: "No se enviaron campos válidos para actualizar" },
        { status: 400 }
      );
    }

    const updated = await LoyaltyService.updateConfig(auth.barberiaId, patch, auth.baSession);
    return NextResponse.json({ ok: true, config: updated });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "loyalty_config_update_error",
        message: error instanceof Error ? error.message : "Error actualizando configuración de fidelización"
      },
      { status: 500 }
    );
  }
}
