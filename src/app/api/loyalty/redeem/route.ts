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

    // Operational roles allowed to redeem: owner, admin, cajero
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

    const clienteId = Number(body.cliente_id);
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return NextResponse.json(
        { ok: false, code: "cliente_requerido", message: "cliente_id inválido o requerido" },
        { status: 400 }
      );
    }

    const rewardId = Number(body.reward_id);
    if (!Number.isInteger(rewardId) || rewardId <= 0) {
      return NextResponse.json(
        { ok: false, code: "recompensa_requerida", message: "reward_id inválido o requerido" },
        { status: 400 }
      );
    }

    const citaId = body.cita_id != null && Number.isFinite(Number(body.cita_id)) && Number(body.cita_id) > 0
      ? Number(body.cita_id)
      : null;

    const notas = body.notas ? String(body.notas).trim() : null;

    const result = await LoyaltyService.redeem(
      auth.barberiaId,
      clienteId,
      rewardId,
      citaId,
      notas,
      auth.baSession
    );

    if (!result.success) {
      // Map RPC business rejections (e.g. insufficient_balance, reward_inactive, program_disabled)
      const httpStatus =
        result.status === "unauthorized" || result.status === "cross_tenant_reward"
          ? 403
          : result.status === "customer_not_found" || result.status === "reward_not_found"
            ? 404
            : 422;

      return NextResponse.json(
        {
          ok: false,
          status: result.status,
          message: result.message || "No se pudo completar el canje",
          saldo_actual: result.saldo_actual,
          costo_requerido: result.costo_requerido
        },
        { status: httpStatus }
      );
    }

    return NextResponse.json({
      ok: true,
      success: true,
      status: result.status,
      redemption_id: result.redemption_id,
      ledger_id: result.ledger_id,
      cliente_id: result.cliente_id,
      barberia_id: result.barberia_id,
      reward_nombre: result.reward_nombre,
      costo_sellos: result.costo_sellos,
      saldo_restante: result.saldo_restante,
      message: result.message
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "loyalty_redeem_error",
        message: error instanceof Error ? error.message : "Error procesando el canje de fidelización"
      },
      { status: 500 }
    );
  }
}
