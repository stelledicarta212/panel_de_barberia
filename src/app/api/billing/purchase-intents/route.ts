import { NextResponse } from "next/server";
import {
  callPurchaseIntentRpc,
  normalizeCreatePayload,
  purchaseIntentCorsHeaders,
  requirePurchaseIntentOrigin,
  resolveSession,
  readJsonBody,
  safeIntentResponse,
  signIntentClaim,
} from "./service";

function statusFor(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (message === "session_required" || message === "session_invalid") return 401;
  if (message === "origin_not_allowed" || message === "42501") return 403;
  if (message.endsWith("_invalid") || message.endsWith("_required") || message.endsWith("_forbidden")) return 400;
  return 502;
}

export async function POST(request: Request) {
  let headers: Record<string, string> = {};
  try {
    headers = purchaseIntentCorsHeaders(request);
    requirePurchaseIntentOrigin(request);
    const { userId } = await resolveSession(request);
    const payload = normalizeCreatePayload(await readJsonBody(request));
    const intent = await callPurchaseIntentRpc("billing_create_purchase_intent_v1", {
      p_owner_user_id: userId,
      p_purchase_context: payload.purchaseContext,
      p_variation_id: payload.variationId,
      p_target_license_id: payload.targetLicenseId,
      p_idempotency_key: payload.idempotencyKey,
    });
    const claim = signIntentClaim(String(intent.id));
    return NextResponse.json(safeIntentResponse(intent, claim), { status: 201, headers });
  } catch (error) {
    return NextResponse.json(
      { ok: false, code: error instanceof Error ? error.message : "purchase_intent_failed" },
      { status: statusFor(error), headers }
    );
  }
}

export async function OPTIONS(request: Request) {
  try {
    return new NextResponse(null, { status: 204, headers: purchaseIntentCorsHeaders(request) });
  } catch {
    return new NextResponse(null, { status: 403 });
  }
}
