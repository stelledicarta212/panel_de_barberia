"use client";

import { DashboardProvider } from "@/store/dashboard-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return <DashboardProvider>{children}</DashboardProvider>;
}
