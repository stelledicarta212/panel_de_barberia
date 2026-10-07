import { BILLING_TERMS_MAP, type CanonicalBillingTerm } from "@/lib/product-state";

export interface BarberiaStatusTag {
  label: string;
  bg: string;
  color: string;
  isActive: boolean;
}

const ACTIVE_PLAN_STATES = new Set([
  "PAID_ACTIVE",
  "TRIAL_ACTIVE",
  "TRIAL_EXPIRING",
  "ACTIVATION_PENDING"
]);

/**
 * Returns true if the subscription state represents an active entitlement.
 */
export function isBarberiaActivePlan(subscriptionState?: string | null): boolean {
  if (!subscriptionState) return false;
  return ACTIVE_PLAN_STATES.has(String(subscriptionState).trim().toUpperCase());
}

/**
 * Derives the canonical status display tag for a barbershop card.
 * Aligns with:
 * - "Cancelada" (for expired trials / cancelled states)
 * - "Anual · Activo" / "Mensual · Activo" (for paid active with term)
 * - "Prueba activa" / "Prueba por vencer" (for trials)
 */
export function getBarberiaStatusTag(barberia: {
  subscription_state?: string | null;
  billing_term?: string | null;
}): BarberiaStatusTag {
  const subState = String(barberia.subscription_state || "").trim().toUpperCase();
  const termKey = barberia.billing_term as CanonicalBillingTerm | undefined;
  const termLabel = termKey && BILLING_TERMS_MAP[termKey] ? BILLING_TERMS_MAP[termKey] : null;

  if (subState === "PAID_ACTIVE") {
    return {
      label: termLabel ? `${termLabel} · Activo` : "Activo",
      bg: "rgba(34, 197, 94, 0.15)",
      color: "#4ade80",
      isActive: true
    };
  }

  if (subState === "TRIAL_ACTIVE") {
    return {
      label: "Prueba activa",
      bg: "rgba(34, 197, 94, 0.15)",
      color: "#4ade80",
      isActive: true
    };
  }

  if (subState === "TRIAL_EXPIRING") {
    return {
      label: "Prueba por vencer",
      bg: "rgba(245, 158, 11, 0.15)",
      color: "#fbbf24",
      isActive: true
    };
  }

  if (subState === "ACTIVATION_PENDING") {
    return {
      label: "Activación pendiente",
      bg: "rgba(245, 158, 11, 0.15)",
      color: "#fbbf24",
      isActive: true
    };
  }

  // Default: cancelled, trial-expired, or inactive
  return {
    label: "Cancelada",
    bg: "rgba(239, 68, 68, 0.12)",
    color: "#f87171",
    isActive: false
  };
}

/**
 * Checks whether user can trigger deletion, or if blocked by active entitlement.
 */
export function evaluateDeleteEligibility(
  barberia: {
    subscription_state?: string | null;
    role?: string | null;
  },
  userRole?: string | null
): {
  canDelete: boolean;
  blockedReason: string | null;
} {
  const isOwner =
    String(barberia.role || "").trim().toLowerCase() === "owner" ||
    String(userRole || "").trim().toLowerCase() === "owner";

  if (!isOwner) {
    return {
      canDelete: false,
      blockedReason: "Solo el propietario de la barbería puede eliminarla."
    };
  }

  if (isBarberiaActivePlan(barberia.subscription_state)) {
    return {
      canDelete: false,
      blockedReason: "No puedes eliminar esta barbería mientras tenga un plan activo. Cancela primero el plan."
    };
  }

  return {
    canDelete: true,
    blockedReason: null
  };
}

/**
 * Evaluates whether confirmation text exactly matches the barberia name or slug.
 */
export function isExactNameConfirmation(
  input: string,
  barberia: {
    nombre?: string | null;
    slug?: string | null;
  }
): boolean {
  const trimmedInput = input.trim();
  if (!trimmedInput) return false;

  const targetName = (barberia.nombre || "").trim();
  const targetSlug = (barberia.slug || "").trim();

  return trimmedInput === targetName || (Boolean(targetSlug) && trimmedInput === targetSlug);
}
