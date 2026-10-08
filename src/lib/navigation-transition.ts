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

export const MIN_VISIBLE_MS = 300;
export const DEADLOCK_FAILSAFE_MS = 8000;

export function calculateRemainingVisibleMs(
  transitionStartedAt: number | null,
  now: number = typeof performance !== "undefined" ? performance.now() : Date.now(),
  minVisibleMs: number = MIN_VISIBLE_MS
): number {
  if (transitionStartedAt === null) {
    return 0;
  }
  const elapsed = Math.max(0, now - transitionStartedAt);
  return Math.max(0, minVisibleMs - elapsed);
}

export type NavigationTransitionStateChange = {
  isActive: boolean;
  message: string;
};

export class NavigationTransitionManager {
  private active = false;
  private message = DEFAULT_NAVIGATION_TRANSITION_MESSAGE;
  private startedAt: number | null = null;
  private dismissalTimer: ReturnType<typeof setTimeout> | null = null;
  private failsafeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly options?: {
      minVisibleMs?: number;
      deadlockFailsafeMs?: number;
      onStateChange?: (state: NavigationTransitionStateChange) => void;
      getNow?: () => number;
    }
  ) {}

  public get isActive(): boolean {
    return this.active;
  }

  public get currentMessage(): string {
    return this.message;
  }

  public get transitionStartedAt(): number | null {
    return this.startedAt;
  }

  public startTransition(nextMessage?: string): void {
    const failsafeMs = this.options?.deadlockFailsafeMs ?? DEADLOCK_FAILSAFE_MS;
    const getNow =
      this.options?.getNow ??
      (typeof performance !== "undefined" ? () => performance.now() : () => Date.now());

    this.clearDismissalTimer();
    this.clearFailsafeTimer();

    this.message = nextMessage || DEFAULT_NAVIGATION_TRANSITION_MESSAGE;
    this.startedAt = getNow();
    this.active = true;
    this.notify();

    // Deadlock failsafe only. This is not a visual minimum duration.
    this.failsafeTimer = setTimeout(() => {
      this.clearFailsafeTimer();
      this.forceHide();
    }, failsafeMs);
  }

  public onRouteComplete(): void {
    if (!this.active || this.startedAt === null) {
      this.forceHide();
      return;
    }

    const minMs = this.options?.minVisibleMs ?? MIN_VISIBLE_MS;
    const getNow =
      this.options?.getNow ??
      (typeof performance !== "undefined" ? () => performance.now() : () => Date.now());
    const remaining = calculateRemainingVisibleMs(this.startedAt, getNow(), minMs);

    if (remaining > 0) {
      this.clearDismissalTimer();
      this.dismissalTimer = setTimeout(() => {
        this.clearDismissalTimer();
        this.forceHide();
      }, remaining);
    } else {
      this.forceHide();
    }
  }

  public forceHide(): void {
    this.clearDismissalTimer();
    this.clearFailsafeTimer();
    this.startedAt = null;
    if (this.active) {
      this.active = false;
      this.notify();
    }
  }

  public destroy(): void {
    this.forceHide();
  }

  private clearDismissalTimer(): void {
    if (this.dismissalTimer !== null) {
      clearTimeout(this.dismissalTimer);
      this.dismissalTimer = null;
    }
  }

  private clearFailsafeTimer(): void {
    if (this.failsafeTimer !== null) {
      clearTimeout(this.failsafeTimer);
      this.failsafeTimer = null;
    }
  }

  private notify(): void {
    this.options?.onStateChange?.({
      isActive: this.active,
      message: this.message
    });
  }
}

