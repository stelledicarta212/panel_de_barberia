export const BARBERAGENCY_NAVIGATION_LOGO_URL =
  "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/02/4934139540562185050-e1776351048892.jpg";

export const DEFAULT_NAVIGATION_TRANSITION_MESSAGE = "Cargando tu espacio...";

export const ROUTE_TRANSITION_MESSAGES: Record<string, string> = {
  "/": "Cargando panel...",
  "/barberia": "Cargando panel...",
  "/citas": "Cargando citas...",
  "/clientes": "Cargando clientes...",
  "/barberos": "Cargando barberos...",
  "/servicios": "Cargando servicios...",
  "/finanzas": "Cargando programa de lealtad...",
  "/inventario": "Cargando caja...",
  "/configuracion": "Cargando configuracion...",
  "/soporte": "Cargando soporte...",
  "/contactanos": "Cargando soporte...",
  "/planes": "Cargando planes...",
  "/registro-barberias": "Cargando configuracion..."
};

export type NavigationTransitionDecision = {
  shouldTransition: boolean;
  reason:
    | "disabled"
    | "modified-click"
    | "download"
    | "new-tab"
    | "empty"
    | "protocol"
    | "same-route"
    | "navigate";
  href: string;
  message: string;
};

type TransitionDecisionInput = {
  href: string;
  currentUrl: string;
  target?: string | null;
  download?: boolean | string | null;
  disabled?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

const NON_NAVIGATION_PROTOCOLS = new Set(["mailto:", "tel:", "sms:", "whatsapp:"]);

function normalizePathname(pathname: string): string {
  const clean = pathname.replace(/\/+$/, "");
  return clean || "/";
}

function normalizeSearch(search: string): string {
  return search || "";
}

function isSameRoute(current: URL, destination: URL): boolean {
  return (
    normalizePathname(current.pathname) === normalizePathname(destination.pathname) &&
    normalizeSearch(current.search) === normalizeSearch(destination.search)
  );
}

export function getNavigationTransitionMessage(href: string): string {
  try {
    const url = new URL(href, "https://barberagency-barberagency.gymh5g.easypanel.host");
    const pathname = normalizePathname(url.pathname);
    return ROUTE_TRANSITION_MESSAGES[pathname] || DEFAULT_NAVIGATION_TRANSITION_MESSAGE;
  } catch {
    return DEFAULT_NAVIGATION_TRANSITION_MESSAGE;
  }
}

export function shouldShowNavigationTransition(input: TransitionDecisionInput): NavigationTransitionDecision {
  const rawHref = String(input.href || "").trim();
  const message = getNavigationTransitionMessage(rawHref);

  if (input.disabled) {
    return { shouldTransition: false, reason: "disabled", href: rawHref, message };
  }
  if (input.metaKey || input.ctrlKey || input.shiftKey || input.altKey) {
    return { shouldTransition: false, reason: "modified-click", href: rawHref, message };
  }
  if (input.download) {
    return { shouldTransition: false, reason: "download", href: rawHref, message };
  }
  if (input.target && input.target.toLowerCase() !== "_self") {
    return { shouldTransition: false, reason: "new-tab", href: rawHref, message };
  }
  if (!rawHref || rawHref === "#") {
    return { shouldTransition: false, reason: "empty", href: rawHref, message };
  }

  try {
    const current = new URL(input.currentUrl);
    const destination = new URL(rawHref, current);

    if (NON_NAVIGATION_PROTOCOLS.has(destination.protocol)) {
      return { shouldTransition: false, reason: "protocol", href: rawHref, message };
    }

    if (isSameRoute(current, destination)) {
      return { shouldTransition: false, reason: "same-route", href: rawHref, message };
    }

    return { shouldTransition: true, reason: "navigate", href: rawHref, message };
  } catch {
    return { shouldTransition: false, reason: "empty", href: rawHref, message };
  }
}
