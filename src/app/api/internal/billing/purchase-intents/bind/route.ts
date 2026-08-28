import { NextResponse } from "next/server";
import { authorizeBridge, callPurchaseIntentRpc, readJsonBody, safeIntentResponse, validateBindPayload } from "../../../../billing/purchase-intents/service";

export async function POST(request: Request) {
  try {
    authorizeBridge(request);
    const p = validateBindPayload(await readJsonBody(request));
    const intent = await callPurchaseIntentRpc("billing_bind_purchase_intent_to_wc_order_v1", {
      p_intent_id:p.id,p_cart_binding_hash:p.hash,p_woocommerce_order_id:p.order,
      p_woocommerce_order_item_id:p.item,p_woocommerce_customer_id:p.customer,
      p_product_id:p.product,p_variation_id:p.variation,p_quantity:p.quantity,
      p_billing_term:p.term,p_amount_cents:p.amount,p_currency:p.currency,
    });
    if (intent.status !== "order_bound") throw new Error(`purchase_intent_${String(intent.status)}`);
    return NextResponse.json(safeIntentResponse(intent));
  } catch (error) {
    const code = error instanceof Error ? error.message : "purchase_intent_bind_failed";
    return NextResponse.json({ ok: false, code }, { status: code === "bridge_unauthorized" ? 401 : 409 });
  }
}
