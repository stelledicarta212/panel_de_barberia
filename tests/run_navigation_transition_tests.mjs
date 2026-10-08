import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Transpile navigation-transition.ts on the fly
const tsCode = fs.readFileSync("./src/lib/navigation-transition.ts", "utf8");
const jsCode = ts.transpileModule(tsCode, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

const customModule = { exports: {} };
const context = vm.createContext({
  module: customModule,
  exports: customModule.exports,
  require,
  console,
  setTimeout,
  clearTimeout,
  URL,
  Set,
  Date,
  performance
});

vm.runInContext(jsCode, context);
const {
  BARBERAGENCY_NAVIGATION_LOGO_URL,
  DEADLOCK_FAILSAFE_MS,
  MIN_VISIBLE_MS,
  NavigationTransitionManager,
  ROUTE_TRANSITION_MESSAGES,
  getNavigationTransitionMessage,
  shouldShowNavigationTransition
} = customModule.exports;

const currentUrl = "https://barberagency-barberagency.gymh5g.easypanel.host/barberia?barberia_id=198";

test("navigation rules: same route", () => {
  const decision = shouldShowNavigationTransition({
    href: "/barberia?barberia_id=198",
    currentUrl
  });
  assert.equal(decision.shouldTransition, false);
  assert.equal(decision.reason, "same-route");
});

test("navigation rules: hash only", () => {
  const decision = shouldShowNavigationTransition({
    href: "/barberia?barberia_id=198#servicios",
    currentUrl
  });
  assert.equal(decision.shouldTransition, false);
  assert.equal(decision.reason, "same-route");
});

test("navigation rules: internal route change", () => {
  const decision = shouldShowNavigationTransition({
    href: "/clientes?barberia_id=198",
    currentUrl
  });
  assert.equal(decision.shouldTransition, true);
  assert.equal(decision.message, "Cargando clientes...");
});

test("navigation rules: query change", () => {
  const decision = shouldShowNavigationTransition({
    href: "/barberia?barberia_id=199",
    currentUrl
  });
  assert.equal(decision.shouldTransition, true);
});

test("navigation rules: external wordpress same-tab", () => {
  const decision = shouldShowNavigationTransition({
    href: "https://barberagency-barberagency.gymh5g.easypanel.host/planes/",
    currentUrl
  });
  assert.equal(decision.shouldTransition, true);
  assert.equal(decision.message, "Cargando planes...");
});

test("navigation rules: ignored links", () => {
  assert.equal(shouldShowNavigationTransition({ href: "/clientes", currentUrl, target: "_blank" }).reason, "new-tab");
  assert.equal(shouldShowNavigationTransition({ href: "mailto:hola@example.com", currentUrl }).reason, "protocol");
  assert.equal(shouldShowNavigationTransition({ href: "tel:+571234567", currentUrl }).reason, "protocol");
  assert.equal(shouldShowNavigationTransition({ href: "whatsapp://send?phone=1", currentUrl }).reason, "protocol");
  assert.equal(shouldShowNavigationTransition({ href: "/clientes", currentUrl, download: true }).reason, "download");
  assert.equal(shouldShowNavigationTransition({ href: "/clientes", currentUrl, disabled: true }).reason, "disabled");
  assert.equal(shouldShowNavigationTransition({ href: "/clientes", currentUrl, ctrlKey: true }).reason, "modified-click");
});

test("navigation constants", () => {
  assert.equal(getNavigationTransitionMessage("/barberos"), "Cargando barberos...");
  assert.equal(ROUTE_TRANSITION_MESSAGES["/inventario"], "Cargando caja...");
  assert.equal(ROUTE_TRANSITION_MESSAGES["/servicios"], "Cargando servicios...");
  assert.equal(
    BARBERAGENCY_NAVIGATION_LOGO_URL,
    "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/02/4934139540562185050-e1776351048892.jpg"
  );
  assert.equal(MIN_VISIBLE_MS, 300);
  assert.equal(DEADLOCK_FAILSAFE_MS, 8000);
});

test("lifecycle: fast route completion respects MIN_VISIBLE_MS", async () => {
  let simulatedTime = 0;
  const manager = new NavigationTransitionManager({
    minVisibleMs: 300,
    deadlockFailsafeMs: 8000,
    getNow: () => simulatedTime
  });

  manager.startTransition("Cargando clientes...");
  assert.equal(manager.isActive, true);

  // Complete at 100ms
  simulatedTime = 100;
  manager.onRouteComplete();
  assert.equal(manager.isActive, true);

  // Wait for remaining timer (300 - 100 = 200ms)
  await new Promise((r) => setTimeout(r, 220));
  assert.equal(manager.isActive, false);
  manager.destroy();
});

test("lifecycle: slow route closes immediately upon completion", () => {
  let simulatedTime = 0;
  const manager = new NavigationTransitionManager({
    minVisibleMs: 300,
    deadlockFailsafeMs: 8000,
    getNow: () => simulatedTime
  });

  manager.startTransition("Cargando clientes...");
  assert.equal(manager.isActive, true);

  // Slow completion at 500ms (> 300ms)
  simulatedTime = 500;
  manager.onRouteComplete();
  assert.equal(manager.isActive, false);
  manager.destroy();
});

test("lifecycle: destroy() forces isActive = false and notifies listener", () => {
  let notifiedState = true;
  const manager = new NavigationTransitionManager({
    onStateChange: (state) => {
      notifiedState = state.isActive;
    }
  });

  manager.startTransition("Cargando servicios...");
  assert.equal(manager.isActive, true);
  assert.equal(notifiedState, true);

  manager.destroy();
  assert.equal(manager.isActive, false);
  assert.equal(notifiedState, false);
  assert.equal(manager.transitionStartedAt, null);
});

test("regression: destruction during active transition leaves active = false without hung overlay", () => {
  let currentActive = false;
  const manager = new NavigationTransitionManager({
    minVisibleMs: 300,
    onStateChange: (state) => {
      currentActive = state.isActive;
    }
  });

  manager.startTransition("Cargando servicios...");
  assert.equal(currentActive, true);

  // Simulate route change unmount destroying manager
  manager.destroy();
  assert.equal(currentActive, false);
  assert.equal(manager.isActive, false);
});

test("lifecycle: rapid consecutive navigations end with isActive = false", async () => {
  let simulatedTime = 0;
  const manager = new NavigationTransitionManager({
    minVisibleMs: 300,
    getNow: () => simulatedTime
  });

  // Nav 1
  manager.startTransition("Cargando citas...");
  assert.equal(manager.isActive, true);

  // Nav 2 before Nav 1 finishes
  simulatedTime = 50;
  manager.startTransition("Cargando servicios...");
  assert.equal(manager.isActive, true);
  assert.equal(manager.currentMessage, "Cargando servicios...");

  // Nav 2 completes at simulatedTime = 100
  simulatedTime = 100;
  manager.onRouteComplete();
  assert.equal(manager.isActive, true);

  // Remaining visibility is 300 - (100 - 50) = 250ms
  await new Promise((r) => setTimeout(r, 270));
  assert.equal(manager.isActive, false);
  manager.destroy();
});

test("failsafe: forceHide clears stuck transition unconditionally", () => {
  const manager = new NavigationTransitionManager();
  manager.startTransition("Cargando...");
  assert.equal(manager.isActive, true);

  manager.forceHide();
  assert.equal(manager.isActive, false);
  assert.equal(manager.transitionStartedAt, null);
  manager.destroy();
});

test("failsafe: deadlock failsafe clears stuck transition after timeout", async () => {
  const manager = new NavigationTransitionManager({
    deadlockFailsafeMs: 50 // Shortened failsafe for unit test execution
  });
  manager.startTransition("Cargando...");
  assert.equal(manager.isActive, true);

  await new Promise((r) => setTimeout(r, 70));
  assert.equal(manager.isActive, false);
  manager.destroy();
});

test("provider lifecycle: route change does not destroy manager, and overlay dismisses properly", async () => {
  let simulatedTime = 0;
  let isActive = false;
  let message = "";
  const manager = new NavigationTransitionManager({
    minVisibleMs: 300,
    deadlockFailsafeMs: 8000,
    getNow: () => simulatedTime,
    onStateChange: (state) => {
      isActive = state.isActive;
      message = state.message;
    }
  });

  let lastLocation = "/barberia";
  let pathname = "/barberia";

  // Simulate History patch effect (depends only on manager, NOT on pathname)
  let historyEffectDestroyed = false;
  const historyEffectCleanup = () => {
    historyEffectDestroyed = true;
    manager.destroy();
  };

  // 1. User taps "Servicios"
  manager.startTransition("Cargando servicios...");
  assert.equal(isActive, true);
  assert.equal(message, "Cargando servicios...");

  // 2. Navigation occurs (pushState fires)
  const nextLocation = "/servicios";
  if (lastLocation !== nextLocation) {
    lastLocation = nextLocation;
    manager.onRouteComplete();
  }

  // 3. Next.js updates pathname
  pathname = "/servicios";
  // Crucial: Because history effect does NOT depend on pathname, its cleanup does NOT run!
  assert.equal(historyEffectDestroyed, false);

  // 4. Route change effect runs for pathname = "/servicios"
  if (lastLocation !== pathname) {
    lastLocation = pathname;
    manager.onRouteComplete();
  } else if (manager.isActive) {
    manager.onRouteComplete();
  }

  // 5. Timer elapses (advance simulated time and wait)
  simulatedTime = 350;
  await new Promise((r) => setTimeout(r, 320));

  // Overlay MUST be dismissed
  assert.equal(isActive, false);
  assert.equal(manager.isActive, false);

  // 6. Real unmount of provider: cleanup runs
  historyEffectCleanup();
  assert.equal(historyEffectDestroyed, true);
  assert.equal(isActive, false);
});

