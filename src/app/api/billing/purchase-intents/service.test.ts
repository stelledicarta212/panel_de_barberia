import { describe, expect, it } from "vitest";
import { normalizeCreatePayload, purchaseIntentCorsHeaders, readBaSession, requirePurchaseIntentOrigin, resolveSessionUserId, signIntentClaim, validateAttachPayload, validateBindPayload, validateCancelPayload } from "./service";

describe("purchase intent boundary", () => {
  it("extracts only the HttpOnly cookie value passed by the server", () => {
    expect(readBaSession("x=1; ba_session=opaque.jwt; y=2")).toBe("opaque.jwt");
  });

  it("resolves a positive BarberAgency user id", () => {
    expect(resolveSessionUserId({ ok: true, user_id: 77 })).toBe(77);
    expect(resolveSessionUserId({ ok: true, user_id: 0 })).toBeNull();
  });

  it("accepts onboarding without browser identity", () => {
    expect(normalizeCreatePayload({
      purchase_context: "onboarding",
      variation_id: 4225,
      idempotency_key: "browser-request-1",
    })).toEqual({
      purchaseContext: "onboarding",
      variationId: 4225,
      targetLicenseId: null,
      idempotencyKey: "browser-request-1",
    });
  });

  it("rejects target tampering and noncanonical variations", () => {
    expect(() => normalizeCreatePayload({
      purchase_context: "onboarding",
      variation_id: 4225,
      target_license_id: 99,
      idempotency_key: "x",
    })).toThrow("onboarding_target_forbidden");
    expect(() => normalizeCreatePayload({
      purchase_context: "renewal",
      variation_id: 9999,
      target_license_id: 99,
      idempotency_key: "x",
    })).toThrow("variation_id_invalid");
  });

  it("fails closed for untrusted browser origins", () => {
    expect(() => purchaseIntentCorsHeaders(new Request("https://example.test", {
      headers: { Origin: "https://attacker.example" },
    }))).toThrow("origin_not_allowed");
    expect(() => requirePurchaseIntentOrigin(new Request("https://example.test"))).toThrow("origin_required");
  });

  it("rejects numeric coercion and oversized/tampered snapshots", () => {
    expect(() => normalizeCreatePayload({purchase_context:"onboarding",variation_id:"4225",idempotency_key:"x"})).toThrow("variation_id_invalid");
    expect(() => validateBindPayload({purchase_intent_id:"e148ea0a-e4b6-45c4-bf3c-e6a430481ca1",cart_binding_hash:"a".repeat(64),woocommerce_order_id:1,woocommerce_order_item_id:2,woocommerce_customer_id:"0",product_id:4224,variation_id:4225,quantity:1,billing_term:"monthly",amount_cents:50000,currency:"COP"})).toThrow("woocommerce_customer_id_invalid");
  });

  it("authenticates the opaque intent claim before cart attachment", () => {
    process.env.BILLING_PURCHASE_INTENTS_CLAIM_SECRET="unit-test-only-claim-secret";
    const id="e148ea0a-e4b6-45c4-bf3c-e6a430481ca1";
    const claim=signIntentClaim(id);
    expect(validateAttachPayload({purchase_intent_id:id,purchase_intent_claim:claim,cart_binding_hash:"b".repeat(64)})).toEqual({id,hash:"b".repeat(64)});
    expect(()=>validateAttachPayload({purchase_intent_id:id,purchase_intent_claim:`${claim}x`,cart_binding_hash:"b".repeat(64)})).toThrow("purchase_intent_claim_invalid");
  });

  it("requires a claim for unbound cancellation without cart or order identity", () => {
    process.env.BILLING_PURCHASE_INTENTS_CLAIM_SECRET="unit-test-only-claim-secret";
    const id="e148ea0a-e4b6-45c4-bf3c-e6a430481ca1";
    const claim=signIntentClaim(id);
    expect(validateCancelPayload({purchase_intent_id:id,purchase_intent_claim:claim,reason:"cart_abandoned"})).toEqual({id,hash:null,order:null,reason:"cart_abandoned"});
    expect(()=>validateCancelPayload({purchase_intent_id:id,purchase_intent_claim:"bad",reason:"cart_abandoned"})).toThrow("purchase_intent_claim_invalid");
    expect(()=>validateCancelPayload({purchase_intent_id:id,reason:"unexpected"})).toThrow("reason_invalid");
  });
});
