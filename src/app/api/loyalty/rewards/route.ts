import { NextResponse } from "next/server";
import { authenticateLoyaltyRequest } from "@/lib/loyalty-auth";
import { LoyaltyService } from "@/lib/loyalty.service";

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

    // Only owner and admin can create rewards
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

    const nombre = String(body.nombre || "").trim();
    if (!nombre) {
      return NextResponse.json(
        { ok: false, code: "nombre_requerido", message: "El nombre de la recompensa es obligatorio" },
        { status: 400 }
      );
    }

    const costo = Number(body.costo_en_sellos);
    if (!Number.isInteger(costo) || costo <= 0) {
      return NextResponse.json(
        { ok: false, code: "costo_invalido", message: "El costo en sellos debe ser un entero mayor a 0" },
        { status: 400 }
      );
    }

    const descripcion = body.descripcion ? String(body.descripcion).trim() : undefined;

    const reward = await LoyaltyService.createReward(
      auth.barberiaId,
      { nombre, costo_en_sellos: costo, descripcion },
      auth.baSession
    );

    return NextResponse.json({ ok: true, reward }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "loyalty_reward_create_error",
        message: error instanceof Error ? error.message : "Error creando recompensa"
      },
      { status: 500 }
    );
  }
}
