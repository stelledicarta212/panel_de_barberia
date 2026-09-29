import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

const DEFAULT_INTERNAL_TOKEN = "ba_loyalty_internal_secret_token_2026";

function getExpectedInternalToken(): string {
  const token =
    process.env.LOYALTY_INTERNAL_TOKEN ??
    process.env.INTERNAL_SERVICE_KEY ??
    process.env.BILLING_PURCHASE_INTENTS_BRIDGE_TOKEN ??
    DEFAULT_INTERNAL_TOKEN;
  return token.trim();
}

function authorizeInternalRequest(request: Request): boolean {
  const expected = Buffer.from(getExpectedInternalToken());
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const supplied = Buffer.from(token);

  if (expected.length !== supplied.length || expected.length === 0) {
    return false;
  }
  return timingSafeEqual(expected, supplied);
}

function getPostgrestBaseUrl(): string {
  const base =
    process.env.POSTGREST_BASE_URL ??
    process.env.POSTGREST_URL ??
    process.env.BILLING_PURCHASE_INTENTS_POSTGREST_URL ??
    "";
  const cleaned = String(base).trim().replace(/\/+$/, "");
  if (cleaned.includes("barberagency-app.gymh5g.easypanel.host")) {
    return process.env.BILLING_PURCHASE_INTENTS_POSTGREST_URL ?? "https://api.agencia2c.cloud";
  }
  return cleaned;
}

function getServiceRoleToken(): string {
  const token =
    process.env.LOYALTY_SERVICE_ROLE_TOKEN ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.POSTGREST_SERVICE_KEY ??
    process.env.BILLING_PURCHASE_INTENTS_INGEST_TOKEN ??
    "";
  return token.trim();
}

export async function POST(request: Request) {
  try {
    if (!authorizeInternalRequest(request)) {
      return NextResponse.json(
        { ok: false, code: "unauthorized", message: "Credencial interna inválida o ausente." },
        { status: 401 }
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const barberiaId =
      body.barberia_id != null && Number.isFinite(Number(body.barberia_id)) && Number(body.barberia_id) > 0
        ? Number(body.barberia_id)
        : null;

    const rawLimit = Number(body.limit ?? 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 50;

    const baseUrl = getPostgrestBaseUrl();
    if (!baseUrl) {
      return NextResponse.json(
        { ok: false, code: "postgrest_not_configured", message: "POSTGREST_BASE_URL no está configurado." },
        { status: 500 }
      );
    }

    const serviceToken = getServiceRoleToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json"
    };

    if (serviceToken) {
      headers["Authorization"] = `Bearer ${serviceToken}`;
      headers["apikey"] = serviceToken;
    }

    const rpcUrl = `${baseUrl}/rpc/ba_loyalty_reconciliar_pagos`;
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_barberia_id: barberiaId,
        p_limit: limit
      }),
      cache: "no-store"
    });

    const text = await response.text().catch(() => "");
    let rpcData: unknown = {};
    try {
      rpcData = text ? JSON.parse(text) : {};
    } catch {
      rpcData = { raw: text };
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: "reconciliation_rpc_error",
          httpStatus: response.status,
          error: rpcData
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      result: rpcData
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "internal_error",
        message: error instanceof Error ? error.message : "Error inesperado en reconciliación."
      },
      { status: 500 }
    );
  }
}
