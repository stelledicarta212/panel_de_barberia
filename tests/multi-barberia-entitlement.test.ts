import { describe, expect, it } from "vitest";
import {
  hasEntitlementAccess,
  resolveDashboardAccess,
  canAccessPath,
  LIMITED_PERMISSIONS
} from "../src/lib/dashboard-access";
import { getSubscriptionDisplayInfo } from "../src/lib/product-state";
import type { DashboardStateResponse, CanonicalProductState } from "../src/types/dashboard-state";

describe("Production Multi-Barbershop Entitlement & Product-State Invariants", () => {
  // Test Tenant 198: Annual Paid Active in Multi-Barberia Account
  it("BARBERIA 198: resolves PAID_ACTIVE (annual), normal dashboard, full access = YES", () => {
    const state198: DashboardStateResponse = {
      ok: true,
      barberia_id: 198,
      current_barberia: {
        id: 198,
        slug: "barberia-prueba-4",
        nombre: "Barberia Prueba 4",
        role: "owner",
        subscription_state: "PAID_ACTIVE",
        plan_code: "barberagency_full",
        plan_name: "BarberAgency",
        billing_term: "annual",
        period_start: "2026-06-05T16:58:49.244Z",
        period_end: "2027-06-05T16:58:49.244Z",
        days_remaining: 267
      },
      product_state: {
        barberia_id: 198,
        barberia_state: "single",
        subscription_state: "PAID_ACTIVE",
        plan_code: "barberagency_full",
        plan_name: "BarberAgency",
        billing_term: "annual",
        period_start: "2026-06-05T16:58:49.244Z",
        period_end: "2027-06-05T16:58:49.244Z",
        days_remaining: 267
      },
      role: "owner",
      subscription_state: "PAID_ACTIVE",
      days_remaining: 267,
      period_end: "2027-06-05T16:58:49.244Z"
    };

    // Mandatory Invariant: current_barberia.id === product_state.barberia_id
    expect(state198.current_barberia?.id).toBe(state198.product_state?.barberia_id);
    expect(state198.product_state?.subscription_state).toBe("PAID_ACTIVE");
    expect(state198.product_state?.billing_term).toBe("annual");

    // Access Resolution
    expect(hasEntitlementAccess(state198)).toBe(true);
    const access = resolveDashboardAccess(state198);
    expect(access.permissions.canViewDashboard).toBe(true);
    expect(access.permissions.canViewAppointments).toBe(true);
    expect(access.permissions.canViewClients).toBe(true);
    expect(canAccessPath("/barberia", access.permissions)).toBe(true);
    expect(canAccessPath("/citas", access.permissions)).toBe(true);

    // UI Display State: normal dashboard, not empty/onboarding
    const display = getSubscriptionDisplayInfo(state198.product_state);
    expect(display.isExpired).toBe(false);
    expect(display.isActive).toBe(true);
    expect(display.badge).toBe("Activo · Anual");
  });

  // Test Tenant 197: Expired Trial in Multi-Barberia Account
  it("BARBERIA 197: resolves TRIAL_EXPIRED, limited dashboard, full access = NO", () => {
    const state197: DashboardStateResponse = {
      ok: true,
      barberia_id: 197,
      current_barberia: {
        id: 197,
        slug: "barberia-prueba-3-5b8f92",
        nombre: "Barberia prueba 3",
        role: "owner",
        subscription_state: "TRIAL_EXPIRED",
        plan_code: null,
        plan_name: null,
        billing_term: null,
        period_start: null,
        period_end: null,
        days_remaining: 0
      },
      product_state: {
        barberia_id: 197,
        barberia_state: "single",
        subscription_state: "TRIAL_EXPIRED",
        plan_code: null,
        plan_name: null,
        billing_term: null,
        period_start: null,
        period_end: null,
        days_remaining: 0
      },
      role: "owner",
      subscription_state: "TRIAL_EXPIRED",
      days_remaining: 0
    };

    expect(state197.current_barberia?.id).toBe(state197.product_state?.barberia_id);
    expect(hasEntitlementAccess(state197)).toBe(false);
    const access = resolveDashboardAccess(state197);

    // Operational routes blocked
    expect(access.permissions.canViewDashboard).toBe(false);
    expect(access.permissions.canViewAppointments).toBe(false);
    expect(access.permissions.canViewClients).toBe(false);
    expect(access.permissions.canViewSettings).toBe(false);
    expect(canAccessPath("/citas", access.permissions)).toBe(false);
    expect(canAccessPath("/barberia", access.permissions)).toBe(false);

    // Support and renewal remain accessible
    expect(access.permissions.canViewSupport).toBe(true);
    expect(canAccessPath("/soporte", access.permissions)).toBe(true);

    // UI Display State: expired banner, renewal CTA
    const display = getSubscriptionDisplayInfo(state197.product_state);
    expect(display.isExpired).toBe(true);
    expect(display.isActive).toBe(false);
    expect(display.showBanner).toBe(true);
  });

  // Test Tenant 214: Monthly Paid Active in Single-Barberia Context
  it("BARBERIA 214: resolves PAID_ACTIVE (monthly), normal dashboard, full access = YES", () => {
    const state214: DashboardStateResponse = {
      ok: true,
      barberia_id: 214,
      current_barberia: {
        id: 214,
        slug: "barberiaprueba21",
        nombre: "barberiaprueba2.1",
        role: "owner",
        subscription_state: "PAID_ACTIVE",
        plan_code: "barberagency_full",
        plan_name: "BarberAgency",
        billing_term: "monthly",
        period_start: "2026-09-18T18:31:08.142Z",
        period_end: "2026-10-18T18:31:08.142Z",
        days_remaining: 37
      },
      product_state: {
        barberia_id: 214,
        barberia_state: "single",
        subscription_state: "PAID_ACTIVE",
        plan_code: "barberagency_full",
        plan_name: "BarberAgency",
        billing_term: "monthly",
        period_start: "2026-09-18T18:31:08.142Z",
        period_end: "2026-10-18T18:31:08.142Z",
        days_remaining: 37
      },
      role: "owner",
      subscription_state: "PAID_ACTIVE",
      days_remaining: 37,
      period_end: "2026-10-18T18:31:08.142Z"
    };

    expect(state214.current_barberia?.id).toBe(state214.product_state?.barberia_id);
    expect(hasEntitlementAccess(state214)).toBe(true);
    const access = resolveDashboardAccess(state214);
    expect(access.permissions.canViewDashboard).toBe(true);
    expect(access.permissions.canViewAppointments).toBe(true);
    expect(canAccessPath("/barberia", access.permissions)).toBe(true);
    expect(canAccessPath("/citas", access.permissions)).toBe(true);

    const display = getSubscriptionDisplayInfo(state214.product_state);
    expect(display.isExpired).toBe(false);
    expect(display.isActive).toBe(true);
    expect(display.badge).toBe("Activo · Mensual");
  });

  // Zero Barberia User
  it("ZERO BARBERIA: resolves ZERO_BARBERIA, triggers onboarding screen, full access = NO", () => {
    const zeroState: DashboardStateResponse = {
      ok: true,
      current_barberia: null,
      product_state: {
        barberia_id: null,
        barberia_state: "none",
        subscription_state: "ZERO_BARBERIA",
        plan_code: null,
        plan_name: null,
        billing_term: null,
        period_start: null,
        period_end: null,
        days_remaining: null
      },
      subscription_state: "ZERO_BARBERIA"
    };

    expect(hasEntitlementAccess(zeroState)).toBe(false);
    const access = resolveDashboardAccess(zeroState);
    expect(access.permissions.canViewAppointments).toBe(false);
    expect(access.permissions.canViewDashboard).toBe(false);

    const display = getSubscriptionDisplayInfo(zeroState.product_state);
    expect(display.state).toBe("ZERO_BARBERIA");
    expect(display.isPending).toBe(true);
    expect(display.dashboardLabel).toBe("Empieza creando tu barbería");
  });

  // Unauthorized Tenant Access Attempt
  it("UNAUTHORIZED TENANT: fails closed without exposing tenant data", () => {
    const unauthState: DashboardStateResponse = {
      ok: false,
      subscription_state: "ZERO_BARBERIA"
    };

    expect(hasEntitlementAccess(unauthState)).toBe(false);
    const access = resolveDashboardAccess(unauthState);
    expect(access.permissions.canViewAppointments).toBe(false);
    expect(access.permissions.canViewClients).toBe(false);
    expect(access.permissions.canViewDashboard).toBe(false);
  });

  // Multi-Barbershop Switching: 198 -> 197 -> 214
  it("MULTI-BARBERIA SWITCH: 198 -> 197 -> 214 transitions cleanly without stale state", () => {
    const sequence: Array<{ id: number; expectedState: string; expectedAccess: boolean }> = [
      { id: 198, expectedState: "PAID_ACTIVE", expectedAccess: true },
      { id: 197, expectedState: "TRIAL_EXPIRED", expectedAccess: false },
      { id: 214, expectedState: "PAID_ACTIVE", expectedAccess: true }
    ];

    let currentProductState: CanonicalProductState | null = null;

    for (const step of sequence) {
      if (step.id === 198) {
        currentProductState = {
          barberia_id: 198,
          barberia_state: "single",
          subscription_state: "PAID_ACTIVE",
          plan_code: "barberagency_full",
          plan_name: "BarberAgency",
          billing_term: "annual",
          period_start: "2026-06-05T16:58:49.244Z",
          period_end: "2027-06-05T16:58:49.244Z",
          days_remaining: 267
        };
      } else if (step.id === 197) {
        currentProductState = {
          barberia_id: 197,
          barberia_state: "single",
          subscription_state: "TRIAL_EXPIRED",
          plan_code: null,
          plan_name: null,
          billing_term: null,
          period_start: null,
          period_end: null,
          days_remaining: 0
        };
      } else if (step.id === 214) {
        currentProductState = {
          barberia_id: 214,
          barberia_state: "single",
          subscription_state: "PAID_ACTIVE",
          plan_code: "barberagency_full",
          plan_name: "BarberAgency",
          billing_term: "monthly",
          period_start: "2026-09-18T18:31:08.142Z",
          period_end: "2026-10-18T18:31:08.142Z",
          days_remaining: 37
        };
      }

      expect(currentProductState?.barberia_id).toBe(step.id);
      expect(currentProductState?.subscription_state).toBe(step.expectedState);

      const mockResponse: DashboardStateResponse = {
        ok: true,
        barberia_id: step.id,
        current_barberia: {
          id: step.id,
          subscription_state: step.expectedState as any
        },
        product_state: currentProductState!,
        role: "owner"
      };

      const hasAccess = hasEntitlementAccess(mockResponse);
      expect(hasAccess).toBe(step.expectedAccess);
    }
  });
});
