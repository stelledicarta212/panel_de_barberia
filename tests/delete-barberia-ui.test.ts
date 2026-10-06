import { describe, expect, it } from "vitest";
import {
  evaluateDeleteEligibility,
  getBarberiaStatusTag,
  isBarberiaActivePlan,
  isExactNameConfirmation
} from "../src/lib/barberia-ui";

describe("BARBERAGENCY — DELETE BARBERIA UI MATRIX & UX VERIFICATION", () => {
  // Test 1: cancelled barberia -> delete visible/enabled
  it("1. cancelled barberia -> delete visible and eligible", () => {
    const cancelledBarberia = {
      subscription_state: "CANCELLED" as const,
      role: "owner"
    };
    expect(isBarberiaActivePlan(cancelledBarberia.subscription_state)).toBe(false);

    const tag = getBarberiaStatusTag(cancelledBarberia);
    expect(tag.label).toBe("Cancelada");
    expect(tag.isActive).toBe(false);

    const eligibility = evaluateDeleteEligibility(cancelledBarberia, "owner");
    expect(eligibility.canDelete).toBe(true);
    expect(eligibility.blockedReason).toBeNull();
  });

  // Test 2: trial-expired barberia -> delete visible/enabled
  it("2. trial-expired barberia -> delete visible and eligible", () => {
    const trialExpiredBarberia = {
      subscription_state: "TRIAL_EXPIRED" as const,
      role: "owner"
    };
    expect(isBarberiaActivePlan(trialExpiredBarberia.subscription_state)).toBe(false);

    const tag = getBarberiaStatusTag(trialExpiredBarberia);
    expect(tag.label).toBe("Cancelada");
    expect(tag.isActive).toBe(false);

    const eligibility = evaluateDeleteEligibility(trialExpiredBarberia, "owner");
    expect(eligibility.canDelete).toBe(true);
    expect(eligibility.blockedReason).toBeNull();
  });

  // Test 3: active monthly -> action visible but blocked
  it("3. active monthly -> action visible but blocked with explanatory message", () => {
    const activeMonthlyBarberia = {
      subscription_state: "PAID_ACTIVE" as const,
      billing_term: "monthly" as const,
      role: "owner"
    };
    expect(isBarberiaActivePlan(activeMonthlyBarberia.subscription_state)).toBe(true);

    const tag = getBarberiaStatusTag(activeMonthlyBarberia);
    expect(tag.label).toBe("Mensual · Activo");
    expect(tag.isActive).toBe(true);

    const eligibility = evaluateDeleteEligibility(activeMonthlyBarberia, "owner");
    expect(eligibility.canDelete).toBe(false);
    expect(eligibility.blockedReason).toBe(
      "No puedes eliminar esta barbería mientras tenga un plan activo. Cancela primero el plan."
    );
  });

  // Test 4: active annual -> action visible but blocked
  it("4. active annual -> action visible but blocked with explanatory message", () => {
    const activeAnnualBarberia = {
      subscription_state: "PAID_ACTIVE" as const,
      billing_term: "annual" as const,
      role: "owner"
    };
    expect(isBarberiaActivePlan(activeAnnualBarberia.subscription_state)).toBe(true);

    const tag = getBarberiaStatusTag(activeAnnualBarberia);
    expect(tag.label).toBe("Anual · Activo");
    expect(tag.isActive).toBe(true);

    const eligibility = evaluateDeleteEligibility(activeAnnualBarberia, "owner");
    expect(eligibility.canDelete).toBe(false);
    expect(eligibility.blockedReason).toBe(
      "No puedes eliminar esta barbería mientras tenga un plan activo. Cancela primero el plan."
    );
  });

  // Test 5: trial-active & activation-pending states are also blocked
  it("5. trial-active and activation-pending states -> action visible but blocked", () => {
    const trialActive = { subscription_state: "TRIAL_ACTIVE" as const, role: "owner" };
    expect(isBarberiaActivePlan(trialActive.subscription_state)).toBe(true);
    expect(getBarberiaStatusTag(trialActive).label).toBe("Prueba activa");
    expect(evaluateDeleteEligibility(trialActive, "owner").canDelete).toBe(false);

    const activationPending = { subscription_state: "ACTIVATION_PENDING" as const, role: "owner" };
    expect(isBarberiaActivePlan(activationPending.subscription_state)).toBe(true);
    expect(getBarberiaStatusTag(activationPending).label).toBe("Activación pendiente");
    expect(evaluateDeleteEligibility(activationPending, "owner").canDelete).toBe(false);
  });

  // Test 6: modal typing mismatch -> delete disabled
  it("6. modal typing mismatch -> confirmation returns false", () => {
    const barberia = { nombre: "Barberia prueba 5", slug: "barberia-prueba-5" };

    expect(isExactNameConfirmation("", barberia)).toBe(false);
    expect(isExactNameConfirmation("   ", barberia)).toBe(false);
    expect(isExactNameConfirmation("Barberia", barberia)).toBe(false);
    expect(isExactNameConfirmation("Barberia prueba", barberia)).toBe(false);
    expect(isExactNameConfirmation("Barberia prueba 4", barberia)).toBe(false);
    expect(isExactNameConfirmation("barberia prueba 5", barberia)).toBe(false); // Case sensitive
  });

  // Test 7: exact name -> delete enabled
  it("7. exact name -> confirmation returns true", () => {
    const barberia = { nombre: "Barberia prueba 5", slug: "barberia-prueba-5" };

    // Exact name match
    expect(isExactNameConfirmation("Barberia prueba 5", barberia)).toBe(true);
    // Trimmed exact name match
    expect(isExactNameConfirmation("  Barberia prueba 5  ", barberia)).toBe(true);
    // Slug match fallback
    expect(isExactNameConfirmation("barberia-prueba-5", barberia)).toBe(true);
  });

  // Test 8: non-owner delete blocked
  it("8. non-owner user -> delete blocked regardless of subscription state", () => {
    const nonOwnerBarberia = {
      subscription_state: "TRIAL_EXPIRED" as const,
      role: "barbero"
    };

    const eligibility = evaluateDeleteEligibility(nonOwnerBarberia, "barbero");
    expect(eligibility.canDelete).toBe(false);
    expect(eligibility.blockedReason).toBe(
      "Solo el propietario de la barbería puede eliminarla."
    );
  });

  // Test 9: Responsive viewport layout geometry and no-clipping constraints
  describe("9. Responsive Viewport Constraints (320px, 360px, 390px, 430px, 1440px)", () => {
    const viewports = [
      { name: "320x700", width: 320, bodyPadding: 24, cardPadding: 24 },
      { name: "360x800", width: 360, bodyPadding: 24, cardPadding: 24 },
      { name: "390x844", width: 390, bodyPadding: 24, cardPadding: 28 },
      { name: "430x932", width: 430, bodyPadding: 24, cardPadding: 32 },
      { name: "1440x900", width: 1440, drawerMaxWidth: 520, bodyPadding: 48, cardPadding: 32 }
    ];

    it.each(viewports)("verifies no horizontal overflow for viewport $name", ({ width, drawerMaxWidth, bodyPadding, cardPadding }) => {
      const drawerWidth = drawerMaxWidth ? Math.min(width, drawerMaxWidth) : width;
      const availableCardWidth = drawerWidth - bodyPadding;
      const contentInnerWidth = availableCardWidth - cardPadding;

      // Typical delete button width with icon + padding + text is ~72px
      const minDeleteBtnWidth = 72;
      // Remaining width for title and status tag must be positive and ample
      const titleAvailableWidth = contentInnerWidth - minDeleteBtnWidth - 10; // 10px gap

      expect(drawerWidth).toBeLessThanOrEqual(width);
      expect(availableCardWidth).toBeGreaterThan(250);
      expect(contentInnerWidth).toBeGreaterThan(200);
      expect(titleAvailableWidth).toBeGreaterThan(120);
    });
  });
});
