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
  const { identity, merged, error, message } = useDashboard();
  const safeError =
    typeof error === "string" ? error : error ? JSON.stringify(error) : null;
  const safeMessage =
    typeof message === "string" ? message : message ? JSON.stringify(message) : null;
  const brandName = String(merged.biz_name || "").trim() || "BarberAgency";
  const brandLogo = String(merged.logo_url || "").trim();
  const currentSlug = String(merged.biz_slug || identity?.slug || "").trim();
  const editorUrl = buildEditorUrl(currentSlug, String(merged.template_id || "v2"));

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

