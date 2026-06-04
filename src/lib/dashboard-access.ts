import type {
  DashboardPermissions,
  DashboardRole,
  DashboardStateResponse,
  DashboardUserAccess
} from "@/types/dashboard-state";

export const NO_PERMISSIONS: DashboardPermissions = {
  canViewDashboard: false,
  canViewAppointments: false,
  canViewClients: false,
  canViewBarbers: false,
  canViewServices: false,
  canViewLoyalty: false,
  canViewPOS: false,
  canViewSettings: false,
  canViewSupport: false,
  canEditLanding: false,
  canPublishLanding: false,
  canChargePOS: false,
  canViewGlobalFinance: false
};

export const ALL_PERMISSIONS: DashboardPermissions = {
  canViewDashboard: true,
  canViewAppointments: true,
  canViewClients: true,
  canViewBarbers: true,
  canViewServices: true,
  canViewLoyalty: true,
  canViewPOS: true,
  canViewSettings: true,
  canViewSupport: true,
  canEditLanding: true,
  canPublishLanding: true,
  canChargePOS: true,
  canViewGlobalFinance: true
};

const ROLE_PERMISSIONS: Record<DashboardRole, DashboardPermissions> = {
  admin: ALL_PERMISSIONS,
  owner: ALL_PERMISSIONS,
  super_admin: ALL_PERMISSIONS,
  barbero: {
    canViewDashboard: true,
    canViewAppointments: true,
    canViewClients: false,
    canViewBarbers: false,
    canViewServices: false,
    canViewLoyalty: false,
    canViewPOS: false,
    canViewSettings: false,
    canViewSupport: true,
    canEditLanding: false,
    canPublishLanding: false,
    canChargePOS: false,
    canViewGlobalFinance: false
  },
  cajero: {
    canViewDashboard: true,
    canViewAppointments: true,
    canViewClients: true,
    canViewBarbers: false,
    canViewServices: false,
    canViewLoyalty: false,
    canViewPOS: true,
    canViewSettings: false,
    canViewSupport: true,
    canEditLanding: false,
    canPublishLanding: false,
    canChargePOS: true,
    canViewGlobalFinance: false
  },
  guest: NO_PERMISSIONS
};

function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRole(value: unknown): DashboardRole {
  const raw = safeText(value).toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "barbero" || raw === "cajero" || raw === "super_admin" || raw === "guest") {
    return raw;
  }
  return "guest";
}

function readAccessSource(rawState: DashboardStateResponse | null): string {
  if (rawState?.role || rawState?.rol || rawState?.user || rawState?.usuario) return "dashboard_state";
  return "default_admin";
}

export function resolveDashboardAccess(rawState: DashboardStateResponse | null): DashboardUserAccess {
  const user = rawState?.user ?? rawState?.usuario ?? {};
  const role = normalizeRole(rawState?.role ?? rawState?.rol ?? user.role ?? user.rol);
  const base = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.guest;
  const remotePermissions = (rawState?.permissions ?? rawState?.permisos ?? {}) as Partial<DashboardPermissions>;
  const userId = Number(user.id ?? user.user_id ?? 0);
  const barberId = Number(user.barber_id ?? user.barbero_id ?? 0);

  return {
    user_id: Number.isFinite(userId) && userId > 0 ? userId : null,
    role,
    barber_id: Number.isFinite(barberId) && barberId > 0 ? barberId : null,
    permissions: {
      ...base,
      ...remotePermissions
    },
    source: readAccessSource(rawState)
  };
}

export function resolveLoginAccess(raw: {
  user?: Record<string, unknown>;
  role?: unknown;
  permissions?: Partial<DashboardPermissions>;
}): DashboardUserAccess {
  const user = raw.user ?? {};
  const role = normalizeRole(raw.role ?? user.role ?? user.rol);
  const userId = Number(user.id ?? user.user_id ?? 0);
  const barberId = Number(user.barber_id ?? user.barbero_id ?? 0);

  return {
    user_id: Number.isFinite(userId) && userId > 0 ? userId : null,
    role,
    barber_id: Number.isFinite(barberId) && barberId > 0 ? barberId : null,
    permissions: {
      ...(ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.admin),
      ...(raw.permissions ?? {})
    },
    source: "login"
  };
}

export function canAccessPath(pathname: string, permissions: DashboardPermissions): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/barberia") return permissions.canViewDashboard;
  if (path.startsWith("/citas")) return permissions.canViewAppointments;
  if (path.startsWith("/clientes")) return permissions.canViewClients;
  if (path.startsWith("/barberos")) return permissions.canViewBarbers;
  if (path.startsWith("/servicios")) return permissions.canViewServices;
  if (path.startsWith("/finanzas")) return permissions.canViewLoyalty;
  if (path.startsWith("/inventario")) return permissions.canViewPOS;
  if (path.startsWith("/configuracion")) return permissions.canViewSettings;
  if (path.startsWith("/soporte")) return permissions.canViewSupport;
  return true;
}
