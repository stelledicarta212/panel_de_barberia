"use client";

import { useState } from "react";
import { BadgeCheck, Cake, Clock3, Crown, Gift, MoreHorizontal, RefreshCcw, Scissors, Sparkles, Workflow } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";

export default function ProgramaLealtadPage() {
  const [config, setConfig] = useState({
    planLabel: "Plan PRO",
    stampRequired: "8",
    stampCurrent: "5",
    stampBenefit: "Corte gratis",
    stampStatus: "Activo",
    stampMissingText: "Faltan 3 sellos para desbloquear",
    stampCta: "Ver beneficio",
    stampNote: "Frontend-only: visible en landing y controlado desde dashboard.",
    birthdayMessage: "Feliz cumpleaños. Tienes 20% de descuento hoy.",
    birthdayBenefit: "Servicio especial o descuento",
    birthdayNote: "n8n enviará WhatsApp / Email cuando exista fecha en clientes_finales.",
    inactiveRange: "15-30",
    reactivationMessage: "Hace rato no vienes... tienes descuento especial.",
    reactivationNote: "Objetivo: recuperar clientes inactivos con automatización.",
    lowDemandRange: "Lunes a Jueves · 2:00pm - 5:00pm",
    lowDemandPromo: "15% OFF en reservas de horas muertas",
    lowDemandNote: "Se reflejará en landing de reservas (solo interfaz por ahora).",
    rule1: "Todo este módulo aplica únicamente para usuarios de Plan PRO.",
    rule2: "La configuración se gestiona en Dashboard, no en el registro inicial.",
    rule3: "Se hereda a landing pública y al sistema de reservas.",
    rule4: "Automatizaciones: n8n + PostgreSQL + triggers/eventos (pendiente backend).",
    rule5: "Esta entrega implementa solo frontend, sin lógica de ejecución.",
    occupancy: "88",
    loyaltyGain: "150",
    cashCuts: "280",
    cashExtras: "88",
    cashClosed: "12",
    cashPending: "2",
    cashNet: "392"
  });

  const setField =
    (key: keyof typeof config) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setConfig((prev) => ({ ...prev, [key]: event.target.value }));
    };

  const requiredRaw = Number(config.stampRequired);
  const required = Number.isFinite(requiredRaw) ? Math.min(Math.max(Math.round(requiredRaw), 1), 12) : 8;
  const currentRaw = Number(config.stampCurrent);
  const current = Number.isFinite(currentRaw) ? Math.min(Math.max(Math.round(currentRaw), 0), required) : 5;
  const progressPercent = Math.round((current / required) * 100);

  return (
    <DashboardShell>
      <section className="ba-loyalty-layout">
        <div className="ba-loyalty-main ba-card">
          <header className="ba-loyalty-head">
            <h1>
              Programa de Lealtad <Sparkles size={16} />
            </h1>
            <span className="ba-pro-badge">
              <Crown size={12} />
              <input className="ba-loyalty-inline-input" value={config.planLabel} onChange={setField("planLabel")} />
            </span>
          </header>

          <article className="ba-loyalty-block ba-card ba-loyalty-stamp-block">
            <header className="ba-card-title">
              <h2>1. Tarjeta de Sellos</h2>
              <BadgeCheck size={14} />
            </header>
            <div className="ba-loyalty-form-grid">
              <label className="ba-field">
                Sellos para recompensa
                <input className="ba-input" value={config.stampRequired} onChange={setField("stampRequired")} />
              </label>
              <label className="ba-field">
                Sellos actuales
                <input className="ba-input" value={config.stampCurrent} onChange={setField("stampCurrent")} />
              </label>
              <label className="ba-field">
                Beneficio al completar
                <input className="ba-input" value={config.stampBenefit} onChange={setField("stampBenefit")} />
              </label>
              <label className="ba-field">
                Estado
                <input className="ba-input" value={config.stampStatus} onChange={setField("stampStatus")} />
              </label>
            </div>
            <div className="ba-stamp-card">
              <div className="ba-stamp-card-head">
                <div>
                  <p>Progreso actual</p>
                  <strong>{current} / {required} sellos</strong>
                </div>
                <span className="ba-stamp-state">{config.stampStatus}</span>
              </div>
              <div className="ba-stamp-progress-wrap">
                <div className="ba-stamp-progress">
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <small>{progressPercent}% completado</small>
              </div>
              <div className="ba-stamp-preview">
                {Array.from({ length: required }, (_, idx) => (
                  <span key={`stamp-${idx}`} className={idx < current ? "is-on" : ""}>
                    <Scissors size={12} />
                  </span>
                ))}
              </div>
              <div className="ba-stamp-card-foot">
                <small>{config.stampMissingText}</small>
                <button type="button" className="ba-card-gold">{config.stampCta}</button>
              </div>
            </div>
            <label className="ba-field">
              Nota
              <textarea className="ba-input ba-loyalty-note-input" value={config.stampNote} onChange={setField("stampNote")} />
            </label>
          </article>

          <div className="ba-loyalty-grid-two">
            <article className="ba-loyalty-block ba-card ba-loyalty-feature-card">
              <header className="ba-card-title">
                <h2>2. Cumpleaños del Cliente</h2>
                <Cake size={14} />
              </header>
              <span className="ba-editable-chip">Editable por admin</span>
              <div className="ba-loyalty-form-grid">
                <label className="ba-field">
                  Mensaje automático
                  <textarea className="ba-input ba-loyalty-note-input" value={config.birthdayMessage} onChange={setField("birthdayMessage")} />
                </label>
                <label className="ba-field">
                  Beneficio
                  <input className="ba-input" value={config.birthdayBenefit} onChange={setField("birthdayBenefit")} />
                </label>
              </div>
              <label className="ba-field">
                Nota
                <textarea className="ba-input ba-loyalty-note-input" value={config.birthdayNote} onChange={setField("birthdayNote")} />
              </label>
            </article>

            <article className="ba-loyalty-block ba-card ba-loyalty-feature-card">
              <header className="ba-card-title">
                <h2>3. Recordatorio de Fidelización</h2>
                <RefreshCcw size={14} />
              </header>
              <span className="ba-editable-chip">Editable por admin</span>
              <div className="ba-loyalty-form-grid">
                <label className="ba-field">
                  Días sin visita (inactivo)
                  <input className="ba-input" value={config.inactiveRange} onChange={setField("inactiveRange")} />
                </label>
                <label className="ba-field">
                  Mensaje de reactivación
                  <textarea className="ba-input ba-loyalty-note-input" value={config.reactivationMessage} onChange={setField("reactivationMessage")} />
                </label>
              </div>
              <label className="ba-field">
                Nota
                <textarea className="ba-input ba-loyalty-note-input" value={config.reactivationNote} onChange={setField("reactivationNote")} />
              </label>
            </article>
          </div>

          <article className="ba-loyalty-block ba-card ba-loyalty-feature-card">
            <header className="ba-card-title">
              <h2>4. Beneficios en Horas Muertas</h2>
              <Clock3 size={14} />
            </header>
            <span className="ba-editable-chip">Editable por admin</span>
            <div className="ba-loyalty-form-grid">
              <label className="ba-field">
                Franja baja demanda
                <input className="ba-input" value={config.lowDemandRange} onChange={setField("lowDemandRange")} />
              </label>
              <label className="ba-field">
                Promo activa
                <textarea className="ba-input ba-loyalty-note-input" value={config.lowDemandPromo} onChange={setField("lowDemandPromo")} />
              </label>
            </div>
            <label className="ba-field">
              Nota
              <textarea className="ba-input ba-loyalty-note-input" value={config.lowDemandNote} onChange={setField("lowDemandNote")} />
            </label>
          </article>

          <article className="ba-loyalty-block ba-card">
            <header className="ba-card-title">
              <h2>Lógica Clave Definida</h2>
              <Workflow size={14} />
            </header>
            <ul className="ba-loyalty-rules">
              <li><input className="ba-input" value={config.rule1} onChange={setField("rule1")} /></li>
              <li><input className="ba-input" value={config.rule2} onChange={setField("rule2")} /></li>
              <li><input className="ba-input" value={config.rule3} onChange={setField("rule3")} /></li>
              <li><input className="ba-input" value={config.rule4} onChange={setField("rule4")} /></li>
              <li><input className="ba-input" value={config.rule5} onChange={setField("rule5")} /></li>
            </ul>
          </article>
        </div>

        <aside className="ba-services-right">
          <article className="ba-card ba-right-widget">
            <header className="ba-right-header">
              <h3>Tasa de Ocupacion</h3>
              <MoreHorizontal size={12} />
            </header>
            <p className="ba-client-kpi">{config.occupancy}%</p>
            <label className="ba-field">
              <input className="ba-input" value={config.occupancy} onChange={setField("occupancy")} />
            </label>
            <div className="ba-client-progress"><span style={{ width: `${Math.min(Math.max(Number(config.occupancy) || 0, 0), 100)}%` }} /></div>
          </article>

          <article className="ba-card ba-right-widget">
            <header className="ba-right-header">
              <h3>Servicios</h3>
              <MoreHorizontal size={12} />
            </header>
            <div className="ba-client-mini-services">
              <img src="https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=320&auto=format&fit=crop" alt="Servicio 1" />
              <img src="https://images.unsplash.com/photo-1593702275687-f8b402bfdbdd?w=320&auto=format&fit=crop" alt="Servicio 2" />
            </div>
          </article>

          <article className="ba-card ba-right-widget">
            <header className="ba-right-header">
              <h3>Programa de Lealtad</h3>
              <Gift size={12} />
            </header>
            <div className="ba-loyal-icons">
              <span>✕</span><span>✕</span><span>✕</span><span>✕</span>
            </div>
            <p className="ba-loyal-note">Ganancias por incentivdad: <strong>${config.loyaltyGain}</strong></p>
            <label className="ba-field">
              <input className="ba-input" value={config.loyaltyGain} onChange={setField("loyaltyGain")} />
            </label>
          </article>

          <article className="ba-card ba-right-widget ba-pos-widget">
            <header className="ba-right-header">
              <h3>Caja del Dia</h3>
              <MoreHorizontal size={12} />
            </header>
            <div className="ba-pos-widget-kpis">
              <p><span>Cortes</span><strong>${config.cashCuts}</strong></p>
              <p><span>Extras</span><strong>${config.cashExtras}</strong></p>
            </div>
            <ul className="ba-pos-widget-list">
              <li><span>Tickets cerrados</span><strong>{config.cashClosed}</strong></li>
              <li><span>Pendientes</span><strong>{config.cashPending}</strong></li>
              <li><span>Neto hoy</span><strong>${config.cashNet}</strong></li>
            </ul>
            <div className="ba-loyalty-form-grid">
              <label className="ba-field">
                Cortes
                <input className="ba-input" value={config.cashCuts} onChange={setField("cashCuts")} />
              </label>
              <label className="ba-field">
                Extras
                <input className="ba-input" value={config.cashExtras} onChange={setField("cashExtras")} />
              </label>
              <label className="ba-field">
                Tickets cerrados
                <input className="ba-input" value={config.cashClosed} onChange={setField("cashClosed")} />
              </label>
              <label className="ba-field">
                Pendientes
                <input className="ba-input" value={config.cashPending} onChange={setField("cashPending")} />
              </label>
              <label className="ba-field">
                Neto
                <input className="ba-input" value={config.cashNet} onChange={setField("cashNet")} />
              </label>
            </div>
          </article>
        </aside>
      </section>
    </DashboardShell>
  );
}
