"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
  UserRound,
  Users
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useDashboard } from "@/store/dashboard-context";
import { canAccessPath } from "@/lib/dashboard-access";
import type { DashboardPermissions } from "@/types/dashboard-state";

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

const CORE_BASE_URL = "https://barberagency-barberagency.gymh5g.easypanel.host";

function buildEditorUrl(slug: string, templateId: string): string {
  const cleanSlug = slug.trim();
  if (!cleanSlug) return "/configuracion";
  const params = new URLSearchParams({
    edit: "1",
    modo: "editar",
    mode: "edit",
    is_edit: "1",
    editing: "1",
    tpl: templateId.trim() || "v2",
    slug: cleanSlug,
    barberia_slug: cleanSlug
  });
  return `${CORE_BASE_URL}/landing_editor_v2/?${params.toString()}`;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { identity, merged, error, message, access, isAuthenticated, login, logout, saving } = useDashboard();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const permissions = access.permissions;
  const canViewCurrentPath = canAccessPath(pathname, permissions);
  const safeError =
    typeof error === "string" ? error : error ? JSON.stringify(error) : null;
  const safeMessage =
    typeof message === "string" ? message : message ? JSON.stringify(message) : null;
  const brandName = String(merged.biz_name || "").trim() || "BarberAgency";
  const brandLogo = String(merged.logo_url || "").trim();
  const currentSlug = String(merged.biz_slug || identity?.slug || "").trim();
  const editorUrl = buildEditorUrl(currentSlug, String(merged.template_id || "v2"));
  const roleLabel = access.role === "owner" ? "admin" : access.role.replace("_", " ");

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await login(email, password);
  }

  if (!isAuthenticated) {
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
            <button className="ba-btn-main" type="submit" disabled={saving || !identity}>
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
                <button className="ba-btn-gold" type="button">
                  Plan Pro
                </button>
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
                  ? editorUrl
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

          <div className="ba-sidebar-footer">
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
              <button className="ba-icon-btn" type="button" aria-label="Notificaciones">
                <Bell size={15} />
              </button>
              <ThemeToggle />
              <button className="ba-btn-gold" type="button">
                Plan Pro
              </button>
            </div>
          </header>

          {(safeError || safeMessage) && (
            <section className="ba-alert-stack">
              {safeError ? <p className="ba-alert ba-alert-error">{safeError}</p> : null}
              {safeMessage ? <p className="ba-alert ba-alert-ok">{safeMessage}</p> : null}
            </section>
          )}

          {canViewCurrentPath ? (
            children
          ) : (
            <section className="ba-card ba-access-denied">
              <h1>Acceso restringido</h1>
              <p>Tu rol actual no tiene permiso para ver este modulo.</p>
              <small>Rol: {roleLabel}</small>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

