"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search, Star, X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { useDashboard } from "@/store/dashboard-context";
import {
  addBarberDescanso,
  deleteBarberDescanso,
  updateBarberActiveStatus
} from "@/lib/dashboard-api";

const FALLBACK = [
  "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/04/barbero1.1.png",
  "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/04/barbero2.1.png",
  "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/04/barbero3.1.png",
  "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/04/barbero4.1.png"
];

type BarberCard = {
  id: string;
  name: string;
  role: string;
  score: number;
  month: number;
  rank: number;
  image: string;
  isActive: boolean;
  clientsToday: number;
  servicesToday: number;
  servicesMonth: number;
};

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function imageFrom(item: Record<string, unknown>, index: number): string {
  return (
    text(item.foto ?? item.foto_url ?? item.photo ?? item.photo_url ?? item.avatar_url ?? item.image_url ?? item.imagen_url) ||
    FALLBACK[index % FALLBACK.length]
  );
}

function initialsFromName(name: string): string {
  const clean = name.trim();
  if (!clean) return "BR";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const DAYS = ["L", "M", "X", "J", "V", "S", "D"];


function buildCalendar(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDayJs = new Date(year, month, 1).getDay();
  const firstDayMondayIndex = (firstDayJs + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<{ day: number | null; key: string }> = [];
  for (let i = 0; i < firstDayMondayIndex; i += 1) cells.push({ day: null, key: `pad-start-${i}` });
  for (let d = 1; d <= daysInMonth; d += 1) cells.push({ day: d, key: `d-${d}` });
  while (cells.length % 7 !== 0) cells.push({ day: null, key: `pad-end-${cells.length}` });
  return cells;
}

export default function BarberosPage() {
  const { merged, identity, refresh } = useDashboard();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  const cards = useMemo<BarberCard[]>(() => {
    return merged.barbers.map((item, index) => {
      const score = Number(num(item.rating, 4.6).toFixed(1));
      return {
        id: text(item.id) || `barber-${index + 1}`,
        name: text(item.nombre ?? item.name) || `Barbero ${index + 1}`,
        role: text(item.especialidad ?? item.speciality) || "Corte & Barba",
        score,
        month: Math.max(120, Math.round(score * 80 + (index + 1) * 8)),
        rank: 40 + index * 7,
        image: imageFrom(item, index),
        isActive: Boolean(item.activo ?? true),
        clientsToday: 0,
        servicesToday: 0,
        servicesMonth: 0
      };
    });
  }, [merged.barbers]);

  const now = new Date();
  const todayDay = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  const offDaysByBarber = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const row of merged.descansos) {
      const bId = text(row.barbero_id);
      if (!bId) continue;
      if (!map[bId]) map[bId] = [];
      map[bId].push(text(row.fecha).split("T")[0]);
    }
    return map;
  }, [merged.descansos]);

  const cardsWithAvailability = useMemo(
    () =>
      cards.map((card) => {
        const byBarber = (merged.appointments || []).filter(
          (r) =>
            (r.barbero_id && String(r.barbero_id) === String(card.id)) ||
            (r.id_barbero && String(r.id_barbero) === String(card.id)) ||
            (r.barbero_nombre && String(r.barbero_nombre).trim().toLowerCase() === card.name.trim().toLowerCase())
        );

        const activeByBarber = byBarber.filter((r) => String(r.estado).toLowerCase() !== "cancelada");

        const todayStr = `${todayYear}-${String(todayMonth + 1).padStart(2, "0")}-${String(todayDay).padStart(2, "0")}`;
        const currentMonthPrefix = `${todayYear}-${String(todayMonth + 1).padStart(2, "0")}`;

        const servicesTodayRaw = activeByBarber.filter((r) => {
          const dateVal = String(r.fecha || "").split("T")[0];
          return dateVal === todayStr;
        }).length;

        const servicesMonthRaw = activeByBarber.filter((r) => {
          const dateVal = String(r.fecha || "").split("T")[0];
          return dateVal.startsWith(currentMonthPrefix);
        }).length;

        const clientsTodayRaw = new Set(
          activeByBarber
            .filter((r) => {
              const dateVal = String(r.fecha || "").split("T")[0];
              return dateVal === todayStr;
            })
            .map((r) => String(r.cliente_nombre ?? r.client ?? r.cliente_id).trim().toLowerCase())
            .filter(Boolean)
        ).size;

        const dateToCheck = selectedCalendarDate ?? todayStr;
        const isEmployeeActive = card.isActive;
        const hasRestOnCheckedDate = (offDaysByBarber[card.id] ?? []).includes(dateToCheck);
        const effectiveActive = isEmployeeActive && !hasRestOnCheckedDate;

        const servicesToday = effectiveActive ? servicesTodayRaw : 0;
        const servicesMonth = effectiveActive ? servicesMonthRaw : servicesMonthRaw;
        const clientsToday = effectiveActive ? clientsTodayRaw : clientsTodayRaw;
        
        return { 
          ...card, 
          isEmployeeActive, 
          isActive: effectiveActive, 
          servicesToday, 
          servicesMonth, 
          clientsToday 
        };
      }),
    [cards, merged.appointments, offDaysByBarber, selectedCalendarDate, todayDay, todayMonth, todayYear]
  );

  const listWithAvailability = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cardsWithAvailability;
    return cardsWithAvailability.filter((card) => card.name.toLowerCase().includes(q) || card.role.toLowerCase().includes(q));
  }, [cardsWithAvailability, query]);

  const selected = listWithAvailability.find((card) => card.id === selectedId) ?? null;
  const calendarBarberId = selectedId ?? listWithAvailability[0]?.id ?? null;
  const calendarCells = useMemo(() => buildCalendar(calendarMonth), [calendarMonth]);
  const monthLabel = `${MONTHS[calendarMonth.getMonth()]} ${calendarMonth.getFullYear()}`;
  const barberOffDays = calendarBarberId ? offDaysByBarber[calendarBarberId] ?? [] : [];



  const toggleAvailability = async (id: string) => {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const nextActive = !card.isActive;
    const res = await updateBarberActiveStatus(Number(id), nextActive);
    if (res.ok) {
      await refresh();
    } else {
      alert(res.message || "Error al actualizar disponibilidad en la BD.");
    }
  };

  const toggleOffDay = async (day: number) => {
    if (!calendarBarberId) return;
    const dateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const current = offDaysByBarber[calendarBarberId] ?? [];
    const exists = current.includes(dateStr);

    setSelectedCalendarDate(dateStr);

    try {
      if (exists) {
        const res = await deleteBarberDescanso(Number(calendarBarberId), dateStr);
        if (res.ok) {
          await refresh();
        } else {
          alert(res.message || "Error al eliminar descanso.");
        }
      } else {
        if (!identity?.barberia_id) return;
        const res = await addBarberDescanso({
          barberia_id: identity.barberia_id,
          barbero_id: Number(calendarBarberId),
          fecha: dateStr
        });
        if (res.ok) {
          await refresh();
        } else {
          alert(res.message || "Error al guardar descanso.");
        }
      }
    } catch {
      alert("Error de red al actualizar descanso.");
    }
  };

  return (
    <DashboardShell>
      <section className="ba-barbers-wrap">
        <div className="ba-barbers-main ba-card">
          <div className="ba-barbers-title-row">
            <h1>Barberos</h1>
            <a
              className="ba-mini-gold"
              href="https://barberagency-barberagency.gymh5g.easypanel.host/registro-barberias/"
              target="_blank"
              rel="noreferrer"
            >
              <Plus size={12} />
              Editar barberos
            </a>
          </div>

          <label className="ba-mini-search">
            <Search size={12} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Buscar barberos"
            />
          </label>

          <div className="ba-barbers-cards-grid">
            {listWithAvailability.map((card) => (
              <article
                key={card.id}
                className={`ba-barber-v2-card ${selected?.id === card.id ? "is-selected" : ""}`}
                onClick={() => setSelectedId(card.id)}
              >
                <div className="ba-barber-v2-media">
                  <img
                    src={card.image}
                    alt={card.name}
                    loading="lazy"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = "none";
                      const parent = target.parentElement;
                      if (!parent) return;
                      if (parent.querySelector(".ba-barber-media-fallback")) return;
                      const fallback = document.createElement("div");
                      fallback.className = "ba-barber-media-fallback";
                      fallback.textContent = initialsFromName(card.name);
                      parent.appendChild(fallback);
                    }}
                  />
                  <button type="button" className="ba-card-menu" aria-label="Opciones">
                    <MoreHorizontal size={13} />
                  </button>
                </div>
                <div className="ba-barber-v2-body">
                  <strong>{card.name}</strong>
                  <small>{card.role}</small>
                  <div className="ba-barber-status-row">
                    <em className={`ba-availability-chip ${card.isActive ? "is-active" : "is-inactive"}`}>
                      {card.isActive ? "Activo" : "Inactivo"}
                    </em>
                    <span>{card.servicesToday} servicios hoy</span>
                  </div>
                  <button
                    type="button"
                    className="ba-availability-toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAvailability(card.id);
                    }}
                  >
                    {card.isEmployeeActive ? "Poner Inactivo" : "Poner Activo"}
                  </button>
                  <div className="ba-stars">
                    <Star size={10} />
                    <Star size={10} />
                    <Star size={10} />
                    <Star size={10} />
                    <Star size={10} />
                    <span>{card.score.toFixed(1)}</span>
                  </div>
                  <button className="ba-card-gold" type="button">
                    Ver Perfil
                  </button>
                </div>
              </article>
            ))}
          </div>

          {selected ? (
            <article className="ba-overlay-card">
              <header className="ba-overlay-head">
                <div className="ba-overlay-user">
                  <img src={selected.image} alt={selected.name} loading="lazy" />
                  <div>
                    <strong>{selected.name}</strong>
                    <small>{selected.role}</small>
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedId(null)} aria-label="Cerrar ficha">
                  <X size={12} />
                </button>
              </header>
              <div className="ba-overlay-grid">
                <p><span>Rating</span><strong>{selected.score.toFixed(1)}</strong></p>
                <p><span>Servicios hoy</span><strong>{selected.servicesToday}</strong></p>
                <p><span>Servicios este mes</span><strong>{selected.servicesMonth}</strong></p>
              </div>
              <footer className="ba-overlay-actions">
                <button
                  type="button"
                  className="ba-btn-ghost"
                  onClick={() => toggleAvailability(selected.id)}
                >
                  {selected.isEmployeeActive ? "Poner Inactivo" : "Poner Activo"}
                </button>
                <button type="button" className="ba-card-gold">Ver Perfil</button>
              </footer>
            </article>
          ) : null}
        </div>

        <aside className="ba-barbers-right">
          <article className="ba-card ba-right-widget">
            <header className="ba-right-header">
              <h3>Disponibilidad de Barberos</h3>
              <MoreHorizontal size={12} />
            </header>
            <ul className="ba-performance-list">
              {listWithAvailability.slice(0, 5).map((card) => (
                <li key={`perf-${card.id}`}>
                  <img src={card.image} alt={card.name} loading="lazy" />
                  <div>
                    <strong>{card.name}</strong>
                    <small>{card.servicesToday} servicios hoy</small>
                  </div>
                  <div className="ba-performance-metrics">
                    <span className={card.isActive ? "is-active" : "is-inactive"}>
                      {card.isActive ? "Activo" : "Inactivo"}
                    </span>
                    <small>{card.servicesToday}</small>
                    <button
                      type="button"
                      className="ba-availability-toggle"
                      onClick={() => toggleAvailability(card.id)}
                    >
                      {card.isEmployeeActive ? "Inactivar" : "Activar"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <button className="ba-card-gold" type="button">
              Ver Perfil
            </button>
          </article>

          <article className="ba-card ba-right-widget">
            <header className="ba-right-header">
              <h3>Descanso de Barbero</h3>
              <CalendarDays size={12} />
            </header>
            <label className="ba-mini-field">
              <span>Barbero</span>
              <select
                className="ba-mini-field-input"
                value={calendarBarberId ?? ""}
                onChange={(e) => setSelectedId(e.target.value || null)}
              >
                {listWithAvailability.map((card) => (
                  <option key={`cal-${card.id}`} value={card.id}>{card.name}</option>
                ))}
              </select>
            </label>
            <div className="ba-calendar-nav">
              <button type="button" aria-label="Mes anterior" onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
                <ChevronLeft size={12} />
              </button>
              <span>{monthLabel}</span>
              <button type="button" aria-label="Mes siguiente" onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
                <ChevronRight size={12} />
              </button>
            </div>
            <div className="ba-mini-calendar">
              {DAYS.map((day, index) => (
                <span key={`head-${index}`} className="is-head">
                  {day}
                </span>
              ))}
              {calendarCells.map((cell) => {
                const cellDateStr = cell.day !== null
                  ? `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`
                  : "";
                const isBlocked = cell.day !== null && barberOffDays.includes(cellDateStr);
                const isTodayCell =
                  cell.day !== null &&
                  cell.day === todayDay &&
                  calendarMonth.getMonth() === todayMonth &&
                  calendarMonth.getFullYear() === todayYear &&
                  !isBlocked;
                const todayCellStyle = isTodayCell
                  ? {
                      color: "#0f2b1a",
                      fontWeight: 800,
                      borderColor: "rgba(98, 210, 149, 0.75)",
                      background: "linear-gradient(180deg, rgba(151, 233, 188, 0.95), rgba(87, 197, 139, 0.92))",
                      boxShadow: "inset 0 0 0 1px rgba(67, 175, 119, 0.55)"
                    }
                  : undefined;
                return (
                  <button
                    key={`cell-${cell.key}`}
                    type="button"
                    className={`is-cell ${isBlocked ? "is-blocked" : ""} ${isTodayCell ? "is-today" : ""}`}
                    style={todayCellStyle}
                    disabled={cell.day === null}
                    onClick={() => cell.day !== null && toggleOffDay(cell.day)}
                  >
                    {cell.day ?? ""}
                  </button>
                );
              })}
            </div>
            <small className="ba-loyal-note">
              Click en el día para {barberOffDays.length ? "quitar/agregar" : "agregar"} descanso.
            </small>
          </article>
        </aside>
      </section>
    </DashboardShell>
  );
}

