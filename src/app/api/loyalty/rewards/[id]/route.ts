import { NextResponse } from "next/server";
import { authenticateLoyaltyRequest } from "@/lib/loyalty-auth";
import { LoyaltyService } from "@/lib/loyalty.service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const rewardId = Number(id);
    if (!Number.isInteger(rewardId) || rewardId <= 0) {
      return NextResponse.json(
        { ok: false, code: "id_invalido", message: "ID de recompensa inválido" },
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

    // Only owner and admin can update rewards
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

    const patch: { nombre?: string; costo_en_sellos?: number; descripcion?: string; activo?: boolean } = {};
    if (body.nombre != null) {
      const n = String(body.nombre).trim();
      if (!n) {
        return NextResponse.json(
          { ok: false, code: "nombre_invalido", message: "El nombre no puede estar vacío" },
          { status: 400 }
        );
      }
      patch.nombre = n;
    }
    if (body.costo_en_sellos != null) {
      const c = Number(body.costo_en_sellos);
      if (!Number.isInteger(c) || c <= 0) {
        return NextResponse.json(
          { ok: false, code: "costo_invalido", message: "El costo en sellos debe ser un entero mayor a 0" },
          { status: 400 }
        );
      }
      patch.costo_en_sellos = c;
    }
    if (body.descripcion !== undefined) {
      patch.descripcion = body.descripcion ? String(body.descripcion).trim() : "";
    }
    if (typeof body.activo === "boolean") {
      patch.activo = body.activo;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { ok: false, code: "sin_cambios", message: "No se enviaron campos válidos para actualizar" },
        { status: 400 }
      );
    }

    const updated = await LoyaltyService.updateReward(
      auth.barberiaId,
      rewardId,
      patch,
      auth.baSession
    );

    return NextResponse.json({ ok: true, reward: updated });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "loyalty_reward_update_error",
        message: error instanceof Error ? error.message : "Error actualizando recompensa"
      },
      { status: 500 }
    );
  }
}
