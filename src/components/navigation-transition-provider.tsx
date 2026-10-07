"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BARBERAGENCY_NAVIGATION_LOGO_URL,
  DEFAULT_NAVIGATION_TRANSITION_MESSAGE
} from "@/lib/navigation-transition";

type NavigationTransitionContextValue = {
  isActive: boolean;
  message: string;
  startTransition: (message?: string) => void;
  clearTransition: () => void;
};

const NavigationTransitionContext = createContext<NavigationTransitionContextValue | null>(null);

export function NavigationTransitionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isActive, setIsActive] = useState(false);
  const [message, setMessage] = useState(DEFAULT_NAVIGATION_TRANSITION_MESSAGE);
  const lastLocationRef = useRef("");
  const failSafeRef = useRef<number | null>(null);

  const clearTransition = useCallback(() => {
    if (failSafeRef.current) {
      window.clearTimeout(failSafeRef.current);
      failSafeRef.current = null;
    }
    setIsActive(false);
  }, []);

  const startTransition = useCallback((nextMessage?: string) => {
    setMessage(nextMessage || DEFAULT_NAVIGATION_TRANSITION_MESSAGE);
    setIsActive(true);

    if (failSafeRef.current) {
      window.clearTimeout(failSafeRef.current);
    }
    // Deadlock failsafe only. This is not a visual minimum duration.
    failSafeRef.current = window.setTimeout(() => {
      failSafeRef.current = null;
      setIsActive(false);
    }, 8000);
  }, []);

  useEffect(() => {
    const currentLocation = pathname || "";
    if (!lastLocationRef.current) {
      lastLocationRef.current = currentLocation;
      return;
    }
    if (lastLocationRef.current !== currentLocation) {
      lastLocationRef.current = currentLocation;
      clearTransition();
    }
  }, [clearTransition, pathname]);

  useEffect(() => {
    const rememberAndClear = () => {
      const currentLocation = window.location.href;
      if (lastLocationRef.current !== currentLocation) {
        lastLocationRef.current = currentLocation;
        clearTransition();
      }
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function patchedPushState(...args) {
      const result = originalPushState.apply(this, args);
      rememberAndClear();
      return result;
    };
    window.history.replaceState = function patchedReplaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      rememberAndClear();
      return result;
    };

    window.addEventListener("popstate", rememberAndClear);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", rememberAndClear);
    };
  }, [clearTransition]);

  useEffect(() => {
    window.addEventListener("pagehide", clearTransition);
    window.addEventListener("visibilitychange", clearTransition);
    return () => {
      window.removeEventListener("pagehide", clearTransition);
      window.removeEventListener("visibilitychange", clearTransition);
      clearTransition();
    };
  }, [clearTransition]);

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
