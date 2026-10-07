import { describe, expect, it } from "vitest";
import {
  BARBERAGENCY_NAVIGATION_LOGO_URL,
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
