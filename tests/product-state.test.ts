import { describe, expect, it } from "vitest";
import {
  getSubscriptionDisplayInfo,
  CanonicalProductState,
  formatSpanishDate
} from "../src/lib/product-state";

describe("getSubscriptionDisplayInfo — PAID_ACTIVE expiry warning", () => {
  const basePaidState: CanonicalProductState = {
    barberia_state: "single",
    subscription_state: "PAID_ACTIVE",
    plan_code: "plan_pro",
    plan_name: "Plan Pro",
    billing_term: "monthly",
    period_start: "2026-08-16T00:00:00.000Z",
    period_end: "2026-09-16T00:00:00.000Z",
    days_remaining: 30
  };

  it("does NOT trigger warning when days_remaining > 5", () => {
    const info6 = getSubscriptionDisplayInfo({ ...basePaidState, days_remaining: 6 });
    expect(info6.isWarning).toBe(false);
    expect(info6.showBanner).toBe(false);
    expect(info6.headerPillClass).toBe("is-active");
    expect(info6.dashboardBadge).toBe("Activo · Mensual");
    expect(info6.dashboardCtaLabel).toBe("Ver mi plan");

    const info30 = getSubscriptionDisplayInfo({ ...basePaidState, days_remaining: 30 });
    expect(info30.isWarning).toBe(false);
    expect(info30.showBanner).toBe(false);
    expect(info30.headerPillClass).toBe("is-active");
    expect(info30.dashboardBadge).toBe("Activo · Mensual");
  });

  it("triggers amber warning when days_remaining === 5", () => {
    const info = getSubscriptionDisplayInfo({ ...basePaidState, days_remaining: 5 });
    expect(info.isWarning).toBe(true);
    expect(info.showBanner).toBe(true);
    expect(info.headerPillClass).toBe("is-warning");
    expect(info.dashboardBadge).toBe("Vence en 5 días");
    expect(info.bannerTitle).toBe("Tu plan mensual vence en 5 días");
    expect(info.bannerMessage).toContain("Válido hasta el");
    expect(info.bannerCtaLabel).toBe("Renovar ahora");
    expect(info.dashboardCtaLabel).toBe("Ver mi plan");
  });

  it("triggers amber warning when days_remaining === 3", () => {
    const info = getSubscriptionDisplayInfo({ ...basePaidState, days_remaining: 3 });
    expect(info.isWarning).toBe(true);
    expect(info.showBanner).toBe(true);
    expect(info.headerPillClass).toBe("is-warning");
    expect(info.dashboardBadge).toBe("Vence en 3 días");
    expect(info.bannerTitle).toBe("Tu plan mensual vence en 3 días");
    expect(info.bannerCtaLabel).toBe("Renovar ahora");
    expect(info.dashboardCtaLabel).toBe("Ver mi plan");
  });

  it("triggers amber warning with singular copy when days_remaining === 1", () => {
    const info = getSubscriptionDisplayInfo({ ...basePaidState, days_remaining: 1 });
    expect(info.isWarning).toBe(true);
    expect(info.showBanner).toBe(true);
    expect(info.headerPillClass).toBe("is-warning");
    expect(info.dashboardBadge).toBe("Vence mañana");
    expect(info.bannerTitle).toBe("Tu plan vence mañana");
    expect(info.bannerCtaLabel).toBe("Renovar ahora");
    expect(info.dashboardCtaLabel).toBe("Ver mi plan");
  });

  it("formats fallback title correctly if billing_term is null", () => {
    const info = getSubscriptionDisplayInfo({
      ...basePaidState,
      billing_term: null,
      days_remaining: 4
    });
    expect(info.isWarning).toBe(true);
    expect(info.showBanner).toBe(true);
    expect(info.dashboardBadge).toBe("Vence en 4 días");
    expect(info.bannerTitle).toBe("Tu plan vence en 4 días");
  });

  it("does NOT trigger warning when days_remaining === 0", () => {
    const info = getSubscriptionDisplayInfo({ ...basePaidState, days_remaining: 0 });
    expect(info.isWarning).toBe(false);
    expect(info.showBanner).toBe(false);
    expect(info.headerPillClass).toBe("is-active");
  });

  it("does NOT trigger warning when days_remaining < 0", () => {
    const info = getSubscriptionDisplayInfo({ ...basePaidState, days_remaining: -2 });
    expect(info.isWarning).toBe(false);
    expect(info.showBanner).toBe(false);
    expect(info.headerPillClass).toBe("is-active");
  });

  it("does NOT trigger warning when days_remaining is null", () => {
    const info = getSubscriptionDisplayInfo({ ...basePaidState, days_remaining: null });
    expect(info.isWarning).toBe(false);
    expect(info.showBanner).toBe(false);
    expect(info.headerPillClass).toBe("is-active");
  });
});

describe("getSubscriptionDisplayInfo — Non-regression for other states", () => {
  it("TRIAL_ACTIVE renders green badge and Elegir plan", () => {
    const trial: CanonicalProductState = {
      barberia_state: "single",
      subscription_state: "TRIAL_ACTIVE",
      plan_code: null,
      plan_name: null,
      billing_term: null,
      period_start: "2026-09-01T00:00:00.000Z",
      period_end: "2026-09-08T00:00:00.000Z",
      days_remaining: 7
    };
    const info = getSubscriptionDisplayInfo(trial);
    expect(info.state).toBe("TRIAL_ACTIVE");
    expect(info.dashboardBadge).toBe("Prueba (7d)");
    expect(info.dashboardCtaLabel).toBe("Elegir plan");
    expect(info.showBanner).toBe(false);
    expect(info.headerPillClass).toBe("is-active");
  });

  it("TRIAL_EXPIRING renders warning banner and Elegir plan", () => {
    const trialExpiring: CanonicalProductState = {
      barberia_state: "single",
      subscription_state: "TRIAL_EXPIRING",
      plan_code: null,
      plan_name: null,
      billing_term: null,
      period_start: "2026-09-01T00:00:00.000Z",
      period_end: "2026-09-08T00:00:00.000Z",
      days_remaining: 2
    };
    const info = getSubscriptionDisplayInfo(trialExpiring);
    expect(info.state).toBe("TRIAL_EXPIRING");
    expect(info.showBanner).toBe(true);
    expect(info.bannerVariant).toBe("warning");
    expect(info.dashboardCtaLabel).toBe("Elegir plan");
  });

  it("ACTIVATION_PENDING renders pending banner and Verificar pago", () => {
    const pending: CanonicalProductState = {
      barberia_state: "single",
      subscription_state: "ACTIVATION_PENDING",
      plan_code: "plan_pro",
      plan_name: "Plan Pro",
      billing_term: "monthly",
      period_start: null,
      period_end: null,
      days_remaining: null
    };
    const info = getSubscriptionDisplayInfo(pending);
    expect(info.state).toBe("ACTIVATION_PENDING");
    expect(info.showBanner).toBe(true);
    expect(info.bannerVariant).toBe("pending");
    expect(info.dashboardCtaLabel).toBe("Actualizar estado");
  });
});

describe("formatSpanishDate", () => {
  it("formats ISO date string into Spanish locale date", () => {
    const formatted = formatSpanishDate("2026-09-16T00:00:00.000Z");
    expect(formatted).toContain("16 de septiembre de 2026");
  });

  it("returns '-' for empty/null values", () => {
    expect(formatSpanishDate(null)).toBe("-");
    expect(formatSpanishDate("")).toBe("-");
  });
});
