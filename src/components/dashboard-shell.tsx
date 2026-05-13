"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarDays,
  CreditCard,
  HandHelping,
  LayoutGrid,
  Scissors,
  Settings,
  ShieldQuestion,
  UserRound,
  Users
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useDashboard } from "@/store/dashboard-context";

const NAV_ITEMS = [
  { href: "/", label: "Panel", icon: LayoutGrid },
  { href: "/citas", label: "Citas", icon: CalendarDays },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/barberos", label: "Barberos", icon: UserRound },
  { href: "/servicios", label: "Servicios", icon: Scissors },
  { href: "/finanzas", label: "Programa de Lealtad", icon: HandHelping },
  { href: "/inventario", label: "Caja / POS", icon: CreditCard },
  { href: "/configuracion", label: "Configuración", icon: Settings },
  { href: "/soporte", label: "Soporte", icon: ShieldQuestion }
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { identity, merged, error, message } = useDashboard();
  const safeError =
    typeof error === "string" ? error : error ? JSON.stringify(error) : null;
  const safeMessage =
    typeof message === "string" ? message : message ? JSON.stringify(message) : null;
  const brandName = String(merged.biz_name || "").trim() || "BarberAgency";
  const brandLogo = String(merged.logo_url || "").trim();

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
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} className={`ba-nav-item ${isActive ? "is-active" : ""}`} href={item.href}>
                  <span className="ba-nav-item-inner">
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="ba-sidebar-footer">
            <p>id: {identity?.barberia_id ?? "-"}</p>
            <p>slug: {identity?.slug ?? "-"}</p>
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

          {children}
        </section>
      </div>
    </main>
  );
}

