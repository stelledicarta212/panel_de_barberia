"use client";

import {
  Bell,
  CalendarClock,
  CircleDollarSign,
  LayoutDashboard,
  RefreshCw,
  Save,
  Scissors,
  Send,
  Sparkles,
  Store,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/store/dashboard-context";

const RESERVATIONS_STORAGE_KEY = "ba_dashboard_reservas";
const BARBER_OFF_DAYS_STORAGE_KEY = "ba_barberos_descansos";
const BARBER_MANUAL_AVAILABILITY_STORAGE_KEY = "ba_barberos_manual_availability";

type ReservationRecord = {
  id?: string;
  client?: string;
  service?: string;
  barber?: string;
  date?: string;
  hour?: string;
  status?: string;
};

function normalizeManualAvailability(input: unknown): Record<string, boolean | undefined> {
  if (!input || typeof input !== "object") return {};
  const source = input as Record<string, unknown>;
  const out: Record<string, boolean | undefined> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (raw === true || raw === false) {
      out[key] = raw;
      continue;
    }
    if (typeof raw === "string") {
      const v = raw.trim().toLowerCase();
      if (v === "true") out[key] = true;
      else if (v === "false") out[key] = false;
      else out[key] = undefined;
      continue;
    }
    out[key] = undefined;
  }
  return out;
}

function normalizeOffDays(input: unknown): Record<string, number[]> {
  if (!input || typeof input !== "object") return {};
  const source = input as Record<string, unknown>;
  const out: Record<string, number[]> = {};
  for (const [key, raw] of Object.entries(source)) {
    const arr = Array.isArray(raw) ? raw : [];
    out[key] = arr
      .map((d) => Number(d))
      .filter((d) => Number.isFinite(d) && d > 0 && d <= 31);
  }
  return out;
}

function normalizeNameKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function money(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "$0";
  return `$${num.toFixed(0)}`;
}

export function DashboardEditor() {
  const router = useRouter();
  const { merged, loading, saving, publishing, refresh, saveDraft, publish } = useDashboard();
  const [manualAvailability, setManualAvailability] = useState<Record<string, boolean | undefined>>({});
  const [offDaysByBarber, setOffDaysByBarber] = useState<Record<string, number[]>>({});
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const qrPanelValue = merged.qr_url;

  const topStats = [
    { label: "Ingresos Mensuales", value: "$12,450", delta: "+15%", icon: CircleDollarSign },
    { label: "Citas de Hoy", value: "24 / 30", delta: "+8%", icon: CalendarClock },
    { label: "Nuevos Clientes", value: "45", delta: "+20%", icon: Users },
    { label: "Tasa de Ocupacion", value: "85%", delta: "+5%", icon: LayoutDashboard }
  ];

  const services = useMemo(
    () => merged.services.slice(0, 5).map((item, i) => ({
      id: String(item.id ?? `s-${i}`),
      name: String(item.nombre ?? item.name ?? `Service ${i + 1}`),
      price: money(item.precio ?? item.price)
    })),
    [merged.services]
  );

  useEffect(() => {
    const loadManualAvailability = () => {
      try {
        const raw = window.localStorage.getItem(BARBER_MANUAL_AVAILABILITY_STORAGE_KEY);
        if (!raw) return setManualAvailability({});
        const parsed = JSON.parse(raw);
        setManualAvailability(normalizeManualAvailability(parsed));
      } catch {
        setManualAvailability({});
      }
    };
    loadManualAvailability();
    window.addEventListener("storage", loadManualAvailability);
    window.addEventListener("ba-barberos-manual-availability-updated", loadManualAvailability as EventListener);
    return () => {
      window.removeEventListener("storage", loadManualAvailability);
      window.removeEventListener("ba-barberos-manual-availability-updated", loadManualAvailability as EventListener);
    };
  }, []);

  useEffect(() => {
    const loadOffDays = () => {
      try {
        const raw = window.localStorage.getItem(BARBER_OFF_DAYS_STORAGE_KEY);
        if (!raw) return setOffDaysByBarber({});
        const parsed = JSON.parse(raw);
        setOffDaysByBarber(normalizeOffDays(parsed));
      } catch {
        setOffDaysByBarber({});
      }
    };
    loadOffDays();
    window.addEventListener("storage", loadOffDays);
    window.addEventListener("ba-barberos-descanso-updated", loadOffDays as EventListener);
    return () => {
      window.removeEventListener("storage", loadOffDays);
      window.removeEventListener("ba-barberos-descanso-updated", loadOffDays as EventListener);
    };
  }, []);

  useEffect(() => {
    const loadReservations = () => {
      try {
        const raw = window.localStorage.getItem(RESERVATIONS_STORAGE_KEY);
        if (!raw) return setReservations([]);
        const parsed = JSON.parse(raw);
        setReservations(Array.isArray(parsed) ? (parsed as ReservationRecord[]) : []);
      } catch {
        setReservations([]);
      }
    };
    loadReservations();
    window.addEventListener("storage", loadReservations);
    window.addEventListener("ba-reservas-updated", loadReservations as EventListener);
    return () => {
      window.removeEventListener("storage", loadReservations);
      window.removeEventListener("ba-reservas-updated", loadReservations as EventListener);
    };
  }, []);

  const barbers = useMemo(() => {
    const now = new Date();
    const todayDay = now.getDate();
    const todayMonth = now.getMonth();
    const todayYear = now.getFullYear();
    const todayDateString = `${String(todayDay).padStart(2, "0")}/${String(todayMonth + 1).padStart(2, "0")}/${todayYear}`;

    return merged.barbers.slice(0, 5).map((item, i) => {
      const id = String(item.id ?? `barber-${i + 1}`);
      const name = String(item.nombre ?? item.name ?? `Barber ${i + 1}`);
      const legacyId = `barber-${i + 1}`;
      const nameKey = normalizeNameKey(name);
      const baseActive =
        typeof item.activo === "boolean"
          ? item.activo
          : String(item.activo ?? "").toLowerCase() !== "false";
      const restDays =
        offDaysByBarber[id] ??
        offDaysByBarber[legacyId] ??
        offDaysByBarber[nameKey] ??
        [];
      const hasRestToday = restDays.includes(todayDay);
      const autoActive = baseActive && !hasRestToday;
      const manualOverride =
        manualAvailability[id] ??
        manualAvailability[legacyId] ??
        manualAvailability[nameKey];
      const effectiveActive = manualOverride ?? autoActive;
      const servicesToday = reservations.filter(
        (r) =>
          String(r.barber || "").trim().toLowerCase() === name.trim().toLowerCase() &&
          r.date === todayDateString
      ).length;
      return {
        id,
        name,
        isActive: effectiveActive,
        servicesToday,
        hasRestToday,
        manualOverride
      };
    });
  }, [merged.barbers, manualAvailability, offDaysByBarber, reservations]);

  const todayReservations = useMemo(() => {
    const now = new Date();
    const todayDay = now.getDate();
    const todayMonth = now.getMonth();
    const todayYear = now.getFullYear();
    const todayDateString = `${String(todayDay).padStart(2, "0")}/${String(todayMonth + 1).padStart(2, "0")}/${todayYear}`;
    const toMinutes = (value?: string) => {
      const raw = String(value || "").trim();
      const [h, m] = raw.split(":");
      const hh = Number(h);
      const mm = Number(m);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 9999;
      return hh * 60 + mm;
    };
    return reservations
      .filter((r) => String(r.date || "").trim() === todayDateString)
      .sort((a, b) => toMinutes(a.hour) - toMinutes(b.hour))
      .slice(0, 6);
  }, [reservations]);

  const handleCopyPublicUrl = async () => {
    const url = String(merged.public_landing_url || "").trim();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // noop
    }
  };

  return (
    <section className="ba-overview-v3">
      <div className="ba-overview-top">
        {topStats.map((stat) => (
          <article key={stat.label} className="ba-card ba-overview-kpi">
            <header>
              <span>{stat.label}</span>
              <stat.icon size={14} />
            </header>
            <strong>{stat.value}</strong>
            <small>{stat.delta}</small>
          </article>
        ))}
      </div>

      <div className="ba-overview-main-grid">
        <article
          className="ba-card ba-overview-booking"
          role="button"
          tabIndex={0}
          onClick={() => router.push("/citas")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && router.push("/citas")}
        >
          <div className="ba-card-title">
            <h2>Reservas de Citas</h2>
            <Bell size={14} />
          </div>
          <div className="ba-overview-slots">
            {todayReservations.length ? (
              todayReservations.map((reservation, i) => (
                <div
                  key={reservation.id ?? `${reservation.client}-${reservation.hour}-${i}`}
                  className={`ba-overview-slot ${i % 3 === 0 ? "is-green" : i % 3 === 1 ? "is-red" : "is-purple"}`}
                >
                  <small>{reservation.hour || "Sin hora"}</small>
                  <strong>{reservation.service || "Sin servicio"}</strong>
                  <span>{reservation.status || "Pendiente"}</span>
                </div>
              ))
            ) : (
              <div className="ba-overview-slot is-empty">
                <small>Hoy</small>
                <strong>Sin reservas registradas</strong>
                <span>Crea una cita en el módulo de Citas</span>
              </div>
            )}
          </div>
        </article>

        <article
          className="ba-card ba-overview-barbers"
          role="button"
          tabIndex={0}
          onClick={() => router.push("/barberos")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && router.push("/barberos")}
        >
          <div className="ba-card-title">
            <h2>Gestion de Barberos</h2>
            <Users size={14} />
          </div>
          <ul>
            {barbers.map((barber) => (
              <li key={barber.id}>
                <span>{barber.name}</span>
                <em className={barber.isActive ? "is-available" : "is-busy"}>
                  {barber.isActive
                    ? `Activo (${barber.servicesToday})`
                    : barber.hasRestToday
                      ? "Inactivo (Descanso hoy)"
                      : barber.manualOverride === false
                        ? "Inactivo (Manual)"
                        : "Inactivo"}
                </em>
              </li>
            ))}
          </ul>
        </article>

        <article
          className="ba-card ba-overview-loyalty"
          role="button"
          tabIndex={0}
          onClick={() => router.push("/finanzas")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && router.push("/finanzas")}
        >
          <div className="ba-card-title">
            <h2>Programa de Lealtad</h2>
            <Sparkles size={14} />
          </div>
          <p className="ba-overview-loyalty-title">Tarjeta de sellos</p>
          <div className="ba-overview-loyalty-stamps">
            {Array.from({ length: 6 }, (_, idx) => (
              <span key={`stamp-${idx}`} className={idx < 4 ? "is-on" : ""}>
                <Scissors size={12} />
              </span>
            ))}
          </div>
          <div className="ba-overview-loyalty-progress">
            <span style={{ width: "66%" }} />
          </div>
          <p>4 / 6 sellos completados</p>
          <p>Recordatorio automatico: <b>ACTIVO</b></p>
          <p>Ingresos en horas muertas: <b>+15%</b></p>
          <div className="ba-overview-loyalty-actions">
            <button type="button" className="ba-btn-ghost">Ver detalle</button>
            <button type="button" className="ba-card-gold">Configurar</button>
          </div>
        </article>
      </div>

      <div className="ba-overview-bottom-grid">
        <article
          className="ba-card"
          role="button"
          tabIndex={0}
          onClick={() => router.push("/servicios")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && router.push("/servicios")}
        >
          <div className="ba-card-title"><h2>Servicios</h2><Scissors size={14} /></div>
          <ul className="ba-list">
            {services.map((service) => (
              <li key={service.id}><span>{service.name}</span><small>{service.price}</small></li>
            ))}
          </ul>
        </article>

        <article
          className="ba-card"
          role="button"
          tabIndex={0}
          onClick={() => router.push("/clientes")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && router.push("/clientes")}
        >
          <div className="ba-card-title"><h2>Clientes</h2><Users size={14} /></div>
          <ul className="ba-list">
            <li><span>John Smith</span><small>Contacto</small></li>
            <li><span>Ana Wilson</span><small>Contacto</small></li>
            <li><span>Mike S.</span><small>Contacto</small></li>
          </ul>
        </article>

        <article
          className="ba-card"
          role="button"
          tabIndex={0}
          onClick={() => router.push("/inventario")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && router.push("/inventario")}
        >
          <div className="ba-card-title"><h2>Finanzas</h2><CircleDollarSign size={14} /></div>
          <ul className="ba-list">
            <li><span>Ingresos</span><small>$190.00</small></li>
            <li><span>Pago reciente</span><small>$13.00</small></li>
            <li><span>Neto</span><small>$177.00</small></li>
          </ul>
        </article>
      </div>

      <section className="ba-editor-grid ba-editor-grid-compact">
        <article className="ba-card">
          <div className="ba-card-title"><h2>Barberia</h2><Store size={16} /></div>
          <p className="ba-overview-loyalty-title">Gestiona la informacion completa de tu barberia desde el modulo de configuracion.</p>
          <div className="ba-action-row">
            <a
              href="https://barberagency-barberagency.gymh5g.easypanel.host/registro-barberias/"
              target="_blank"
              rel="noreferrer"
              className="ba-btn-main"
            >
              Editar barberia
            </a>
          </div>
        </article>

        <article className="ba-card">
          <div className="ba-card-title"><h2>Publicacion</h2><Send size={16} /></div>
          <div className="ba-form-grid">
            <div className="ba-field ba-span-2">
              <span>URL pública</span>
              <input value={merged.public_landing_url} readOnly />
            </div>
            <div className="ba-field ba-span-2">
              <span>QR publico</span>
              <div style={{ display: "flex", justifyContent: "center", padding: "10px", border: "1px solid rgba(212,175,55,0.25)", borderRadius: "12px" }}>
                {qrPanelValue ? (
                  <img src={qrPanelValue} alt="QR Barberia" width={170} height={170} style={{ borderRadius: "8px", background: "#fff", padding: "8px" }} />
                ) : (
                  <small>Publica para generar el QR estable.</small>
                )}
              </div>
            </div>
          </div>
          <div className="ba-action-row">
            <button className="ba-btn-ghost" onClick={() => refresh()} disabled={loading} type="button"><RefreshCw size={15} />Recargar</button>
            <button className="ba-btn-ghost" onClick={() => handleCopyPublicUrl()} disabled={!merged.public_landing_url} type="button">Copiar URL</button>
            <a className="ba-btn-ghost" href={merged.public_landing_url || "#"} target="_blank" rel="noreferrer" aria-disabled={!merged.public_landing_url}>
              Abrir landing
            </a>
            <button className="ba-btn-main" onClick={() => saveDraft()} disabled={saving || publishing} type="button"><Save size={15} />Guardar</button>
            <button className="ba-btn-main" onClick={() => publish()} disabled={publishing || saving} type="button"><Send size={15} />Publicar</button>
          </div>
        </article>
      </section>
    </section>
  );
}
