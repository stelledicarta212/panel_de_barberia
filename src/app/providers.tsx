"use client";

import { DashboardProvider } from "@/store/dashboard-context";
import { NavigationTransitionProvider } from "@/components/navigation-transition-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NavigationTransitionProvider>
      <DashboardProvider>{children}</DashboardProvider>
    </NavigationTransitionProvider>
  );
}
