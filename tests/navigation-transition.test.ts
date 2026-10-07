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

describe("navigation transition minimum visibility timing & lifecycle (MIN_VISIBLE_MS = 650)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 1. navigation begins immediately (no async delay / promise blocking)
  it("1. navigation begins immediately without blocking or artificial start delay", () => {
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
    expect(startReturn).toBeUndefined(); // synchronous execution, no Promise
    manager.destroy();
  });

  // 2. overlay activates immediately
  it("2. overlay activates immediately upon startTransition", () => {
    const manager = new NavigationTransitionManager();
    expect(manager.isActive).toBe(false);

    manager.startTransition("Cargando barberos...");
    expect(manager.isActive).toBe(true);
    expect(manager.currentMessage).toBe("Cargando barberos...");
    expect(manager.transitionStartedAt).toBe(0);
    manager.destroy();
  });

  // 3. destination completion before 650ms does not immediately hide overlay
  it("3. destination completion before 650ms does not immediately hide overlay", () => {
    const manager = new NavigationTransitionManager();
    manager.startTransition("Cargando clientes...");

    // Fast navigation completes in 50ms
    vi.advanceTimersByTime(50);
    manager.onRouteComplete();

    // Destination is ready, but overlay must remain visible to honor 650ms minimum
    expect(manager.isActive).toBe(true);
    manager.destroy();
  });

  // 4. overlay hides at approximately 650ms total visibility
  it("4. overlay hides at exactly 650ms total visibility for fast routes", () => {
    const manager = new NavigationTransitionManager();
    manager.startTransition("Cargando clientes...");

    // Route completes at 100ms
    vi.advanceTimersByTime(100);
    manager.onRouteComplete();
    expect(manager.isActive).toBe(true);

    // At 649ms (549ms after completion), still active
    vi.advanceTimersByTime(549);
    expect(manager.isActive).toBe(true);

    // At 650ms total elapsed, dismissal timer fires
    vi.advanceTimersByTime(1);
    expect(manager.isActive).toBe(false);
    manager.destroy();
  });

  // 5. navigation taking longer than 650ms hides immediately when complete
  it("5. navigation taking longer than 650ms hides immediately when complete", () => {
    const manager = new NavigationTransitionManager();
    manager.startTransition("Cargando clientes...");

    // Slow route finishes at 1200ms (> 650ms)
    vi.advanceTimersByTime(1200);
    expect(manager.isActive).toBe(true);

    manager.onRouteComplete();
    // Dismisses immediately because 1200ms >= 650ms
    expect(manager.isActive).toBe(false);
    manager.destroy();
  });

  // 6. 650ms is NOT added after slow navigation (approximately 2s total, NOT 2s + 650ms)
  it("6. 650ms is NOT added after slow navigation", () => {
    const manager = new NavigationTransitionManager();
    manager.startTransition("Cargando clientes...");

    // Slow navigation finishes at 2000ms
    vi.advanceTimersByTime(2000);
    manager.onRouteComplete();

    // Already hidden at 2000ms, not waiting until 2650ms
    expect(manager.isActive).toBe(false);
    manager.destroy();
  });

  // 7. same-route still shows no loader
  it("7. same-route still shows no loader", () => {
    const decision = shouldShowNavigationTransition({
      href: "/barberia?barberia_id=198",
      currentUrl: "https://barberagency-barberagency.gymh5g.easypanel.host/barberia?barberia_id=198"
    });
    expect(decision.shouldTransition).toBe(false);
    expect(decision.reason).toBe("same-route");
  });

  // 8. hash-only still shows no loader
  it("8. hash-only still shows no loader", () => {
    const decision = shouldShowNavigationTransition({
      href: "/barberia?barberia_id=198#overview",
      currentUrl: "https://barberagency-barberagency.gymh5g.easypanel.host/barberia?barberia_id=198"
    });
    expect(decision.shouldTransition).toBe(false);
    expect(decision.reason).toBe("same-route");
  });

  // 9. deadlock failsafe remains (8000ms clears stuck navigation)
  it("9. deadlock failsafe remains and clears overlay at 8000ms if route never completes", () => {
    const manager = new NavigationTransitionManager();
    manager.startTransition("Cargando...");

    vi.advanceTimersByTime(7999);
    expect(manager.isActive).toBe(true);

    vi.advanceTimersByTime(1);
    expect(manager.isActive).toBe(false);
    manager.destroy();
  });

  // 10. no business/routing changes: contract integrity
  it("10. preserves business route mappings without unintended alterations", () => {
    expect(MIN_VISIBLE_MS).toBe(650);
    expect(DEADLOCK_FAILSAFE_MS).toBe(8000);
    expect(ROUTE_TRANSITION_MESSAGES["/citas"]).toBe("Cargando citas...");
    expect(ROUTE_TRANSITION_MESSAGES["/finanzas"]).toBe("Cargando programa de lealtad...");
  });

  // 11. Reentrancy: user clicks another route while transition active
  it("11. handles reentrancy when user navigates to another route while previous transition is active", () => {
    const manager = new NavigationTransitionManager();

    // Route 1 clicked at t = 0
    manager.startTransition("Cargando citas...");
    expect(manager.isActive).toBe(true);

    // Route 1 completes at t = 50ms, dismissal scheduled at t = 650ms
    vi.advanceTimersByTime(50);
    manager.onRouteComplete();
    expect(manager.isActive).toBe(true);

    // At t = 200ms, user clicks Route 2
    vi.advanceTimersByTime(150);
    manager.startTransition("Cargando barberos...");
    expect(manager.currentMessage).toBe("Cargando barberos...");
    expect(manager.isActive).toBe(true);

    // Route 2 completes at t = 300ms (100ms after Route 2 started)
    vi.advanceTimersByTime(100);
    manager.onRouteComplete();

    // At t = 650ms (when Route 1 would have dismissed), Route 2 transition is STILL active
    vi.advanceTimersByTime(350);
    expect(manager.isActive).toBe(true);

    // Route 2 minimum visibility completes at t = 200 + 650 = 850ms (200ms more)
    vi.advanceTimersByTime(200);
    expect(manager.isActive).toBe(false);
    manager.destroy();
  });

  // 12. Failure safety: forceHide immediately dismisses without waiting
  it("12. failure safety: forceHide immediately clears overlay without waiting", () => {
    const manager = new NavigationTransitionManager();
    manager.startTransition("Cargando...");

    manager.forceHide();
    expect(manager.isActive).toBe(false);
    expect(manager.transitionStartedAt).toBeNull();
    manager.destroy();
  });
});

