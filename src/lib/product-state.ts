export type CanonicalBarberiaState = "none" | "single" | "multiple";

export type CanonicalSubscriptionState =
  | "ZERO_BARBERIA"
  | "TRIAL_ACTIVE"
  | "TRIAL_EXPIRING"
  | "TRIAL_EXPIRED"
  | "ACTIVATION_PENDING"
  | "PAID_ACTIVE";

export type CanonicalBillingTerm = "monthly" | "quarterly" | "semiannual" | "annual";

export interface CanonicalProductState {
  barberia_state: CanonicalBarberiaState;
  subscription_state: CanonicalSubscriptionState;
  plan_code: string | null;
  plan_name: string | null;
  billing_term: CanonicalBillingTerm | null;
  period_start: string | null;
  period_end: string | null;
  days_remaining: number | null;
}

export interface SubscriptionDisplayInfo {
  state: CanonicalSubscriptionState;
  label: string;
  badge: string;
  termLabel: string | null;

  // Header presentation
  headerTitle: string;
  headerBadge: string;
  headerSubtitle: string;
  headerCtaLabel: string;
  headerCtaHref: string;
  headerPillClass: "is-active" | "is-pending" | "is-warning";

  // Dashboard presentation
  dashboardLabel: string;
  dashboardBadge: string;
  dashboardSubtitle: string;
  dashboardCtaLabel: string;
  dashboardCtaHref: string;
  isDashboardCtaAction: boolean;

  // Contextual banner
  showBanner: boolean;
  bannerTitle: string;
  bannerMessage: string;
  bannerVariant: "info" | "warning" | "destructive" | "pending";

  // Status flags
  isWarning: boolean;
  isExpired: boolean;
  isActive: boolean;
  isPending: boolean;
}

const REGISTRO_BASE_URL = "https://barberagency-barberagency.gymh5g.easypanel.host";
const PLANS_URL = `${REGISTRO_BASE_URL}/planes/`;
const CREATE_BARBERIA_URL = `${REGISTRO_BASE_URL}/registro-barberias/`;

export const BILLING_TERMS_MAP: Record<CanonicalBillingTerm, string> = {
  monthly: "Mensual",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual"
};

export function isTrialState(state?: CanonicalSubscriptionState | null): boolean {
  return state === "TRIAL_ACTIVE" || state === "TRIAL_EXPIRING" || state === "TRIAL_EXPIRED";
}

export function isPaidActive(state?: CanonicalSubscriptionState | null): boolean {
  return state === "PAID_ACTIVE";
}

export function hasOperationalAccess(state?: CanonicalSubscriptionState | null): boolean {
  return state === "PAID_ACTIVE" || state === "TRIAL_ACTIVE" || state === "TRIAL_EXPIRING";
}

export function getSubscriptionDisplayInfo(productState?: CanonicalProductState | null): SubscriptionDisplayInfo {
  if (!productState) {
    return {
      state: "ZERO_BARBERIA",
      label: "Configura tu barbería",
      badge: "Configura tu barbería",
      termLabel: null,
      headerTitle: "Configura tu barbería",
      headerBadge: "Pendiente",
      headerSubtitle: "7 días gratis para probar",
      headerCtaLabel: "Crear mi barbería",
      headerCtaHref: CREATE_BARBERIA_URL,
      headerPillClass: "is-pending",
      dashboardLabel: "Empieza creando tu barbería",
      dashboardBadge: "Configura tu barbería",
      dashboardSubtitle: "Al crearla tendrás 7 días gratis para probar BarberAgency.",
      dashboardCtaLabel: "Crear mi barbería",
      dashboardCtaHref: CREATE_BARBERIA_URL,
      isDashboardCtaAction: false,
      showBanner: false,
      bannerTitle: "",
      bannerMessage: "",
      bannerVariant: "info",
      isWarning: false,
      isExpired: false,
      isActive: false,
      isPending: true
    };
  }

  const { subscription_state, plan_name, billing_term, period_end, days_remaining } = productState;
  const termLabel = billing_term && BILLING_TERMS_MAP[billing_term] ? BILLING_TERMS_MAP[billing_term] : null;
  const days = typeof days_remaining === "number" ? days_remaining : 0;
  const daysRemainingText = `${days} ${days === 1 ? "día restante" : "días restantes"}`;
  const expiringText = `Vence en ${days} ${days === 1 ? "día" : "días"}`;

  switch (subscription_state) {
    case "PAID_ACTIVE": {
      const planTitle = plan_name || "BarberAgency";
      const fullLabel = termLabel ? `${planTitle} (${termLabel})` : planTitle;
      const renewalDate = period_end ? period_end.slice(0, 10) : "";
      return {
        state: "PAID_ACTIVE",
        label: fullLabel,
        badge: termLabel ? `Activo · ${termLabel}` : "Activo",
        termLabel,
        headerTitle: termLabel ? `${planTitle} · ${termLabel}` : planTitle,
        headerBadge: "Activo",
        headerSubtitle: renewalDate ? `Renovación: ${renewalDate}` : "Activo",
        headerCtaLabel: "Ver mi plan",
        headerCtaHref: PLANS_URL,
        headerPillClass: "is-active",
        dashboardLabel: fullLabel,
        dashboardBadge: termLabel ? `Activo · ${termLabel}` : "Activo",
        dashboardSubtitle: "Activo",
        dashboardCtaLabel: "Ver mi plan",
        dashboardCtaHref: PLANS_URL,
        isDashboardCtaAction: false,
        showBanner: false,
        bannerTitle: "",
        bannerMessage: "",
        bannerVariant: "info",
        isWarning: false,
        isExpired: false,
        isActive: true,
        isPending: false
      };
    }

    case "TRIAL_ACTIVE": {
      return {
        state: "TRIAL_ACTIVE",
        label: "Prueba gratis",
        badge: `Prueba gratis (${days}d)`,
        termLabel: null,
        headerTitle: "Prueba gratis",
        headerBadge: "Prueba activa",
        headerSubtitle: daysRemainingText,
        headerCtaLabel: "Elegir plan",
        headerCtaHref: PLANS_URL,
        headerPillClass: "is-active",
        dashboardLabel: "Prueba gratis",
        dashboardBadge: `Prueba (${days}d)`,
        dashboardSubtitle: daysRemainingText,
        dashboardCtaLabel: "Elegir plan",
        dashboardCtaHref: PLANS_URL,
        isDashboardCtaAction: false,
        showBanner: false,
        bannerTitle: "",
        bannerMessage: "",
        bannerVariant: "info",
        isWarning: false,
        isExpired: false,
        isActive: true,
        isPending: false
      };
    }

    case "TRIAL_EXPIRING": {
      const warningTitle = `Tu prueba termina en ${days} ${days === 1 ? "día" : "días"}`;
      return {
        state: "TRIAL_EXPIRING",
        label: "Prueba gratis",
        badge: `Por vencer (${days}d)`,
        termLabel: null,
        headerTitle: "Prueba gratis",
        headerBadge: "Por vencer",
        headerSubtitle: expiringText,
        headerCtaLabel: "Elegir plan",
        headerCtaHref: PLANS_URL,
        headerPillClass: "is-warning",
        dashboardLabel: warningTitle,
        dashboardBadge: `Por vencer (${days}d)`,
        dashboardSubtitle: expiringText,
        dashboardCtaLabel: "Elegir plan",
        dashboardCtaHref: PLANS_URL,
        isDashboardCtaAction: false,
        showBanner: true,
        bannerTitle: warningTitle,
        bannerMessage: "Elige tu plan antes de que termine el periodo de prueba para continuar sin interrupciones.",
        bannerVariant: "warning",
        isWarning: true,
        isExpired: false,
        isActive: true,
        isPending: false
      };
    }

    case "TRIAL_EXPIRED": {
      return {
        state: "TRIAL_EXPIRED",
        label: "Prueba finalizada",
        badge: "Prueba finalizada",
        termLabel: null,
        headerTitle: "Prueba finalizada",
        headerBadge: "Vencido",
        headerSubtitle: "Prueba finalizada",
        headerCtaLabel: "Elegir plan",
        headerCtaHref: PLANS_URL,
        headerPillClass: "is-pending",
        dashboardLabel: "Tu prueba gratis terminó",
        dashboardBadge: "Prueba finalizada",
        dashboardSubtitle: "Elige un plan para continuar usando todas las funciones de BarberAgency.",
        dashboardCtaLabel: "Elegir plan para continuar",
        dashboardCtaHref: PLANS_URL,
        isDashboardCtaAction: false,
        showBanner: true,
        bannerTitle: "Tu prueba gratis terminó",
        bannerMessage: "Elige un plan para continuar usando todas las funciones de BarberAgency.",
        bannerVariant: "destructive",
        isWarning: true,
        isExpired: true,
        isActive: false,
        isPending: false
      };
    }

    case "ACTIVATION_PENDING": {
      return {
        state: "ACTIVATION_PENDING",
        label: "Estamos activando tu plan",
        badge: "Activando...",
        termLabel,
        headerTitle: "Activando tu plan...",
        headerBadge: "Activando...",
        headerSubtitle: "Procesando activación",
        headerCtaLabel: "Actualizar estado",
        headerCtaHref: "#",
        headerPillClass: "is-pending",
        dashboardLabel: "Estamos activando tu plan",
        dashboardBadge: "Activando...",
        dashboardSubtitle: "Tu pago fue recibido. La activación puede tardar unos momentos.",
        dashboardCtaLabel: "Actualizar estado",
        dashboardCtaHref: "#",
        isDashboardCtaAction: true,
        showBanner: true,
        bannerTitle: "Estamos activando tu plan",
        bannerMessage: "Tu pago fue recibido. La activación puede tardar unos momentos.",
        bannerVariant: "pending",
        isWarning: false,
        isExpired: false,
        isActive: false,
        isPending: true
      };
    }

    case "ZERO_BARBERIA":
    default: {
      return {
        state: "ZERO_BARBERIA",
        label: "Configura tu barbería",
        badge: "Configura tu barbería",
        termLabel: null,
        headerTitle: "Configura tu barbería",
        headerBadge: "Pendiente",
        headerSubtitle: "7 días gratis para probar",
        headerCtaLabel: "Crear mi barbería",
        headerCtaHref: CREATE_BARBERIA_URL,
        headerPillClass: "is-pending",
        dashboardLabel: "Empieza creando tu barbería",
        dashboardBadge: "Configura tu barbería",
        dashboardSubtitle: "Al crearla tendrás 7 días gratis para probar BarberAgency.",
        dashboardCtaLabel: "Crear mi barbería",
        dashboardCtaHref: CREATE_BARBERIA_URL,
        isDashboardCtaAction: false,
        showBanner: false,
        bannerTitle: "",
        bannerMessage: "",
        bannerVariant: "info",
        isWarning: false,
        isExpired: false,
        isActive: false,
        isPending: true
      };
    }
  }
}
