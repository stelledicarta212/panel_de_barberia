"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BARBERAGENCY_NAVIGATION_LOGO_URL,
  DEFAULT_NAVIGATION_TRANSITION_MESSAGE,
  DEADLOCK_FAILSAFE_MS,
  MIN_VISIBLE_MS,
  NavigationTransitionManager
} from "@/lib/navigation-transition";

type NavigationTransitionContextValue = {
  isActive: boolean;
  message: string;
  startTransition: (message?: string) => void;
  clearTransition: (options?: { immediate?: boolean }) => void;
};

const NavigationTransitionContext = createContext<NavigationTransitionContextValue | null>(null);

function getCurrentLocationKey(pathname: string | null): string {
  if (typeof window !== "undefined") {
    return window.location.pathname + window.location.search;
  }
  return pathname || "";
}

export function NavigationTransitionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isActive, setIsActive] = useState(false);
  const [message, setMessage] = useState(DEFAULT_NAVIGATION_TRANSITION_MESSAGE);
  const lastLocationRef = useRef("");

  const [manager] = useState(
    () =>
      new NavigationTransitionManager({
        minVisibleMs: MIN_VISIBLE_MS,
        deadlockFailsafeMs: DEADLOCK_FAILSAFE_MS,
        onStateChange: (state) => {
          setIsActive(state.isActive);
          setMessage(state.message);
        }
      })
  );

  const clearTransition = useCallback(
    (options?: { immediate?: boolean }) => {
      if (options?.immediate) {
        manager.forceHide();
      } else {
        manager.onRouteComplete();
      }
    },
    [manager]
  );

  const startTransition = useCallback(
    (nextMessage?: string) => {
      manager.startTransition(nextMessage);
    },
    [manager]
  );

  useEffect(() => {
    const currentKey = getCurrentLocationKey(pathname);
    if (!lastLocationRef.current) {
      lastLocationRef.current = currentKey;
      return;
    }
    if (lastLocationRef.current !== currentKey) {
      lastLocationRef.current = currentKey;
      manager.onRouteComplete();
    }
  }, [manager, pathname]);

  useEffect(() => {
    const rememberAndComplete = () => {
      const currentKey = getCurrentLocationKey(pathname);
      if (lastLocationRef.current !== currentKey) {
        lastLocationRef.current = currentKey;
        manager.onRouteComplete();
      }
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function patchedPushState(...args) {
      const result = originalPushState.apply(this, args);
      rememberAndComplete();
      return result;
    };
    window.history.replaceState = function patchedReplaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      rememberAndComplete();
      return result;
    };

    window.addEventListener("popstate", rememberAndComplete);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", rememberAndComplete);
      manager.destroy();
    };
  }, [manager, pathname]);

  useEffect(() => {
    const handleImmediateHide = () => {
      manager.forceHide();
    };

    window.addEventListener("pagehide", handleImmediateHide);
    window.addEventListener("visibilitychange", handleImmediateHide);
    return () => {
      window.removeEventListener("pagehide", handleImmediateHide);
      window.removeEventListener("visibilitychange", handleImmediateHide);
      handleImmediateHide();
    };
  }, [manager]);


  const value = useMemo(
    () => ({ isActive, message, startTransition, clearTransition }),
    [clearTransition, isActive, message, startTransition]
  );

  return (
    <NavigationTransitionContext.Provider value={value}>
      {children}
      <div
        className={`ba-navigation-transition${isActive ? " is-active" : ""}`}
        role="status"
        aria-live="polite"
        aria-hidden={isActive ? "false" : "true"}
      >
        <div className="ba-navigation-transition-card">
          <div className="ba-navigation-transition-logo-wrap" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote WordPress brand asset must match the onboarding loader exactly. */}
            <img
              className="ba-navigation-transition-logo"
              src={BARBERAGENCY_NAVIGATION_LOGO_URL}
              alt=""
              loading="eager"
              decoding="async"
            />
          </div>
          <p className="ba-navigation-transition-brand">BarberAgency</p>
          <p className="ba-navigation-transition-message">{message}</p>
        </div>
      </div>
    </NavigationTransitionContext.Provider>
  );
}

export function useNavigationTransition() {
  const context = useContext(NavigationTransitionContext);
  if (!context) {
    throw new Error("useNavigationTransition must be used inside NavigationTransitionProvider");
  }
  return context;
}
