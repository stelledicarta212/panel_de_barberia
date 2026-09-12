import { describe, expect, it } from "vitest";
import {
  hasEntitlementAccess,
  resolveDashboardAccess,
  canAccessPath
} from "../src/lib/dashboard-access";
import type { DashboardStateResponse } from "../src/types/dashboard-state";

describe("dashboard-access — Entitlement Access Enforcement", () => {
  it("grants full access to TRIAL_ACTIVE when days_remaining > 0", () => {
    const state: DashboardStateResponse = {
      ok: true,
      role: "owner",
      subscription_state: "TRIAL_ACTIVE",
      days_remaining: 5
    };
    expect(hasEntitlementAccess(state)).toBe(true);
    const access = resolveDashboardAccess(state);
    expect(access.permissions.canViewDashboard).toBe(true);
    expect(access.permissions.canViewAppointments).toBe(true);
    expect(access.permissions.canViewClients).toBe(true);
    expect(access.permissions.canViewBarbers).toBe(true);
    expect(canAccessPath("/citas", access.permissions)).toBe(true);
    expect(canAccessPath("/barberia", access.permissions)).toBe(true);
  });

  it("grants full access to TRIAL_EXPIRING when days_remaining > 0", () => {
    const state: DashboardStateResponse = {
      ok: true,
      role: "owner",
      subscription_state: "TRIAL_EXPIRING",
      days_remaining: 2
    };
    expect(hasEntitlementAccess(state)).toBe(true);
    const access = resolveDashboardAccess(state);
    expect(access.permissions.canViewDashboard).toBe(true);
    expect(access.permissions.canViewAppointments).toBe(true);
    expect(canAccessPath("/citas", access.permissions)).toBe(true);
  });

  it("restricts access (LIMITED_PERMISSIONS) when TRIAL_EXPIRED", () => {
    const state: DashboardStateResponse = {
      ok: true,
      role: "owner",
      subscription_state: "TRIAL_EXPIRED",
      days_remaining: 0
    };
    expect(hasEntitlementAccess(state)).toBe(false);
    const access = resolveDashboardAccess(state);
    expect(access.permissions.canViewDashboard).toBe(false);
    expect(access.permissions.canViewAppointments).toBe(false);
    expect(access.permissions.canViewClients).toBe(false);
    expect(access.permissions.canViewBarbers).toBe(false);
    expect(access.permissions.canViewSettings).toBe(false);
    expect(access.permissions.canViewSupport).toBe(true);
    expect(canAccessPath("/citas", access.permissions)).toBe(false);
    expect(canAccessPath("/clientes", access.permissions)).toBe(false);
    expect(canAccessPath("/barberia", access.permissions)).toBe(false);
    expect(canAccessPath("/soporte", access.permissions)).toBe(true);
  });

  it("restricts access when TRIAL_ACTIVE has days_remaining <= 0", () => {
    const state: DashboardStateResponse = {
      ok: true,
      role: "owner",
      subscription_state: "TRIAL_ACTIVE",
      days_remaining: 0
    };
    expect(hasEntitlementAccess(state)).toBe(false);
    const access = resolveDashboardAccess(state);
    expect(access.permissions.canViewAppointments).toBe(false);
  });

  it("grants full access to PAID_ACTIVE with valid future period_end", () => {
    const futureDate = new Date(Date.now() + 15 * 86400000).toISOString();
    const state: DashboardStateResponse = {
      ok: true,
      role: "owner",
      subscription_state: "PAID_ACTIVE",
      days_remaining: 15,
      period_end: futureDate
    };
    expect(hasEntitlementAccess(state)).toBe(true);
    const access = resolveDashboardAccess(state);
    expect(access.permissions.canViewDashboard).toBe(true);
    expect(access.permissions.canViewAppointments).toBe(true);
    expect(access.permissions.canViewClients).toBe(true);
    expect(canAccessPath("/citas", access.permissions)).toBe(true);
  });

  it("restricts access to PAID_ACTIVE when period_end has expired", () => {
    const pastDate = new Date(Date.now() - 2 * 86400000).toISOString();
    const state: DashboardStateResponse = {
      ok: true,
      role: "owner",
      subscription_state: "PAID_ACTIVE",
      days_remaining: 0,
      period_end: pastDate
    };
    expect(hasEntitlementAccess(state)).toBe(false);
    const access = resolveDashboardAccess(state);
    expect(access.permissions.canViewDashboard).toBe(false);
    expect(access.permissions.canViewAppointments).toBe(false);
    expect(access.permissions.canViewClients).toBe(false);
    expect(access.permissions.canViewSupport).toBe(true);
    expect(canAccessPath("/citas", access.permissions)).toBe(false);
    expect(canAccessPath("/soporte", access.permissions)).toBe(true);
  });

  it("restricts access for ZERO_BARBERIA", () => {
    const state: DashboardStateResponse = {
      ok: true,
      role: "owner",
      subscription_state: "ZERO_BARBERIA"
    };
    expect(hasEntitlementAccess(state)).toBe(false);
    const access = resolveDashboardAccess(state);
    expect(access.permissions.canViewAppointments).toBe(false);
  });

  it("grants access during ACTIVATION_PENDING grace", () => {
    const state: DashboardStateResponse = {
      ok: true,
      role: "owner",
      subscription_state: "ACTIVATION_PENDING"
    };
    expect(hasEntitlementAccess(state)).toBe(true);
    const access = resolveDashboardAccess(state);
    expect(access.permissions.canViewDashboard).toBe(true);
    expect(access.permissions.canViewAppointments).toBe(true);
  });

  it("super_admin always retains full permissions regardless of state", () => {
    const state: DashboardStateResponse = {
      ok: true,
      role: "super_admin",
      subscription_state: "TRIAL_EXPIRED"
    };
    const access = resolveDashboardAccess(state);
    expect(access.permissions.canViewDashboard).toBe(true);
    expect(access.permissions.canViewAppointments).toBe(true);
    expect(access.permissions.canViewSettings).toBe(true);
  });
});
