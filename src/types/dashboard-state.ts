import type {
  CanonicalBarberiaState,
  CanonicalBillingTerm,
  CanonicalProductState,
  CanonicalSubscriptionState
} from "../lib/product-state";

export type {
  CanonicalBarberiaState,
  CanonicalBillingTerm,
  CanonicalProductState,
  CanonicalSubscriptionState
};

export type IdentityInput = {
  barberia_id?: number | null;
  slug?: string | null;
};

export type DashboardIdentity = {
  barberia_id: number | null;
  slug: string | null;
};

export type DashboardRole = "admin" | "owner" | "barbero" | "cajero" | "super_admin" | "guest";

export type DashboardPermissions = {
  canViewDashboard: boolean;
  canViewAppointments: boolean;
  canViewClients: boolean;
  canViewBarbers: boolean;
  canViewServices: boolean;
  canViewLoyalty: boolean;
  canViewPOS: boolean;
  canViewSettings: boolean;
  canViewSupport: boolean;
  canEditLanding: boolean;
  canPublishLanding: boolean;
  canChargePOS: boolean;
  canViewGlobalFinance: boolean;
};

export type DashboardUserAccess = {
  user_id: number | null;
  role: DashboardRole;
  permissions: DashboardPermissions;
  barber_id?: number | null;
  source?: string;
};

export type DashboardLoginSession = {
  user: Record<string, unknown>;
  access: DashboardUserAccess;
  identity: DashboardIdentity;
};

export type DashboardMerged = {
  biz_name: string;
  biz_slug: string;
  address: string;
  maps_url: string;
  palette_primary: string;
  palette_secondary: string;
  palette_accent: string;
  palette_text: string;
  logo_url: string;
  cover_url: string;
  hero_title: string;
  hero_subtitle: string;
  template_id: string;
  public_landing_url: string;
  reservation_url: string;
  qr_url: string;
  services: Array<Record<string, unknown>>;
  barbers: Array<Record<string, unknown>>;
  hours: Array<Record<string, unknown>>;
  clients: Array<Record<string, unknown>>;
  appointments: Array<Record<string, unknown>>;
  descansos: Array<Record<string, unknown>>;
};

export type DashboardBarberiaItem = {
  id: number;
  slug?: string | null;
  nombre?: string | null;
  role?: string | null;
  subscription_state?: CanonicalSubscriptionState | null;
  plan_code?: string | null;
  plan_name?: string | null;
  billing_term?: CanonicalBillingTerm | null;
  period_start?: string | null;
  period_end?: string | null;
  days_remaining?: number | null;
};

export type DashboardStateResponse = {
  ok: boolean;
  identity?: DashboardIdentity;
  user?: Record<string, unknown>;
  usuario?: Record<string, unknown>;
  role?: string;
  rol?: string;
  permissions?: Partial<DashboardPermissions>;
  permisos?: Partial<DashboardPermissions>;
  user_id?: number;
  current_barberia?: DashboardBarberiaItem | null;
  barberias?: DashboardBarberiaItem[];
  barberias_count?: number;
  next_action?: string;
  seed?: Record<string, unknown>;
  draft?: Record<string, unknown>;
  published?: Record<string, unknown>;
  merged?: Partial<DashboardMerged>;
  descansos?: Array<Record<string, unknown>>;
  message?: string;
  // Phase D canonical product state:
  product_state?: CanonicalProductState;
  barberia_state?: CanonicalBarberiaState;
  subscription_state?: CanonicalSubscriptionState;
  plan_code?: string | null;
  plan_name?: string | null;
  billing_term?: CanonicalBillingTerm | null;
  period_start?: string | null;
  period_end?: string | null;
  days_remaining?: number | null;
};

export type DashboardLoginResponse = {
  ok: boolean;
  status?: string;
  identity?: DashboardIdentity;
  user?: Record<string, unknown>;
  role?: DashboardRole | string;
  permissions?: Partial<DashboardPermissions>;
  message?: string;
};

export type DraftSaveResponse = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  [key: string]: unknown;
};

export type PublishResponse = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  barberia_id?: number;
  slug?: string;
  qr_code?: string;
  public_path?: string;
  qr_path?: string;
  public_landing_url?: string;
  reservation_url?: string;
  qr_url?: string;
  data?: {
    barberia_id?: number;
    slug?: string;
    public_landing_url?: string;
    reservation_url?: string;
    qr_url?: string;
  };
  [key: string]: unknown;
};

export const EMPTY_MERGED: DashboardMerged = {
  biz_name: "",
  biz_slug: "",
  address: "",
  maps_url: "",
  palette_primary: "#d4af37",
  palette_secondary: "#1a2740",
  palette_accent: "#f59e0b",
  palette_text: "#f5f7ff",
  logo_url: "",
  cover_url: "",
  hero_title: "",
  hero_subtitle: "",
  template_id: "v7",
  public_landing_url: "",
  reservation_url: "",
  qr_url: "",
  services: [],
  barbers: [],
  hours: [],
  clients: [],
  appointments: [],
  descansos: []
};
