"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CalendarDays,
  CreditCard,
  HandHelping,
  LayoutGrid,
  LogOut,
  LockKeyhole,
  Scissors,
  Settings,
  ShieldQuestion,
  RefreshCw,
  Sparkles,
  Store,
  Trash2,
  UserRound,
  Users,
  X
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useDashboard } from "@/store/dashboard-context";
import { canAccessPath } from "@/lib/dashboard-access";
import { getSubscriptionDisplayInfo, BILLING_TERMS_MAP, formatSpanishDate } from "@/lib/product-state";
import { getBarberiaStatusTag, isExactNameConfirmation } from "@/lib/barberia-ui";
import type { DashboardIdentity, DashboardPermissions } from "@/types/dashboard-state";
import type { SessionMeBarberia } from "@/lib/session-me";

const NAV_ITEMS = [
  { href: "/", label: "Panel", icon: LayoutGrid, permission: "canViewDashboard" },
  { href: "/citas", label: "Citas", icon: CalendarDays, permission: "canViewAppointments" },
  { href: "/clientes", label: "Clientes", icon: Users, permission: "canViewClients" },
  { href: "/barberos", label: "Barberos", icon: UserRound, permission: "canViewBarbers" },
  { href: "/servicios", label: "Servicios", icon: Scissors, permission: "canViewServices" },
  { href: "/finanzas", label: "Programa de Lealtad", icon: HandHelping, permission: "canViewLoyalty" },
  { href: "/inventario", label: "Caja / POS", icon: CreditCard, permission: "canViewPOS" },
  { href: "/configuracion", label: "Configuración", icon: Settings, permission: "canViewSettings" },
  { href: "/soporte", label: "Soporte", icon: ShieldQuestion, permission: "canViewSupport" }
];

const CORE_BASE_URL = "";
const REGISTRO_BASE_URL = "https://barberagency-barberagency.gymh5g.easypanel.host";

function labelFromSlug(slug: string): string {
  const clean = slug.trim();
  if (!clean) return "";
  return clean
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildSettingsEditUrl(input: DashboardIdentity | null): string {
  const barberiaId = Number(input?.barberia_id || 0);
  const cleanSlug = String(input?.slug || "").trim();
  if (!barberiaId || !cleanSlug) return "/configuracion";
  const params = new URLSearchParams({
    mode: "edit",
    barberia_id: String(barberiaId),
    slug: cleanSlug
  });
  return `${REGISTRO_BASE_URL}/registro-barberias/?${params.toString()}`;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { identity, merged, error, message, access, isAuthenticated, login, logout, saving, session, productState, barberias, deleteBarberia } = useDashboard();
  const planDisplay = getSubscriptionDisplayInfo(productState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState("");
  const [recoverStatus, setRecoverStatus] = useState<{ type: "success" | "error" | null; text: string | null }>({ type: null, text: null });
  const [sendingRecover, setSendingRecover] = useState(false);
  const [isPlanDrawerOpen, setIsPlanDrawerOpen] = useState(false);
  const [isBarberiasModalOpen, setIsBarberiasModalOpen] = useState(false);
  const [deletingBarberia, setDeletingBarberia] = useState<SessionMeBarberia | null>(null);
  const [confirmBarberiaName, setConfirmBarberiaName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlanDrawerOpen && !isBarberiasModalOpen && !deletingBarberia) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (deletingBarberia && !isDeleting) {
          setDeletingBarberia(null);
          setConfirmBarberiaName("");
          setDeleteError(null);
        } else if (isBarberiasModalOpen && !isDeleting) {
          setIsBarberiasModalOpen(false);
          setBlockedNotice(null);
        } else if (isPlanDrawerOpen) {
          setIsPlanDrawerOpen(false);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isPlanDrawerOpen, isBarberiasModalOpen, deletingBarberia, isDeleting]);

  const permissions = access.permissions;
  const canViewCurrentPath = canAccessPath(pathname, permissions);
  const safeError =
    typeof error === "string" ? error : error ? JSON.stringify(error) : null;
  const safeMessage =
    typeof message === "string" ? message : message ? JSON.stringify(message) : null;
  const brandName = String(merged.biz_name || "").trim() || "BarberAgency";
  const brandLogo = String(merged.logo_url || "").trim();
  const currentSlug = String(merged.biz_slug || identity?.slug || "").trim();
  const settingsEditUrl = buildSettingsEditUrl(identity);
  const roleLabel = access.role === "owner" ? "admin" : access.role.replace("_", " ");
  const sessionSlug = String(session?.identity?.slug || identity?.slug || currentSlug || "").trim();
  const sessionBarbershopName = labelFromSlug(sessionSlug);
  const welcomeBarbershopName = sessionBarbershopName || brandName;

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await login(email, password);
    setShowWelcome(true);
  }

  async function handleRecoverRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSendingRecover(true);
    setRecoverStatus({ type: null, text: null });
    try {
      const { recoverPasswordRequest } = await import("@/lib/dashboard-api");
      const res = await recoverPasswordRequest({ email: recoverEmail, identity });
      if (res.ok) {
        setRecoverStatus({
          type: "success",
          text: res.message || "Se ha enviado un enlace de recuperación a tu correo."
        });
      } else {
        setRecoverStatus({
          type: "error",
          text: res.message || "No se pudo enviar el correo de recuperación."
        });
      }
    } catch (err) {
      setRecoverStatus({
        type: "error",
        text: err instanceof Error ? err.message : "Error al intentar recuperar contraseña."
      });
    } finally {
      setSendingRecover(false);
    }
  }

  if (!isAuthenticated) {
    if (isRecovering) {
      return (
        <main className="ba-dashboard-shell ba-login-shell">
          <section className="ba-login-card ba-card animate-fade-in">
            <div className="ba-login-icon">
              <LockKeyhole size={24} />
            </div>
            <div>
              <p className="ba-login-kicker">Recuperar contraseña</p>
              <h1>¿Olvidaste tu contraseña?</h1>
              <p className="ba-login-copy">{brandName}</p>
            </div>

            {recoverStatus.text && (
              <div className="ba-alert-stack">
                <p className={`ba-alert ${recoverStatus.type === "success" ? "ba-alert-ok" : "ba-alert-error"}`}>
                  {recoverStatus.text}
                </p>
              </div>
            )}

            <form className="ba-login-form" onSubmit={handleRecoverRequest}>
              <label className="ba-field">
                Correo electrónico
                <input
                  className="ba-input"
                  type="email"
                  autoComplete="email"
                  value={recoverEmail}
                  onChange={(event) => setRecoverEmail(event.target.value)}
                  required
                  placeholder="ejemplo@correo.com"
                />
              </label>
              <button className="ba-btn-main" type="submit" disabled={sendingRecover}>
                {sendingRecover ? "Enviando..." : "Enviar enlace de recuperación"}
              </button>
            </form>
            
            <div style={{ display: "flex", justifyContent: "center", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  setIsRecovering(false);
                  setRecoverStatus({ type: null, text: null });
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-gold, #d1a638)",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  textDecoration: "underline",
                  padding: 0
                }}
              >
                Volver al inicio de sesión
              </button>
            </div>
            
            <p className="ba-login-meta">id: {identity?.barberia_id ?? "-"} / slug: {(identity?.slug ?? currentSlug) || "-"}</p>
          </section>
        </main>
      );
    }

    return (
      <main className="ba-dashboard-shell ba-login-shell">
        <section className="ba-login-card ba-card">
          <div className="ba-login-icon">
            <LockKeyhole size={24} />
          </div>
          <div>
            <p className="ba-login-kicker">Dashboard privado</p>
            <h1>Iniciar sesion</h1>
            <p className="ba-login-copy">{brandName}</p>
          </div>

          {(safeError || safeMessage) && (
            <div className="ba-alert-stack">
              {safeError ? <p className="ba-alert ba-alert-error">{safeError}</p> : null}
              {safeMessage ? <p className="ba-alert ba-alert-ok">{safeMessage}</p> : null}
            </div>
          )}

          <form className="ba-login-form" onSubmit={handleLogin}>
            <label className="ba-field">
              Correo
              <input
                className="ba-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="ba-field">
              Password
              <input
                className="ba-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "-8px", marginBottom: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  setIsRecovering(true);
                  setRecoverStatus({ type: null, text: null });
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-gold, #d1a638)",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  textDecoration: "underline",
                  padding: 0
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <button className="ba-btn-main" type="submit" disabled={saving}>
              {saving ? "Validando..." : "Entrar"}
            </button>
          </form>
          <p className="ba-login-meta">id: {identity?.barberia_id ?? "-"} / slug: {(identity?.slug ?? currentSlug) || "-"}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="ba-dashboard-shell">
      {showWelcome && (
        <div className="ba-welcome-overlay" onClick={() => setShowWelcome(false)}>
          <div className="ba-welcome-card" onClick={(e) => e.stopPropagation()}>
            <div className="ba-welcome-image-wrapper">
              <img
                src="https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/02/Sin-titulo-600-x-700-px.png"
                alt="Bienvenida a BarberAgency"
                loading="eager"
                className="ba-welcome-image"
              />
            </div>
            <div className="ba-welcome-icon-wrapper">
              <Sparkles size={36} />
            </div>
            <h2 className="ba-welcome-title">¡Bienvenido de vuelta!</h2>
            <div className="ba-welcome-name">
              {String(session?.user?.nombre ?? session?.user?.name ?? email.split("@")[0])}
            </div>
            <div className="ba-welcome-role-badge">
              <span>{roleLabel}</span>
            </div>
            <div className="ba-welcome-shop">{welcomeBarbershopName}</div>
            <p className="ba-welcome-text">
              Has iniciado sesion con exito en el panel de {welcomeBarbershopName}. Todo tu espacio de trabajo esta listo y configurado para ti.
            </p>
            <button className="ba-welcome-btn" type="button" onClick={() => setShowWelcome(false)}>
              Comenzar a trabajar
            </button>
          </div>
        </div>
      )}
      <div className="ba-dashboard-frame">
        <aside className="ba-sidebar">
          <div className="ba-mobile-head">
            <div className="ba-mobile-head-row">
              <div className="ba-brand">
                {brandLogo ? (
                  <img className="ba-brand-logo" src={brandLogo} alt={brandName} loading="lazy" />
                ) : (
                  <span className="ba-brand-dot" />
                )}
                <strong>{brandName}</strong>
              </div>
              <div className="ba-mobile-topbar-actions">
                <button className="ba-icon-btn" type="button" aria-label="Notificaciones">
                  <Bell size={15} />
                </button>
                <ThemeToggle />
                <span
                  className={`ba-plan-tag is-${planDisplay.isWarning ? "warning" : planDisplay.isActive ? "active" : "pending"}`}
                  title={planDisplay.label}
                >
                  {planDisplay.dashboardBadge}
                </span>
                {planDisplay.state === "PAID_ACTIVE" ? (
                  <button
                    type="button"
                    className="ba-btn-plan-active"
                    onClick={() => setIsPlanDrawerOpen(true)}
                    title={planDisplay.dashboardCtaLabel}
                    aria-label={planDisplay.dashboardCtaLabel}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <span>{planDisplay.dashboardCtaLabel}</span>
                  </button>
                ) : planDisplay.isDashboardCtaAction ? (
                  <button
                    type="button"
                    className="ba-btn-gold"
                    onClick={() => window.location.reload()}
                    title={planDisplay.dashboardCtaLabel}
                    aria-label={planDisplay.dashboardCtaLabel}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <RefreshCw size={12} className={saving ? "animate-spin" : ""} />
                    <span>{planDisplay.dashboardCtaLabel}</span>
                  </button>
                ) : (
                  <a
                    className="ba-btn-gold"
                    href={planDisplay.dashboardCtaHref}
                    title={planDisplay.dashboardCtaLabel}
                    aria-label={planDisplay.dashboardCtaLabel}
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <span>{planDisplay.dashboardCtaLabel}</span>
                  </a>
                )}
              </div>
            </div>
            <div className="ba-search">Buscar barbería, cliente o cita...</div>
          </div>

          <div className="ba-brand">
            {brandLogo ? (
              <img className="ba-brand-logo" src={brandLogo} alt={brandName} loading="lazy" />
            ) : (
              <span className="ba-brand-dot" />
            )}
            <strong>{brandName}</strong>
          </div>

          <nav className="ba-nav">
            {NAV_ITEMS.map((item) => {
              if (!permissions[item.permission as keyof DashboardPermissions]) return null;
              const isActive = pathname === item.href;
              const Icon = item.icon;
              const href =
                item.href === "/configuracion"
                  ? settingsEditUrl
                  : item.href === "/soporte"
                    ? `${CORE_BASE_URL}/contactanos/`
                    : item.href;
              const isExternal = href.startsWith("http");
              const className = `ba-nav-item ${isActive && !isExternal ? "is-active" : ""}`;
              const content = (
                <span className="ba-nav-item-inner">
                  <Icon size={15} />
                  <span>{item.label}</span>
                </span>
              );
              if (isExternal) {
                return (
                  <a key={item.href} className={className} href={href}>
                    {content}
                  </a>
                );
              }
              return (
                <Link key={item.href} className={className} href={href}>
                  {content}
                </Link>
              );
            })}
          </nav>

          <button type="button" className="ba-mobile-logout-btn" onClick={logout}>
            <LogOut size={14} />
            Salir
          </button>

          <div className="ba-sidebar-footer">
            {barberias && barberias.length > 0 && (
              <button
                type="button"
                onClick={() => setIsBarberiasModalOpen(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  color: "var(--muted)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 0",
                  marginBottom: "8px"
                }}
              >
                <Store size={13} />
                <span>Mis barberías ({barberias.length})</span>
              </button>
            )}
            <p>rol: {roleLabel}</p>
            <p>id: {identity?.barberia_id ?? "-"}</p>
            <p>slug: {identity?.slug ?? "-"}</p>
            <button type="button" className="ba-logout-btn" onClick={logout}>
              <LogOut size={13} />
              Salir
            </button>
          </div>
        </aside>

        <section className="ba-main">
          <header className="ba-topbar ba-card">
            <div className="ba-search">Buscar barbería, cliente o cita...</div>
            <div className="ba-topbar-actions">
              {barberias && barberias.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsBarberiasModalOpen(true)}
                  title="Mis barberías"
                  aria-label="Mis barberías"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--panel-stroke, #333)",
                    background: "var(--panel, #18181b)",
                    color: "var(--text, #fff)",
                    cursor: "pointer",
                    fontWeight: 600
                  }}
                >
                  <Store size={14} />
                  <span>Mis barberías ({barberias.length})</span>
                </button>
              )}
              <button className="ba-icon-btn" type="button" aria-label="Notificaciones">
                <Bell size={15} />
              </button>
              <ThemeToggle />
              <span
                className={`ba-plan-tag is-${planDisplay.isWarning ? "warning" : planDisplay.isActive ? "active" : "pending"}`}
                title={planDisplay.label}
              >
                {planDisplay.dashboardBadge}
              </span>
              {planDisplay.state === "PAID_ACTIVE" ? (
                <button
                  type="button"
                  className="ba-btn-plan-active"
                  onClick={() => setIsPlanDrawerOpen(true)}
                  title={planDisplay.dashboardCtaLabel}
                  aria-label={planDisplay.dashboardCtaLabel}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <span>{planDisplay.dashboardCtaLabel}</span>
                </button>
              ) : planDisplay.isDashboardCtaAction ? (
                <button
                  type="button"
                  className="ba-btn-gold"
                  onClick={() => window.location.reload()}
                  title={planDisplay.dashboardCtaLabel}
                  aria-label={planDisplay.dashboardCtaLabel}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <RefreshCw size={12} className={saving ? "animate-spin" : ""} />
                  <span>{planDisplay.dashboardCtaLabel}</span>
                </button>
              ) : (
                <a
                  className="ba-btn-gold"
                  href={planDisplay.dashboardCtaHref}
                  title={planDisplay.dashboardCtaLabel}
                  aria-label={planDisplay.dashboardCtaLabel}
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <span>{planDisplay.dashboardCtaLabel}</span>
                </a>
              )}
            </div>
          </header>

          {planDisplay.showBanner && (
            <aside
              className={`ba-subscription-banner ba-card is-${planDisplay.bannerVariant}${
                planDisplay.state === "PAID_ACTIVE" && planDisplay.isWarning ? " ba-plan-expiry-warning" : ""
              }`}
              role="alert"
            >
              <div className="ba-subscription-banner-body">
                <h2
                  className={`ba-subscription-banner-title${
                    planDisplay.state === "PAID_ACTIVE" && planDisplay.isWarning ? " ba-plan-expiry-warning-title" : ""
                  }`}
                >
                  {planDisplay.bannerTitle}
                </h2>
                <p
                  className={`ba-subscription-banner-text${
                    planDisplay.state === "PAID_ACTIVE" && planDisplay.isWarning ? " ba-plan-expiry-warning-text" : ""
                  }`}
                >
                  {planDisplay.bannerMessage}
                </p>
              </div>
              <div className="ba-subscription-banner-cta">
                {planDisplay.isDashboardCtaAction ? (
                  <button
                    type="button"
                    className="ba-btn-gold"
                    onClick={() => window.location.reload()}
                    aria-label={planDisplay.bannerCtaLabel || planDisplay.dashboardCtaLabel}
                  >
                    {planDisplay.bannerCtaLabel || planDisplay.dashboardCtaLabel}
                  </button>
                ) : (
                  <a
                    className={`ba-btn-gold${
                      planDisplay.state === "PAID_ACTIVE" && planDisplay.isWarning ? " ba-plan-expiry-warning-cta" : ""
                    }`}
                    href={planDisplay.bannerCtaHref || planDisplay.dashboardCtaHref}
                    aria-label={planDisplay.bannerCtaLabel || planDisplay.dashboardCtaLabel}
                  >
                    {planDisplay.bannerCtaLabel || planDisplay.dashboardCtaLabel}
                  </a>
                )}
              </div>
            </aside>
          )}

          {(safeError || safeMessage) && (
            <section className="ba-alert-stack">
              {safeError ? <p className="ba-alert ba-alert-error">{safeError}</p> : null}
              {safeMessage ? <p className="ba-alert ba-alert-ok">{safeMessage}</p> : null}
            </section>
          )}

          {!identity?.barberia_id || productState?.subscription_state === "ZERO_BARBERIA" ? (
            <section className="ba-card ba-onboarding-empty-state">
              <div className="ba-onboarding-empty-icon">
                <Sparkles size={28} />
              </div>
              <h2>Empieza creando tu barbería</h2>
              <p>Al crearla tendrás 7 días gratis para probar BarberAgency.</p>
              <a
                className="ba-btn-gold ba-btn-large"
                href={planDisplay.dashboardCtaHref}
                aria-label="Crear mi barbería"
              >
                Crear mi barbería
              </a>
            </section>
          ) : canViewCurrentPath ? (
            children
          ) : (
            <section className="ba-card ba-access-denied">
              <h1>{planDisplay.isExpired ? "Acceso restringido por vencimiento" : "Acceso restringido"}</h1>
              <p>
                {planDisplay.isExpired
                  ? "Tu plan o periodo de prueba ha expirado. Renueva tu suscripción para volver a acceder a la gestión de citas y operaciones de tu barbería."
                  : "Tu rol actual no tiene permiso para ver este modulo."}
              </p>
              {planDisplay.isExpired ? (
                <div style={{ marginTop: "1.25rem" }}>
                  <a
                    className="ba-btn-gold ba-btn-large"
                    href={planDisplay.dashboardCtaHref}
                    aria-label={planDisplay.dashboardCtaLabel}
                  >
                    {planDisplay.dashboardCtaLabel}
                  </a>
                </div>
              ) : (
                <small>Rol: {roleLabel}</small>
              )}
            </section>
          )}
        </section>
      </div>

      {isPlanDrawerOpen && (
        <div
          className="ba-plan-drawer-overlay"
          onClick={() => setIsPlanDrawerOpen(false)}
          role="presentation"
        >
          <aside
            className="ba-plan-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ba-plan-drawer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ba-plan-drawer-header">
              <div>
                <span className="ba-plan-drawer-eyebrow">MI PLAN</span>
                <h2 id="ba-plan-drawer-title" className="ba-plan-drawer-title">
                  {productState?.plan_name || "BarberAgency"}
                </h2>
              </div>
              <button
                type="button"
                className="ba-plan-drawer-close"
                onClick={() => setIsPlanDrawerOpen(false)}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="ba-plan-drawer-body">
              {planDisplay.state === "PAID_ACTIVE" && planDisplay.isWarning && (
                <div className="ba-plan-drawer-expiry-notice">
                  <strong className="ba-plan-drawer-expiry-title">
                    {productState?.days_remaining === 1
                      ? "Tu plan vence mañana"
                      : `Tu plan vence en ${productState?.days_remaining} días`}
                  </strong>
                  {productState?.period_end && (
                    <span className="ba-plan-drawer-expiry-date">
                      Fecha de vencimiento: {formatSpanishDate(productState.period_end)}
                    </span>
                  )}
                </div>
              )}

              <div className="ba-plan-drawer-badge-row">
                <span
                  className={`ba-plan-tag is-${
                    planDisplay.state === "PAID_ACTIVE" && planDisplay.isWarning ? "warning" : "active"
                  }`}
                >
                  {planDisplay.state === "PAID_ACTIVE" && planDisplay.isWarning
                    ? planDisplay.dashboardBadge
                    : "Activo"}
                </span>
                {productState?.billing_term && BILLING_TERMS_MAP[productState.billing_term] ? (
                  <span className="ba-plan-drawer-term-badge">
                    {BILLING_TERMS_MAP[productState.billing_term]}
                  </span>
                ) : null}
              </div>

              <div className="ba-plan-drawer-card">
                <div className="ba-plan-drawer-field">
                  <span className="ba-plan-drawer-label">Barbería</span>
                  <strong className="ba-plan-drawer-value">{brandName}</strong>
                </div>

                <div className="ba-plan-drawer-field">
                  <span className="ba-plan-drawer-label">Plan contratado</span>
                  <strong className="ba-plan-drawer-value">
                    {productState?.plan_name || "BarberAgency"}
                    {productState?.billing_term && BILLING_TERMS_MAP[productState.billing_term]
                      ? ` · ${BILLING_TERMS_MAP[productState.billing_term]}`
                      : ""}
                  </strong>
                </div>

                <div className="ba-plan-drawer-field">
                  <span className="ba-plan-drawer-label">Estado</span>
                  <span className="ba-plan-drawer-status-text">Activo</span>
                </div>

                {productState?.period_start && (
                  <div className="ba-plan-drawer-field">
                    <span className="ba-plan-drawer-label">Fecha de inicio</span>
                    <strong className="ba-plan-drawer-value">
                      {formatSpanishDate(productState.period_start)}
                    </strong>
                  </div>
                )}

                {productState?.period_end && (
                  <div className="ba-plan-drawer-field">
                    <span className="ba-plan-drawer-label">Válido hasta</span>
                    <strong className="ba-plan-drawer-value">
                      {formatSpanishDate(productState.period_end)}
                    </strong>
                  </div>
                )}

                {typeof productState?.days_remaining === "number" && (
                  <div className="ba-plan-drawer-field">
                    <span className="ba-plan-drawer-label">Tiempo restante</span>
                    <strong className="ba-plan-drawer-value">
                      {productState.days_remaining}{" "}
                      {productState.days_remaining === 1 ? "día restante" : "días restantes"}
                    </strong>
                  </div>
                )}
              </div>
            </div>

            <div className="ba-plan-drawer-footer">
              <a
                href={planDisplay.bannerCtaHref || planDisplay.dashboardCtaHref}
                className={`ba-btn-gold ba-plan-drawer-primary-btn${
                  planDisplay.state === "PAID_ACTIVE" && planDisplay.isWarning ? " is-warning" : ""
                }`}
              >
                <span>
                  {planDisplay.state === "PAID_ACTIVE" && planDisplay.isWarning
                    ? "Renovar ahora"
                    : "Gestionar plan"}
                </span>
              </a>
              <button
                type="button"
                className="ba-plan-drawer-secondary-btn"
                onClick={() => setIsPlanDrawerOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </aside>
        </div>
      )}

      {isBarberiasModalOpen && (
        <div
          className="ba-plan-drawer-overlay"
          onClick={() => {
            if (!isDeleting) {
              setIsBarberiasModalOpen(false);
              setDeletingBarberia(null);
              setDeleteError(null);
              setBlockedNotice(null);
            }
          }}
          role="presentation"
        >
          <aside
            className="ba-plan-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ba-barberias-drawer-title"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "520px", width: "100%" }}
          >
            <div className="ba-plan-drawer-header">
              <div>
                <span className="ba-plan-drawer-eyebrow">CUENTA</span>
                <h2 id="ba-barberias-drawer-title" className="ba-plan-drawer-title">
                  Mis barberías
                </h2>
              </div>
              <button
                type="button"
                className="ba-plan-drawer-close"
                onClick={() => {
                  setIsBarberiasModalOpen(false);
                  setDeletingBarberia(null);
                  setDeleteError(null);
                  setBlockedNotice(null);
                }}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="ba-plan-drawer-body">
              <p style={{ fontSize: "13px", color: "var(--muted)", margin: 0 }}>
                Selecciona una barbería para abrir su panel o administra las que ya no utilizas.
              </p>

              {blockedNotice && (
                <div
                  role="alert"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    color: "#fbbf24",
                    fontSize: "12px",
                    lineHeight: "1.4"
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                  <span style={{ flex: 1 }}>{blockedNotice}</span>
                  <button
                    type="button"
                    onClick={() => setBlockedNotice(null)}
                    aria-label="Cerrar aviso"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#fbbf24",
                      cursor: "pointer",
                      padding: "0 2px",
                      fontSize: "16px",
                      fontWeight: 700,
                      lineHeight: 1
                    }}
                  >
                    ×
                  </button>
                </div>
              )}

              {barberias.length === 0 ? (
                <div className="ba-plan-drawer-card">
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
                    No tienes barberías registradas actualmente.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {barberias.map((b) => {
                    const isCurrent = Number(b.id) === Number(identity?.barberia_id);
                    const statusTag = getBarberiaStatusTag(b);
                    const isActivePlan = statusTag.isActive;
                    const isOwner =
                      String(b.role || "").trim().toLowerCase() === "owner" ||
                      String(access.role || "").trim().toLowerCase() === "owner" ||
                      !b.role;

                    return (
                      <div
                        key={b.id}
                        className={`ba-barberia-row-card${isCurrent ? " is-current" : ""}`}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
                              <strong style={{ fontSize: "14px", color: "var(--text)", wordBreak: "break-word" }}>
                                {b.nombre || b.slug || `Barbería #${b.id}`}
                              </strong>
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  background: statusTag.bg,
                                  color: statusTag.color,
                                  whiteSpace: "nowrap"
                                }}
                              >
                                {statusTag.label}
                              </span>
                              {isCurrent && (
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    padding: "2px 8px",
                                    borderRadius: "6px",
                                    background: "rgba(212, 175, 55, 0.15)",
                                    color: "#d4af37",
                                    whiteSpace: "nowrap"
                                  }}
                                >
                                  Actual
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                              slug: {b.slug} · ID: {b.id}
                            </div>
                          </div>

                          {isOwner && (
                            <div style={{ flexShrink: 0 }}>
                              {isActivePlan ? (
                                <button
                                  type="button"
                                  className="ba-barberia-delete-btn is-active-blocked"
                                  onClick={() =>
                                    setBlockedNotice(
                                      "No puedes eliminar esta barbería mientras tenga un plan activo. Cancela primero el plan."
                                    )
                                  }
                                  title="No puedes eliminar esta barbería mientras tenga un plan activo. Cancela primero el plan."
                                  aria-label={`No puedes eliminar ${b.nombre || b.slug}: plan activo`}
                                >
                                  <Trash2 size={13} />
                                  <span>Eliminar</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="ba-barberia-delete-btn is-eligible"
                                  onClick={() => {
                                    setBlockedNotice(null);
                                    setDeletingBarberia(b);
                                    setConfirmBarberiaName("");
                                    setDeleteError(null);
                                  }}
                                  title="Eliminar barbería"
                                  aria-label={`Eliminar barbería ${b.nombre || b.slug}`}
                                >
                                  <Trash2 size={13} />
                                  <span>Eliminar</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2px", gap: "8px" }}>
                          {!isCurrent ? (
                            <a
                              href={`/barberia?slug=${encodeURIComponent(b.slug)}&barberia_id=${b.id}`}
                              style={{
                                fontSize: "12px",
                                fontWeight: 600,
                                color: "var(--accent, #d4af37)",
                                textDecoration: "none",
                                padding: "4px 8px",
                                borderRadius: "6px",
                                background: "rgba(212, 175, 55, 0.1)"
                              }}
                            >
                              Cambiar a esta
                            </a>
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 500 }}>En uso actualmente</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {deletingBarberia && (
        <div
          className="ba-delete-modal-overlay"
          onClick={() => {
            if (!isDeleting) {
              setDeletingBarberia(null);
              setConfirmBarberiaName("");
              setDeleteError(null);
            }
          }}
          role="presentation"
        >
          <div
            className="ba-delete-modal-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ba-delete-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "rgba(239, 68, 68, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#f87171",
                  flexShrink: 0
                }}
              >
                <AlertTriangle size={20} />
              </div>
              <h3 id="ba-delete-modal-title" style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "var(--text)" }}>
                Eliminar barbería
              </h3>
            </div>

            <div style={{ fontSize: "13px", color: "var(--muted)", lineHeight: "1.5" }}>
              <p style={{ margin: "0 0 8px 0", color: "var(--text)" }}>
                Vas a eliminar:{" "}
                <strong style={{ color: "var(--accent, #d4af37)" }}>
                  {deletingBarberia.nombre || deletingBarberia.slug}
                </strong>
              </p>
              <p style={{ margin: "0 0 6px 0" }}>
                La barbería dejará de aparecer en tu cuenta y no aceptará nuevas reservas.
              </p>
              <p style={{ margin: 0 }}>
                El historial de citas, pagos y datos se conservará.
              </p>
            </div>

            <div>
              <label
                htmlFor="confirm-barberia-input"
                style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}
              >
                Escribe el nombre exacto para confirmar:{" "}
                <span style={{ color: "var(--accent, #d4af37)" }}>
                  {deletingBarberia.nombre || deletingBarberia.slug}
                </span>
              </label>
              <input
                id="confirm-barberia-input"
                type="text"
                value={confirmBarberiaName}
                onChange={(e) => setConfirmBarberiaName(e.target.value)}
                placeholder={deletingBarberia.nombre || deletingBarberia.slug}
                disabled={isDeleting}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--panel-stroke, #333)",
                  background: "var(--bg, #09090b)",
                  color: "var(--text, #fff)",
                  fontSize: "13px",
                  boxSizing: "border-box"
                }}
              />
            </div>

            {deleteError && (
              <p style={{ margin: 0, fontSize: "12px", color: "#f87171" }}>
                {deleteError}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  setDeletingBarberia(null);
                  setConfirmBarberiaName("");
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--panel-stroke, #333)",
                  background: "transparent",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={
                  !isExactNameConfirmation(confirmBarberiaName, deletingBarberia) ||
                  isDeleting
                }
                onClick={async () => {
                  setIsDeleting(true);
                  setDeleteError(null);
                  const res = await deleteBarberia(deletingBarberia.id);
                  setIsDeleting(false);
                  if (res.ok) {
                    setDeletingBarberia(null);
                    setConfirmBarberiaName("");
                    setIsBarberiasModalOpen(false);
                  } else {
                    const isSessionExpired =
                      res.error === "not_authenticated" ||
                      res.message === "Sesión requerida." ||
                      res.message === "Sesión no autorizada o expirada.";
                    if (isSessionExpired) {
                      setDeleteError("Tu sesión expiró. Inicia sesión nuevamente para continuar.");
                    } else {
                      setDeleteError(res.message || "Error al eliminar.");
                    }
                  }
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background:
                    isExactNameConfirmation(confirmBarberiaName, deletingBarberia) && !isDeleting
                      ? "#ef4444"
                      : "rgba(239, 68, 68, 0.4)",
                  color: "#fff",
                  cursor:
                    isExactNameConfirmation(confirmBarberiaName, deletingBarberia) && !isDeleting
                      ? "pointer"
                      : "not-allowed",
                  fontSize: "13px",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                {isDeleting ? "Eliminando..." : "Eliminar barbería"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

