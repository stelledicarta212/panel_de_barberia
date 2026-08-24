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
  Users,
  ChevronLeft,
  ChevronRight,
  CalendarDays
} from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDashboard } from "@/store/dashboard-context";

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
  isPaid?: boolean;
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
  const pagoId = item.pago_id;
  const paidAt = item.pagado_en;
  const rawEstado = textValue(item.estado ?? item.status).toLowerCase();
  const isPaid = Boolean(pagoId || paidAt || rawEstado === "pagada" || (typeof rawMethod === "string" && rawMethod.trim().length > 0) || (locallyPaidIds && locallyPaidIds[id]));
  const hasPayment = isPaid;

  return {
    id,
    client: textValue(item.cliente_nombre ?? item.client ?? item.nombre_cliente),
    phone: textValue(item.cliente_tel ?? item.telefono ?? item.phone),
    service: textValue(item.servicio_nombre ?? item.service ?? item.nombre_servicio),
    barber: textValue(item.barbero_nombre ?? item.barber ?? item.nombre_barbero),
    date: formatDbDate(item.fecha ?? item.date),
    hour: textValue(item.hora_inicio ?? item.hora ?? item.hour).slice(0, 5),
    status: hasPayment ? "Aceptada" : (textValue(item.estado ?? item.status) || "confirmada"),
    total: Number(item.total ?? 0),
    isPaid
  };
}

function todayDateKey(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftDateKey(dateKey: string, days: number): string {
  const [yyyy, mm, dd] = dateKey.split("-").map(Number);
  const date = new Date(yyyy, (mm || 1) - 1, dd || 1);
  date.setDate(date.getDate() + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function formatLongDate(dateKey: string): string {
  const [yyyy, mm, dd] = dateKey.split("-").map(Number);
  const date = new Date(yyyy, (mm || 1) - 1, dd || 1);
  if (Number.isNaN(date.getTime())) return dateKey;
  const formatted = date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function DashboardEditor() {
  const router = useRouter();
  const { merged, loading, saving, publishing, refresh, saveDraft, publish } = useDashboard();
  const [selectedDateKey, setSelectedDateKey] = useState(() => todayDateKey());
  const reservations = useMemo<ReservationRecord[]>(() => {
    return (merged.appointments || []).map((item, idx) =>
      normalizeAppointmentRecord(item, idx)
    );
  }, [merged.appointments]);
  const qrPanelValue = merged.qr_url;
  const publicLandingLabel = String(merged.biz_name || merged.biz_slug || "Landing publica").trim();

  const offDaysByBarber = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const row of merged.descansos) {
      const bId = textValue(row.barbero_id);
      if (!bId) continue;
      if (!map[bId]) map[bId] = [];
      map[bId].push(textValue(row.fecha).split("T")[0]);
    }
    return map;
  }, [merged.descansos]);

  const barbers = useMemo(() => {
    const [yyyy, mm, dd] = selectedDateKey.split("-");
    const targetDateString = `${dd}/${mm}/${yyyy}`;
    const targetDbDateString = `${yyyy}-${mm}-${dd}`;

    return merged.barbers.slice(0, 5).map((item, i) => {
      const id = textValue(item.id ?? item.barbero_id ?? item.id_barbero) || `barber-${i + 1}`;
      const name = String(item.nombre ?? item.name ?? `Barber ${i + 1}`);
      const baseActive =
        typeof item.activo === "boolean"
          ? item.activo
          : String(item.activo ?? "").toLowerCase() !== "false";
      const restDays = offDaysByBarber[id] ?? [];
      const hasRestToday = restDays.includes(targetDbDateString);
      const effectiveActive = baseActive && !hasRestToday;
      const servicesToday = reservations.filter(
        (r) =>
          String(r.barber || "").trim().toLowerCase() === name.trim().toLowerCase() &&
          r.date === targetDateString
      ).length;
      return {
        id,
        name,
        isActive: effectiveActive,
        servicesToday,
        hasRestToday
      };
    });
  }, [merged.barbers, offDaysByBarber, reservations, selectedDateKey]);

  const allTodayReservations = useMemo(() => {
    const [yyyy, mm, dd] = selectedDateKey.split("-");
    const targetDateString = `${dd}/${mm}/${yyyy}`;
    const toMinutes = (value?: string) => {
      const raw = String(value || "").trim();
      const [h, m] = raw.split(":");
      const hh = Number(h);
      const mm = Number(m);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 9999;
      return hh * 60 + mm;
    };
    return reservations
      .filter((r) => String(r.date || "").trim() === targetDateString)
      .sort((a, b) => toMinutes(a.hour) - toMinutes(b.hour));
  }, [reservations, selectedDateKey]);

  const todayReservations = useMemo(() => {
    return allTodayReservations.slice(0, 6);
  }, [allTodayReservations]);

  const services = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; total: number }>();
    allTodayReservations.forEach((item, index) => {
      const name = textValue(item.service) || "Servicio";
      const key = name.toLowerCase();
      const current = grouped.get(key) ?? { id: textValue(item.id) || `servicio-dia-${index + 1}`, name, total: 0 };
      current.total += Number(item.total ?? 0);
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).slice(0, 5).map((item) => ({ ...item, price: money(item.total) }));
  }, [allTodayReservations]);

  const dailyIncome = useMemo(() => {
    return allTodayReservations
      .filter((r) => r.isPaid)
      .reduce((acc, item) => acc + Number((item as Record<string, unknown>).total ?? 0), 0);
  }, [allTodayReservations]);

  const newClientsTodayCount = useMemo(() => {
    return merged.clients.filter((c) => {
      const rawCreated = (c as Record<string, unknown>).created_at ?? (c as Record<string, unknown>).created ?? (c as Record<string, unknown>).fecha_registro ?? (c as Record<string, unknown>).created_date;
      if (!rawCreated) return false;

      const rawStr = String(rawCreated).trim();
      let clientDateKey = "";

      // Si es una fecha pura YYYY-MM-DD sin hora/T/offset, la comparamos directamente
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawStr)) {
        clientDateKey = rawStr;
      } else {
        const parsed = new Date(rawStr);
        if (!Number.isNaN(parsed.getTime())) {
          try {
            // Conversión determinista a zona horaria America/Bogota (operativa de BarberAgency)
            const formatter = new Intl.DateTimeFormat("en-US", {
              timeZone: "America/Bogota",
              year: "numeric",
              month: "2-digit",
              day: "2-digit"
            });
            const parts = formatter.formatToParts(parsed);
            const yyyy = parts.find((p) => p.type === "year")?.value || "";
            const mm = parts.find((p) => p.type === "month")?.value || "";
            const dd = parts.find((p) => p.type === "day")?.value || "";
            clientDateKey = `${yyyy}-${mm}-${dd}`;
          } catch {
            const yyyy = parsed.getFullYear();
            const mm = String(parsed.getMonth() + 1).padStart(2, "0");
            const dd = String(parsed.getDate()).padStart(2, "0");
            clientDateKey = `${yyyy}-${mm}-${dd}`;
          }
        }
      }
      return clientDateKey === selectedDateKey;
    }).length;
  }, [merged.clients, selectedDateKey]);

  const occupancyRate = useMemo(() => {
    const [yyyy, mm, dd] = selectedDateKey.split("-");
    const targetDate = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    const dayOfWeekIndex = (targetDate.getDay() + 6) % 7; // 0 = Lunes, 6 = Domingo
    const DAY_NAMES = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
    const dayName = DAY_NAMES[dayOfWeekIndex];

    let startHour = 9;
    let endHour = 21;

    if (merged.hours && merged.hours.length > 0) {
      const config = merged.hours.find((h: Record<string, unknown>) => {
        const diaVal = String(h.dia || h.day || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        return diaVal === dayName || diaVal.startsWith(dayName.slice(0, 3));
      });
      if (config && config.activo !== false) {
        const apStr = String(config.hora_apertura || config.opening_time || "09:00");
        const ciStr = String(config.hora_cierre || config.closing_time || "21:00");
        
        const apMatch = apStr.match(/^(\d{1,2})/);
        const ciMatch = ciStr.match(/^(\d{1,2})/);
        
        if (apMatch) startHour = Math.max(0, Math.min(23, Number(apMatch[1])));
        if (ciMatch) endHour = Math.max(0, Math.min(23, Number(ciMatch[1])));
      }
    }

    const totalHours = Math.max(1, endHour - startHour);
    const slotsPerBarber = totalHours * 2; // 30-minute slots
    const totalBarbers = Math.max(1, merged.barbers.length);
    const totalSlots = slotsPerBarber * totalBarbers;

    return Math.min(100, Math.round((allTodayReservations.length / totalSlots) * 100));
  }, [merged.barbers, merged.hours, allTodayReservations]);

  // 1. Ingresos del Día blocks
  const incomeBlocks = useMemo(() => {
    const blocks = [0, 0, 0, 0, 0, 0];
    allTodayReservations.forEach(r => {
      const hourStr = String(r.hour || "").split(":")[0];
      const hh = Number(hourStr) || 0;
      const val = Number(r.total ?? 0);
      if (hh < 10) blocks[0] += val;
      else if (hh < 12) blocks[1] += val;
      else if (hh < 14) blocks[2] += val;
      else if (hh < 16) blocks[3] += val;
      else if (hh < 18) blocks[4] += val;
      else blocks[5] += val;
    });
    const max = Math.max(...blocks, 1);
    return blocks.map(v => (v / max) * 100);
  }, [allTodayReservations]);

  // 2. Citas de Hoy blocks & points
  const appointmentsBlocks = useMemo(() => {
    const blocks = [0, 0, 0, 0, 0, 0];
    allTodayReservations.forEach(r => {
      const hourStr = String(r.hour || "").split(":")[0];
      const hh = Number(hourStr) || 0;
      if (hh < 10) blocks[0]++;
      else if (hh < 12) blocks[1]++;
      else if (hh < 14) blocks[2]++;
      else if (hh < 16) blocks[3]++;
      else if (hh < 18) blocks[4]++;
      else blocks[5]++;
    });
    return blocks;
  }, [allTodayReservations]);

  const maxAppointments = useMemo(() => {
    return Math.max(...appointmentsBlocks, 1);
  }, [appointmentsBlocks]);

  const points = useMemo(() => {
    return appointmentsBlocks.map((v, i) => {
      const x = i * 10 + 2;
      const y = 16 - (v / maxAppointments) * 12;
      return `${x},${y}`;
    }).join(" ");
  }, [appointmentsBlocks, maxAppointments]);

  // 3. Nuevos Clientes percent (Target = 10)
  const newClientsPercent = useMemo(() => {
    const target = 10;
    return Math.min(100, Math.round((newClientsTodayCount / target) * 100));
  }, [newClientsTodayCount]);

  const renderKpiChart = (label: string) => {
    switch (label) {
      case "Ingresos del Día":
        return (
          <div style={{ display: "flex", gap: "3px", alignItems: "flex-end", height: "26px", paddingRight: "4px" }}>
            {incomeBlocks.map((h, i) => (
              <div 
                key={i} 
                style={{ 
                  width: "4px", 
                  height: `${Math.max(15, h)}%`, 
                  background: h > 0 ? "linear-gradient(180deg, var(--gold) 0%, var(--gold-strong) 100%)" : "rgba(255,255,255,0.06)", 
                  borderRadius: "1px" 
                }} 
              />
            ))}
          </div>
        );
      case "Citas del Día":
        return (
          <div style={{ display: "flex", alignItems: "center", height: "26px", paddingRight: "4px" }}>
            <svg width="60" height="20" style={{ overflow: "visible" }}>
              <polyline
                fill="none"
                stroke="var(--gold)"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
              />
              {appointmentsBlocks.map((v, i) => {
                const x = i * 10 + 2;
                const y = 16 - (v / maxAppointments) * 12;
                return (
                  <circle 
                    key={i} 
                    cx={x} 
                    cy={y} 
                    r="2" 
                    fill="var(--gold)" 
                    stroke="rgba(20,27,39,0.9)" 
                    strokeWidth="0.5" 
                  />
                );
              })}
            </svg>
          </div>
        );
      case "Nuevos Clientes":
        return (
          <div style={{ display: "flex", alignItems: "center", height: "26px", paddingRight: "4px" }}>
            <div style={{ position: "relative", width: "26px", height: "26px" }}>
              <svg width="26" height="26" style={{ transform: "rotate(-90deg)" }}>
                <circle
                  cx="13"
                  cy="13"
                  r={9}
                  fill="transparent"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="2.2"
                />
                <circle
                  cx="13"
                  cy="13"
                  r={9}
                  fill="transparent"
                  stroke="var(--gold)"
                  strokeWidth="2.2"
                  strokeDasharray={2 * Math.PI * 9}
                  strokeDashoffset={2 * Math.PI * 9 - (newClientsPercent / 100) * 2 * Math.PI * 9}
                  strokeLinecap="round"
                />
              </svg>
              <div style={{ 
                position: "absolute", 
                top: 0, left: 0, right: 0, bottom: 0, 
                display: "flex", alignItems: "center", justifyContent: "center", 
                fontSize: "7.5px", fontWeight: "800", color: "var(--gold)" 
              }}>
                {newClientsPercent}%
              </div>
            </div>
          </div>
        );
      case "Tasa de Ocupacion":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "65px", paddingRight: "2px" }}>
            <div style={{ 
              width: "100%", 
              height: "5px", 
              background: "rgba(255,255,255,0.06)", 
              borderRadius: "3px", 
              overflow: "hidden" 
            }}>
              <div style={{ 
                width: `${occupancyRate}%`, 
                height: "100%", 
                background: "linear-gradient(90deg, var(--gold) 0%, var(--gold-strong) 100%)", 
                borderRadius: "3px" 
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "7.5px", color: "var(--muted)", fontWeight: "500" }}>
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const isTodaySelected = selectedDateKey === todayDateKey();
  const dateDelta = isTodaySelected ? "Hoy" : formatLongDate(selectedDateKey);

  const topStats = [
    { label: "Ingresos del Día", value: money(dailyIncome), delta: dateDelta, icon: CircleDollarSign },
    { label: "Citas del Día", value: String(allTodayReservations.length), delta: dateDelta, icon: CalendarClock },
    { label: "Nuevos Clientes", value: String(newClientsTodayCount), delta: dateDelta, icon: Users },
    { label: "Tasa de Ocupacion", value: `${occupancyRate}%`, delta: dateDelta, icon: LayoutDashboard }
  ];
  const clients = useMemo(() => {
    const byClient = new Map<string, { id: string; name: string; phone: string }>();
    allTodayReservations.forEach((item, index) => {
      const name = textValue(item.client) || "Cliente";
      const phone = textValue(item.phone);
      const key = phone || name.toLowerCase();
      if (!byClient.has(key)) byClient.set(key, { id: textValue(item.id) || `cliente-dia-${index + 1}`, name, phone });
    });
    return Array.from(byClient.values()).slice(0, 5);
  }, [allTodayReservations]);

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "4px" }}>
              <div>
                <strong style={{ fontSize: "28px", margin: 0, lineHeight: 1.1 }}>{stat.value}</strong>
                <small style={{ fontSize: "11px", color: "var(--ok)", display: "block", marginTop: "2px" }}>{stat.delta}</small>
              </div>
              <div style={{ paddingBottom: "2px" }}>
                {renderKpiChart(stat.label)}
              </div>
            </div>
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
          <div className="ba-card-title flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
            <div className="flex items-center gap-2">
              <h2>Reservas de Citas — {formatLongDate(selectedDateKey)}</h2>
              <Bell size={14} />
            </div>
            <div
              className="flex items-center gap-1.5 rounded-2xl border border-[var(--panel-stroke)] bg-[var(--bg-soft)]/30 p-1"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label="Dia anterior"
                onClick={() => setSelectedDateKey((current) => shiftDateKey(current, -1))}
                className="h-8 w-8 rounded-xl border border-[var(--panel-stroke)] bg-[var(--panel)] text-[var(--text)] grid place-items-center hover:border-amber-500/40 hover:text-amber-500 transition-colors cursor-pointer"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => setSelectedDateKey(todayDateKey())}
                className="h-8 px-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 text-[10px] font-extrabold uppercase tracking-wider hover:bg-amber-500/15 transition-colors cursor-pointer"
              >
                Hoy
              </button>
              <label className="h-8 px-2 rounded-xl border border-[var(--panel-stroke)] bg-[var(--panel)] text-[var(--muted)] flex items-center gap-1.5 cursor-pointer">
                <CalendarDays size={14} className="text-amber-500" />
                <input
                  type="date"
                  value={selectedDateKey}
                  onChange={(event) => {
                    if (event.target.value) setSelectedDateKey(event.target.value);
                  }}
                  className="bg-transparent text-[var(--text)] text-xs font-bold outline-none w-[120px] cursor-pointer"
                />
              </label>
              <button
                type="button"
                aria-label="Dia siguiente"
                onClick={() => setSelectedDateKey((current) => shiftDateKey(current, 1))}
                className="h-8 w-8 rounded-xl border border-[var(--panel-stroke)] bg-[var(--panel)] text-[var(--text)] grid place-items-center hover:border-amber-500/40 hover:text-amber-500 transition-colors cursor-pointer"
              >
                <ChevronRight size={15} />
              </button>
            </div>
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
                <small>{selectedDateKey === todayDateKey() ? "Hoy" : formatLongDate(selectedDateKey)}</small>
                <strong>Sin reservas registradas para esta fecha</strong>
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
            <li><span>Ingresos del dia</span><small>{money(dailyIncome)}</small></li>
            <li><span>Citas del dia</span><small>{allTodayReservations.length}</small></li>
            <li><span>Neto del dia</span><small>{money(dailyIncome)}</small></li>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "4px" }}>
                <div>
                  <strong style={{ fontSize: "28px", margin: 0, lineHeight: 1.1 }}>{stat.value}</strong>
                  <small style={{ fontSize: "11px", color: "var(--ok)", display: "block", marginTop: "2px" }}>{stat.delta}</small>
                </div>
                <div style={{ paddingBottom: "2px" }}>
                  {renderKpiChart(stat.label)}
                </div>
              </div>
            </article>
          ))}

        <article className="ba-card ba-publication-card">
          <div className="ba-card-title"><h2>Publicacion</h2><Send size={16} /></div>
          <div className="ba-form-grid ba-publication-form">
            <div className="ba-field">
              <span>URL pública</span>
              <a 
                className="ba-public-url-link" 
                href={merged.public_landing_url || "#"} 
                target="_blank" 
                rel="noreferrer" 
                aria-disabled={!merged.public_landing_url}
                style={merged.logo_url ? { padding: 0, overflow: "hidden", height: "120px", display: "block" } : undefined}
              >
                {merged.logo_url ? (
                  <img 
                    src={merged.logo_url} 
                    alt={merged.biz_name || "Logo"} 
                    className="ba-publication-logo" 
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} 
                  />
                ) : (
                  publicLandingLabel
                )}
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
