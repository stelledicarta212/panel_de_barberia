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
  Users
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/store/dashboard-context";
import { getBarberDescansos } from "@/lib/dashboard-api";

const RESERVATIONS_STORAGE_KEY = "ba_dashboard_reservas";

type ReservationRecord = {
  id?: string;
  client?: string;
  phone?: string;
  service?: string;
  barber?: string;
  date?: string;
  hour?: string;
  status?: string;
  total?: number;
};

function money(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "$0";
  return `$${num.toFixed(0)}`;
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatDbDate(value: unknown): string {
  const raw = textValue(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function normalizeAppointmentRecord(
  item: Record<string, unknown>,
  index: number,
  locallyPaidIds?: Record<string, string>
): ReservationRecord {
  const id = textValue(item.id) || `cita-${index + 1}`;
  const rawMethod = item.metodo_pago || item.pago_metodo || item.metodo || item.method;
  const hasPayment = (typeof rawMethod === "string" && rawMethod.trim().length > 0) || (locallyPaidIds && locallyPaidIds[id]);

  return {
    id,
    client: textValue(item.cliente_nombre ?? item.client ?? item.nombre_cliente),
    phone: textValue(item.cliente_tel ?? item.telefono ?? item.phone),
    service: textValue(item.servicio_nombre ?? item.service ?? item.nombre_servicio),
    barber: textValue(item.barbero_nombre ?? item.barber ?? item.nombre_barbero),
    date: formatDbDate(item.fecha ?? item.date),
    hour: textValue(item.hora_inicio ?? item.hora ?? item.hour).slice(0, 5),
    status: hasPayment ? "Aceptada" : (textValue(item.estado ?? item.status) || "confirmada"),
    total: Number(item.total ?? 0)
  };
}

export function DashboardEditor() {
  const router = useRouter();
  const { merged, identity, loading, saving, publishing, refresh, saveDraft, publish } = useDashboard();
  const barberiaId = identity?.barberia_id;
  const [offDaysByBarber, setOffDaysByBarber] = useState<Record<string, string[]>>({});
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [locallyPaidIds, setLocallyPaidIds] = useState<Record<string, string>>({});
  const qrPanelValue = merged.qr_url;
  const publicLandingLabel = String(merged.biz_name || merged.biz_slug || "Landing publica").trim();

  const services = useMemo(
    () => merged.services.slice(0, 5).map((item, i) => ({
      id: String(item.id ?? `s-${i}`),
      name: String(item.nombre ?? item.name ?? `Service ${i + 1}`),
      price: money(item.precio ?? item.price)
    })),
    [merged.services]
  );

  const loadDescansos = useCallback(async () => {
    if (!barberiaId) return;
    const rows = await getBarberDescansos(barberiaId);
    const map: Record<string, string[]> = {};
    for (const row of rows) {
      const bId = String(row.barbero_id);
      if (!map[bId]) map[bId] = [];
      map[bId].push(String(row.fecha || "").split("T")[0]);
    }
    setOffDaysByBarber(map);
  }, [barberiaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDescansos();
  }, [loadDescansos]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ba_locally_paid_appointments");
      if (saved) {
        try {
          setLocallyPaidIds(JSON.parse(saved));
        } catch (e) {
          console.error("Error parsing ba_locally_paid_appointments in dashboard", e);
        }
      }
    }
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

  useEffect(() => {
    const remoteReservations = merged.appointments.map((item, idx) =>
      normalizeAppointmentRecord(item, idx, locallyPaidIds)
    );
    if (remoteReservations.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReservations(remoteReservations);
    }
  }, [merged.appointments, locallyPaidIds]);

  const barbers = useMemo(() => {
    const now = new Date();
    const todayDay = now.getDate();
    const todayMonth = now.getMonth();
    const todayYear = now.getFullYear();
    const todayDateString = `${String(todayDay).padStart(2, "0")}/${String(todayMonth + 1).padStart(2, "0")}/${todayYear}`;
    const todayDbDateString = `${todayYear}-${String(todayMonth + 1).padStart(2, "0")}-${String(todayDay).padStart(2, "0")}`;

    return merged.barbers.slice(0, 5).map((item, i) => {
      const id = textValue(item.id ?? item.barbero_id ?? item.id_barbero) || `barber-${i + 1}`;
      const name = String(item.nombre ?? item.name ?? `Barber ${i + 1}`);
      const baseActive =
        typeof item.activo === "boolean"
          ? item.activo
          : String(item.activo ?? "").toLowerCase() !== "false";
      const restDays = offDaysByBarber[id] ?? [];
      const hasRestToday = restDays.includes(todayDbDateString);
      const effectiveActive = baseActive && !hasRestToday;
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
        hasRestToday
      };
    });
  }, [merged.barbers, offDaysByBarber, reservations]);

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

  const monthlyIncome = useMemo(
    () => reservations.reduce((acc, item) => acc + Number((item as Record<string, unknown>).total ?? 0), 0),
    [reservations]
  );
  const occupancyRate = useMemo(() => {
    const slots = Math.max(1, merged.barbers.length * 22);
    return Math.min(100, Math.round((todayReservations.length / slots) * 100));
  }, [merged.barbers.length, todayReservations.length]);
  const topStats = [
    { label: "Ingresos Mensuales", value: money(monthlyIncome), delta: "Real", icon: CircleDollarSign },
    { label: "Citas de Hoy", value: String(todayReservations.length), delta: "Hoy", icon: CalendarClock },
    { label: "Nuevos Clientes", value: String(merged.clients.length), delta: "Real", icon: Users },
    { label: "Tasa de Ocupacion", value: `${occupancyRate}%`, delta: "Hoy", icon: LayoutDashboard }
  ];
  const clients = useMemo(() => {
    const fromClients = merged.clients.map((item, index) => ({
      id: textValue(item.id) || `cliente-${index + 1}`,
      name: textValue(item.nombre ?? item.nombre_completo ?? item.name) || "Cliente",
      phone: textValue(item.telefono ?? item.phone)
    }));
    if (fromClients.length) return fromClients.slice(0, 5);
    const byName = new Map<string, { id: string; name: string; phone: string }>();
    reservations.forEach((item, index) => {
      const name = textValue(item.client);
      if (!name || byName.has(name.toLowerCase())) return;
      byName.set(name.toLowerCase(), {
        id: textValue(item.id) || `cliente-cita-${index + 1}`,
        name,
        phone: textValue(item.phone)
      });
    });
    return Array.from(byName.values()).slice(0, 5);
  }, [merged.clients, reservations]);

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
      <div className="ba-overview-layout">
        <div className="ba-overview-content">
      <div className="ba-overview-top">
        {topStats.slice(0, 3).map((stat) => (
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
            {clients.length ? (
              clients.map((client) => (
                <li key={client.id}><span>{client.name}</span><small>{client.phone || "Contacto"}</small></li>
              ))
            ) : (
              <li><span>Sin clientes registrados</span><small>Reserva desde la landing</small></li>
            )}
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
            <li><span>Ingresos</span><small>{money(monthlyIncome)}</small></li>
            <li><span>Citas registradas</span><small>{reservations.length}</small></li>
            <li><span>Neto</span><small>{money(monthlyIncome)}</small></li>
          </ul>
        </article>
      </div>

        </div>

        <aside className="ba-overview-side">
          {topStats.slice(3, 4).map((stat) => (
            <article key={stat.label} className="ba-card ba-overview-kpi">
              <header>
                <span>{stat.label}</span>
                <stat.icon size={14} />
              </header>
              <strong>{stat.value}</strong>
              <small>{stat.delta}</small>
            </article>
          ))}

        <article className="ba-card ba-publication-card">
          <div className="ba-card-title"><h2>Publicacion</h2><Send size={16} /></div>
          <div className="ba-form-grid ba-publication-form">
            <div className="ba-field">
              <span>URL pública</span>
              <a className="ba-public-url-link" href={merged.public_landing_url || "#"} target="_blank" rel="noreferrer" aria-disabled={!merged.public_landing_url}>
                {publicLandingLabel}
              </a>
            </div>
            <div className="ba-field ba-publication-qr">
              <span>QR publico</span>
              <div className="ba-publication-qr-frame">
                {qrPanelValue ? (
                  <img src={qrPanelValue} alt="QR Barberia" width={170} height={170} />
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
        </aside>
      </div>
    </section>
  );
}
