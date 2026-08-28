import { NextResponse } from "next/server";
import { authorizeBridge, callPurchaseIntentRpc, readJsonBody, safeIntentResponse, validateAttachPayload } from "../../../../billing/purchase-intents/service";

export async function POST(request: Request) {
  try {
    authorizeBridge(request);
    const body = await readJsonBody(request);
    const payload = validateAttachPayload(body);
    const intent = await callPurchaseIntentRpc("billing_validate_purchase_intent_v1", {
      p_intent_id: payload.id,
      p_cart_binding_hash: payload.hash,
    });
    if (intent.status !== "cart_attached") throw new Error(`purchase_intent_${String(intent.status)}`);
    return NextResponse.json(safeIntentResponse(intent));
  } catch (error) {
    const code = error instanceof Error ? error.message : "purchase_intent_validation_failed";
    return NextResponse.json({ ok: false, code }, { status: code === "bridge_unauthorized" ? 401 : 409 });
  }
}
