import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BARBERAGENCY_NAVIGATION_LOGO_URL,
  DEADLOCK_FAILSAFE_MS,
  MIN_VISIBLE_MS,
  NavigationTransitionManager,
  ROUTE_TRANSITION_MESSAGES,
  getNavigationTransitionMessage,
  shouldShowNavigationTransition
} from "../src/lib/navigation-transition";

const currentUrl = "https://barberagency-barberagency.gymh5g.easypanel.host/barberia?barberia_id=198";

describe("navigation transition rules", () => {
  it("keeps the overlay hidden for same route clicks", () => {
    const decision = shouldShowNavigationTransition({
      href: "/barberia?barberia_id=198",
      currentUrl
    });

    expect(decision.shouldTransition).toBe(false);
    expect(decision.reason).toBe("same-route");
  });

  it("ignores hash-only navigation", () => {
    const decision = shouldShowNavigationTransition({
      href: "/barberia?barberia_id=198#servicios",
      currentUrl
    });

    expect(decision.shouldTransition).toBe(false);
    expect(decision.reason).toBe("same-route");
  });

  it("shows the overlay for internal route changes", () => {
    const decision = shouldShowNavigationTransition({
      href: "/clientes?barberia_id=198",
      currentUrl
    });

    expect(decision.shouldTransition).toBe(true);
    expect(decision.message).toBe("Cargando clientes...");
  });

  it("shows the overlay for meaningful search changes", () => {
    const decision = shouldShowNavigationTransition({
      href: "/barberia?barberia_id=199",
      currentUrl
    });

    expect(decision.shouldTransition).toBe(true);
  });

  it("shows the overlay for same-tab external WordPress routes", () => {
    const decision = shouldShowNavigationTransition({
      href: "https://barberagency-barberagency.gymh5g.easypanel.host/planes/",
      currentUrl
    });

    expect(decision.shouldTransition).toBe(true);
    expect(decision.message).toBe("Cargando planes...");
  });

  it("ignores new tabs, protocols, downloads, disabled links, and modified clicks", () => {
    expect(shouldShowNavigationTransition({ href: "/clientes", currentUrl, target: "_blank" }).reason).toBe("new-tab");
    expect(shouldShowNavigationTransition({ href: "mailto:hola@example.com", currentUrl }).reason).toBe("protocol");
    expect(shouldShowNavigationTransition({ href: "tel:+571234567", currentUrl }).reason).toBe("protocol");
    expect(shouldShowNavigationTransition({ href: "whatsapp://send?phone=1", currentUrl }).reason).toBe("protocol");
    expect(shouldShowNavigationTransition({ href: "/clientes", currentUrl, download: true }).reason).toBe("download");
    expect(shouldShowNavigationTransition({ href: "/clientes", currentUrl, disabled: true }).reason).toBe("disabled");
    expect(shouldShowNavigationTransition({ href: "/clientes", currentUrl, ctrlKey: true }).reason).toBe("modified-click");
  });

  it("centralizes route messages and keeps the official logo", () => {
    expect(getNavigationTransitionMessage("/barberos")).toBe("Cargando barberos...");
    expect(ROUTE_TRANSITION_MESSAGES["/inventario"]).toBe("Cargando caja...");
    expect(BARBERAGENCY_NAVIGATION_LOGO_URL).toBe(
      "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/02/4934139540562185050-e1776351048892.jpg"
    );
  });
});

describe("navigation transition minimum visibility timing & lifecycle (MIN_VISIBLE_MS = 300)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 1. route completes in 100ms -> overlay remains until ~300ms total
  it("1. route completes in 100ms -> overlay remains until 300ms total", () => {
    const manager = new NavigationTransitionManager();
    manager.startTransition("Cargando clientes...");

    // Fast navigation completes in 100ms
    vi.advanceTimersByTime(100);
    manager.onRouteComplete();

    // At 100ms, destination is ready, but overlay remains visible until 300ms
    expect(manager.isActive).toBe(true);

    // At 299ms, still active
    vi.advanceTimersByTime(199);
    expect(manager.isActive).toBe(true);

    // At 300ms, dismissal timer fires
    vi.advanceTimersByTime(1);
    expect(manager.isActive).toBe(false);
    manager.destroy();
  });

  // 2. route completes in 299ms -> closes ~1ms later
  it("2. route completes in 299ms -> closes 1ms later", () => {
    const manager = new NavigationTransitionManager();
    manager.startTransition("Cargando clientes...");

    vi.advanceTimersByTime(299);
    manager.onRouteComplete();

    // Overlay is still active at 299ms
    expect(manager.isActive).toBe(true);

    // 1ms later at 300ms total, it closes
    vi.advanceTimersByTime(1);
    expect(manager.isActive).toBe(false);
    manager.destroy();
  });

  // 3. route completes in 300ms -> closes immediately
  it("3. route completes in 300ms -> closes immediately", () => {
    const manager = new NavigationTransitionManager();
    manager.startTransition("Cargando clientes...");

    vi.advanceTimersByTime(300);
    manager.onRouteComplete();

    // Closes immediately with zero extra wait
    expect(manager.isActive).toBe(false);
    manager.destroy();
  });

  // 4. route completes in 800ms -> closes immediately at completion -> no additional 300ms
  it("4. route completes in 800ms -> closes immediately at completion without adding 300ms", () => {
    const manager = new NavigationTransitionManager();
    manager.startTransition("Cargando clientes...");

    vi.advanceTimersByTime(800);
    manager.onRouteComplete();

    // Closes immediately at 800ms, NOT waiting until 1100ms
    expect(manager.isActive).toBe(false);
    manager.destroy();
  });

  // 5. navigation begins immediately
  it("5. navigation begins immediately without blocking or artificial start delay", () => {
    const decision = shouldShowNavigationTransition({
      href: "/clientes",
      currentUrl
    });

    expect(decision.shouldTransition).toBe(true);

    const manager = new NavigationTransitionManager({
      minVisibleMs: MIN_VISIBLE_MS,
      deadlockFailsafeMs: DEADLOCK_FAILSAFE_MS
    });

    const startReturn = manager.startTransition("Cargando clientes...");
    expect(startReturn).toBeUndefined(); // synchronous, no Promise
    expect(manager.isActive).toBe(true);
    manager.destroy();
  });

  // 6. same-route guard preserved
  it("6. preserves same-route guard (no loader)", () => {
    const decision = shouldShowNavigationTransition({
      href: "/barberia?barberia_id=198",
      currentUrl: "https://barberagency-barberagency.gymh5g.easypanel.host/barberia?barberia_id=198"
    });
    expect(decision.shouldTransition).toBe(false);
    expect(decision.reason).toBe("same-route");
  });

  // 7. hash-only guard preserved
  it("7. preserves hash-only guard (no loader)", () => {
    const decision = shouldShowNavigationTransition({
      href: "/barberia?barberia_id=198#overview",
      currentUrl: "https://barberagency-barberagency.gymh5g.easypanel.host/barberia?barberia_id=198"
    });
    expect(decision.shouldTransition).toBe(false);
    expect(decision.reason).toBe("same-route");
  });

  // 8. external same-tab navigation preserved
  it("8. preserves external same-tab navigation transition", () => {
    const decision = shouldShowNavigationTransition({
      href: "https://barberagency-barberagency.gymh5g.easypanel.host/planes/",
      currentUrl: "https://barberagency-barberagency.gymh5g.easypanel.host/barberia?barberia_id=198"
    });
    expect(decision.shouldTransition).toBe(true);
    expect(decision.message).toBe("Cargando planes...");
  });

  // 9. deadlock failsafe remains 8000ms
  it("9. deadlock failsafe remains 8000ms and clears stuck overlay", () => {
    const manager = new NavigationTransitionManager();
    manager.startTransition("Cargando...");

    vi.advanceTimersByTime(7999);
    expect(manager.isActive).toBe(true);

    vi.advanceTimersByTime(1);
    expect(manager.isActive).toBe(false);
    manager.destroy();
  });

  // 10. overlay cannot remain stuck (forceHide clears immediately)
  it("10. overlay cannot remain stuck: forceHide immediately clears overlay", () => {
    const manager = new NavigationTransitionManager();
    manager.startTransition("Cargando...");

    manager.forceHide();
    expect(manager.isActive).toBe(false);
    expect(manager.transitionStartedAt).toBeNull();
    manager.destroy();
  });

  // 11. Timing constant and route contract integrity
  it("11. preserves business route mappings and configures MIN_VISIBLE_MS = 300", () => {
    expect(MIN_VISIBLE_MS).toBe(300);
    expect(DEADLOCK_FAILSAFE_MS).toBe(8000);
    expect(ROUTE_TRANSITION_MESSAGES["/citas"]).toBe("Cargando citas...");
    expect(ROUTE_TRANSITION_MESSAGES["/finanzas"]).toBe("Cargando programa de lealtad...");
  });

  // 12. Reentrancy: user clicks another route while transition is active
  it("12. handles reentrancy when user navigates to another route while previous transition is active", () => {
    const manager = new NavigationTransitionManager();

    // Route 1 clicked at t = 0
    manager.startTransition("Cargando citas...");
    expect(manager.isActive).toBe(true);

    // Route 1 completes at t = 50ms (dismissal scheduled for 300ms)
    vi.advanceTimersByTime(50);
    manager.onRouteComplete();
    expect(manager.isActive).toBe(true);

    // At t = 100ms, user clicks Route 2
    vi.advanceTimersByTime(50);
    manager.startTransition("Cargando barberos...");
    expect(manager.currentMessage).toBe("Cargando barberos...");
    expect(manager.isActive).toBe(true);

    // Route 2 completes at t = 150ms (50ms after Route 2 started)
    vi.advanceTimersByTime(50);
    manager.onRouteComplete();

    // At t = 300ms (when Route 1 would have dismissed), Route 2 transition is STILL active
    vi.advanceTimersByTime(150);
    expect(manager.isActive).toBe(true);

    // Route 2 minimum visibility completes at t = 100 + 300 = 400ms (100ms more)
    vi.advanceTimersByTime(100);
    expect(manager.isActive).toBe(false);
    manager.destroy();
  });

  // 13. manager.destroy() must leave active = false and notify subscribers
  it("13. manager.destroy() forces active = false and notifies subscriber", () => {
    let notifiedState = true;
    const manager = new NavigationTransitionManager({
      onStateChange: (state) => {
        notifiedState = state.isActive;
      }
    });

    manager.startTransition("Cargando servicios...");
    expect(manager.isActive).toBe(true);
    expect(notifiedState).toBe(true);

    // When destroy is called, it must unconditionally deactivate
    manager.destroy();
    expect(manager.isActive).toBe(false);
    expect(notifiedState).toBe(false);
    expect(manager.transitionStartedAt).toBeNull();
  });

  // 14. Original regression: unmount/cleanup during active transition cannot leave orphaned active state
  it("14. original regression: destruction during active transition leaves active = false without hung overlay", () => {
    let currentActive = false;
    const manager = new NavigationTransitionManager({
      minVisibleMs: 300,
      onStateChange: (state) => {
        currentActive = state.isActive;
      }
    });

    manager.startTransition("Cargando servicios...");
    expect(currentActive).toBe(true);

    // Simulate route change that triggers manager destroy on unmount
    manager.destroy();

    // In the old code, active was left TRUE with all timers destroyed (hung forever).
    // In the fixed code, active is guaranteed to be FALSE.
    expect(currentActive).toBe(false);
    expect(manager.isActive).toBe(false);

    // Advancing timers further produces no lingering effects
    vi.advanceTimersByTime(10000);
    expect(currentActive).toBe(false);
    expect(manager.isActive).toBe(false);
  });

  // 15. Rapid consecutive module navigation ending in clean dismiss
  it("15. rapid consecutive module navigation ends in active = false", () => {
    const states: boolean[] = [];
    const manager = new NavigationTransitionManager({
      minVisibleMs: 300,
      onStateChange: (state) => {
        states.push(state.isActive);
      }
    });

    // Nav 1: Panel -> Citas
    manager.startTransition("Cargando citas...");
    expect(manager.isActive).toBe(true);

    vi.advanceTimersByTime(50);
    // Nav 2: Citas -> Servicios before Nav 1 even finishes
    manager.startTransition("Cargando servicios...");
    expect(manager.isActive).toBe(true);
    expect(manager.currentMessage).toBe("Cargando servicios...");

    vi.advanceTimersByTime(50);
    // Nav 3: Servicios completes
    manager.onRouteComplete();
    expect(manager.isActive).toBe(true);

    // After remaining visibility (300 - 50 = 250ms), must deactivate
    vi.advanceTimersByTime(250);
    expect(manager.isActive).toBe(false);
    manager.destroy();
  });

  // 16. Deadlock failsafe fires when route never finishes (error / hang)
  it("16. deadlock failsafe unconditionally dismisses overlay if route hangs indefinitely", () => {
    let finalActive = true;
    const manager = new NavigationTransitionManager({
      deadlockFailsafeMs: 8000,
      onStateChange: (state) => {
        finalActive = state.isActive;
      }
    });

    manager.startTransition("Cargando servicios...");
    expect(manager.isActive).toBe(true);

    // Hangs for 7999ms
    vi.advanceTimersByTime(7999);
    expect(manager.isActive).toBe(true);

    // Exactly at 8000ms failsafe must trigger
    vi.advanceTimersByTime(1);
    expect(manager.isActive).toBe(false);
    expect(finalActive).toBe(false);
    manager.destroy();
  });
});

describe("Panel navigation flows & menu active state", () => {
  const baseUrl = "https://barberagency-barberagency.gymh5g.easypanel.host";

  it("navigates to /barberia (Panel) from each dashboard module", () => {
    const modules = [
      { from: "/servicios", label: "Servicios" },
      { from: "/citas", label: "Citas" },
      { from: "/clientes", label: "Clientes" },
      { from: "/barberos", label: "Barberos" },
      { from: "/finanzas", label: "Programa de Lealtad" },
      { from: "/inventario", label: "Caja / POS" }
    ];

    for (const mod of modules) {
      const decision = shouldShowNavigationTransition({
        href: "/barberia",
        currentUrl: `${baseUrl}${mod.from}`
      });
      expect(decision.shouldTransition).toBe(true);
      expect(decision.message).toBe("Cargando panel...");
      expect(decision.href).toBe("/barberia");
    }
  });

  it("ignores transition when clicking Panel from Panel (same-route)", () => {
    const decision = shouldShowNavigationTransition({
      href: "/barberia",
      currentUrl: `${baseUrl}/barberia`
    });
    expect(decision.shouldTransition).toBe(false);
    expect(decision.reason).toBe("same-route");
  });

  it("handles round-trip: Panel -> Servicios -> Panel cleanly", () => {
    const manager = new NavigationTransitionManager({ minVisibleMs: 300 });

    // Panel -> Servicios
    const d1 = shouldShowNavigationTransition({
      href: "/servicios",
      currentUrl: `${baseUrl}/barberia`
    });
    expect(d1.shouldTransition).toBe(true);
    expect(d1.message).toBe("Cargando servicios...");

    manager.startTransition(d1.message);
    expect(manager.isActive).toBe(true);
    vi.advanceTimersByTime(300);
    manager.onRouteComplete();
    expect(manager.isActive).toBe(false);

    // Servicios -> Panel
    const d2 = shouldShowNavigationTransition({
      href: "/barberia",
      currentUrl: `${baseUrl}/servicios`
    });
    expect(d2.shouldTransition).toBe(true);
    expect(d2.message).toBe("Cargando panel...");

    manager.startTransition(d2.message);
    expect(manager.isActive).toBe(true);
    vi.advanceTimersByTime(300);
    manager.onRouteComplete();
    expect(manager.isActive).toBe(false);
    manager.destroy();
  });

  it("evaluates menu isActive logic correctly for /barberia and other routes", () => {
    const checkIsActive = (itemHref: string, currentPathname: string) => {
      return currentPathname === itemHref || (itemHref === "/barberia" && currentPathname === "/");
    };

    // On /barberia: Panel is active, others are inactive
    expect(checkIsActive("/barberia", "/barberia")).toBe(true);
    expect(checkIsActive("/servicios", "/barberia")).toBe(false);
    expect(checkIsActive("/citas", "/barberia")).toBe(false);

    // On / (fallback/landing): Panel is active
    expect(checkIsActive("/barberia", "/")).toBe(true);
    expect(checkIsActive("/servicios", "/")).toBe(false);

    // On /servicios: Panel is inactive, Servicios is active
    expect(checkIsActive("/barberia", "/servicios")).toBe(false);
    expect(checkIsActive("/servicios", "/servicios")).toBe(true);

    // On /citas: Panel is inactive, Citas is active
    expect(checkIsActive("/barberia", "/citas")).toBe(false);
    expect(checkIsActive("/citas", "/citas")).toBe(true);
  });
});


