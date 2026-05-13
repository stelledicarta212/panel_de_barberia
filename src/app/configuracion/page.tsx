"use client";

import { DashboardShell } from "@/components/dashboard-shell";
import { useDashboard } from "@/store/dashboard-context";

export default function ConfiguracionPage() {
  const { merged, setField } = useDashboard();
  return (
    <DashboardShell>
      <section className="ba-card">
        <div className="ba-card-title">
          <h2>Configuración Visual</h2>
        </div>
        <div className="ba-form-grid">
          <label className="ba-field">Color primario<input className="ba-input" value={merged.palette_primary} onChange={(e) => setField("palette_primary", e.target.value)} /></label>
          <label className="ba-field">Color secundario<input className="ba-input" value={merged.palette_secondary} onChange={(e) => setField("palette_secondary", e.target.value)} /></label>
          <label className="ba-field">Logo URL<input className="ba-input" value={merged.logo_url} onChange={(e) => setField("logo_url", e.target.value)} /></label>
          <label className="ba-field">Cover URL<input className="ba-input" value={merged.cover_url} onChange={(e) => setField("cover_url", e.target.value)} /></label>
        </div>
      </section>
    </DashboardShell>
  );
}
