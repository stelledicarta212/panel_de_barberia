"use client";

import { DashboardShell } from "@/components/dashboard-shell";

export default function SoportePage() {
  return (
    <DashboardShell>
      <section className="ba-card">
        <div className="ba-card-title">
          <h2>Soporte</h2>
        </div>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          Centro de ayuda listo para conectar a tickets reales. Mientras tanto, este módulo usa datos mock del entorno local.
        </p>
      </section>
    </DashboardShell>
  );
}
