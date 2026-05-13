"use client";

import { useMemo, useState } from "react";
import { Cake, ChevronLeft, ChevronRight, Clock3, Gift, MoreHorizontal, RefreshCcw, Scissors, Plus, Search, X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";

type Client = {
  id: string;
  name: string;
  email: string;
  phone: string;
  lastVisit: string;
  status: "Confirmada" | "Pendiente";
  avatar: string;
  loyaltyPoints: number;
  preferredBarber: string;
  preferredService: string;
  stampCurrent: number;
  stampRequired: number;
  birthdayBenefit: string;
  inactiveDays: number;
  reactivationBenefit: string;
  offPeakBenefit: string;
};

const CLIENTS: Client[] = [
  {
    id: "C-01",
    name: "Juan P.",
    email: "juan.p@gmail.com",
    phone: "(37) 325-8302",
    lastVisit: "25 ene de 2023",
    status: "Confirmada",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop",
    loyaltyPoints: 1200,
    preferredBarber: "Alex M.",
    preferredService: "Corte y Barba",
    stampCurrent: 5,
    stampRequired: 8,
    birthdayBenefit: "20% OFF en cumpleaños",
    inactiveDays: 11,
    reactivationBenefit: "10% OFF si regresa esta semana",
    offPeakBenefit: "15% OFF Lun-Jue 2pm-5pm"
  },
  {
    id: "C-02",
    name: "Carlos R.",
    email: "carlos.r@gmail.com",
    phone: "(47) 327-9335",
    lastVisit: "22 ene de 2023",
    status: "Confirmada",
    avatar: "https://images.unsplash.com/photo-1542909168-82c3e7fdca5c?w=120&auto=format&fit=crop",
    loyaltyPoints: 980,
    preferredBarber: "James R.",
    preferredService: "Fade",
    stampCurrent: 7,
    stampRequired: 8,
    birthdayBenefit: "Servicio de barba gratis",
    inactiveDays: 4,
    reactivationBenefit: "Mensaje no programado",
    offPeakBenefit: "12% OFF Lun-Mie 3pm-5pm"
  },
  {
    id: "C-03",
    name: "Luis G.",
    email: "luis.g@gmail.com",
    phone: "(27) 393-8900",
    lastVisit: "18 ene de 2023",
    status: "Pendiente",
    avatar: "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=120&auto=format&fit=crop",
    loyaltyPoints: 640,
    preferredBarber: "Alex M.",
    preferredService: "Corte",
    stampCurrent: 2,
    stampRequired: 8,
    birthdayBenefit: "15% OFF en cumpleaños",
    inactiveDays: 23,
    reactivationBenefit: "Reactiva con 20% OFF",
    offPeakBenefit: "Promo 2x1 en horas muertas"
  },
  {
    id: "C-04",
    name: "Maria S.",
    email: "maria.s@gmail.com",
    phone: "(37) 327-9004",
    lastVisit: "17 ene de 2023",
    status: "Confirmada",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop",
    loyaltyPoints: 1330,
    preferredBarber: "James R.",
    preferredService: "Barba",
    stampCurrent: 8,
    stampRequired: 8,
    birthdayBenefit: "Corte gratis en cumpleaños",
    inactiveDays: 2,
    reactivationBenefit: "No aplica (cliente activa)",
    offPeakBenefit: "20% OFF horario valle"
  },
  {
    id: "C-05",
    name: "Maria S.",
    email: "maria.s@gmail.com",
    phone: "(47) 397-1902",
    lastVisit: "11 ene de 2023",
    status: "Pendiente",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&auto=format&fit=crop",
    loyaltyPoints: 520,
    preferredBarber: "Alex M.",
    preferredService: "Corte",
    stampCurrent: 3,
    stampRequired: 8,
    birthdayBenefit: "10% OFF + bebida",
    inactiveDays: 31,
    reactivationBenefit: "Recordatorio activo con 25% OFF",
    offPeakBenefit: "15% OFF horas muertas"
  }
];

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

function statusClass(status: Client["status"]): string {
  return status === "Confirmada" ? "is-accepted" : "is-pending";
}

function initialsFrom(name: string): string {
  const chunks = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!chunks.length) return "CL";
  if (chunks.length === 1) return chunks[0].slice(0, 2).toUpperCase();
  return `${chunks[0][0] ?? ""}${chunks[1][0] ?? ""}`.toUpperCase();
}

function phoneToWhatsappUrl(phone: string, clientName: string): string | null {
  const digits = String(phone || "").replace(/\D+/g, "");
  if (!digits) return null;
  const normalized = digits.length <= 10 ? `57${digits}` : digits;
  const message = encodeURIComponent(`Hola ${clientName}, te escribimos de la barbería.`);
  return `https://wa.me/${normalized}?text=${message}`;
}

export default function ClientesPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [calendarDay, setCalendarDay] = useState<number | null>(new Date().getDate());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CLIENTS;
    return CLIENTS.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [query]);

  const selected = CLIENTS.find((c) => c.id === selectedId) ?? null;
  const calendarCells = useMemo(() => buildCalendar(calendarMonth), [calendarMonth]);
  const calendarMonthLabel = `${MONTHS[calendarMonth.getMonth()]} ${calendarMonth.getFullYear()}`;
  const clientsForSelectedDay = useMemo(() => {
    if (!calendarDay) return [];
    return CLIENTS.filter((client, index) => ((calendarDay + index) % 3 === 0) || ((calendarDay + index) % 5 === 0));
  }, [calendarDay]);
  const occupancyRate = useMemo(() => {
    const maxDailySlots = 12;
    const usedSlots = clientsForSelectedDay.length;
    return Math.min(100, Math.round((usedSlots / maxDailySlots) * 100));
  }, [clientsForSelectedDay]);

  return (
    <DashboardShell>
      <section className="ba-client-layout">
        <div className="ba-client-main ba-card">
          <header className="ba-client-head">
            <h1>Clientes</h1>
            <button className="ba-mini-gold" type="button">
              <Plus size={12} />
              Estar cliente
            </button>
          </header>

          <label className="ba-mini-search">
            <Search size={12} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Buscar clientes"
            />
          </label>

          <div className="ba-client-table">
            <div className="ba-client-row ba-client-row-head">
              <span>Nombre</span>
              <span>Contacto</span>
              <span>Ultima Vista</span>
              <span>Estatus</span>
            </div>

            {filtered.map((client) => (
              <button
                key={client.id}
                type="button"
                className={`ba-client-row ${selected?.id === client.id ? "is-selected" : ""}`}
                onClick={() => { setSelectedId(client.id); setDetailOpen(true); }}
              >
                <span className="ba-client-id">
                  <span className="ba-client-initials">{initialsFrom(client.name)}</span>
                  <b>{client.name}</b>
                  <small>{client.email}</small>
                </span>
                <span>{client.phone}</span>
                <span>{client.lastVisit}</span>
                <span>
                  <em className={`ba-status-chip ${statusClass(client.status)}`}>{client.status}</em>
                </span>
              </button>
            ))}
          </div>

          {selected && detailOpen ? (
            <>
            <button
              type="button"
              className="ba-client-overlay-backdrop"
              aria-label="Cerrar detalle"
              onClick={() => setDetailOpen(false)}
            />
            <article className="ba-client-card-popup ba-client-overlay-card">
              <header>
                <div className="ba-client-popup-user">
                  <span className="ba-overlay-initials">{initialsFrom(selected.name)}</span>
                  <div>
                    <strong>{selected.name}</strong>
                    <small>{selected.email}</small>
                  </div>
                </div>
                <button type="button" onClick={() => setDetailOpen(false)} aria-label="Cerrar ficha">
                  <X size={12} />
                </button>
              </header>

              <div className="ba-client-popup-grid">
                <p><span>Date</span><strong>28 Ene - 10:00 AM</strong></p>
                <p><span>Time</span><strong>Corte y Barba</strong></p>
                <p><span>Unitar</span><strong>{selected.preferredBarber}</strong></p>
              </div>

              <div className="ba-client-popup-meta">
                <p>
                  <span>Barbers Preferido</span>
                  <strong>{selected.preferredBarber}</strong>
                </p>
                <p>
                  <span>Telefono</span>
                  <strong>
                    <a
                      className="ba-whatsapp-link"
                      href={phoneToWhatsappUrl(selected.phone, selected.name) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => {
                        if (!phoneToWhatsappUrl(selected.phone, selected.name)) e.preventDefault();
                      }}
                    >
                      {selected.phone}
                    </a>
                  </strong>
                </p>
                <p>
                  <span>Preferencias servicios</span>
                  <strong>{selected.preferredService}</strong>
                </p>
                <p>
                  <span>Notas</span>
                  <strong>Automatico: avisar 1hr antes y ser puntual.</strong>
                </p>
              </div>

              <section className="ba-client-loyalty-card">
                <header>
                  <h4><Gift size={12} />Beneficios de Lealtad</h4>
                </header>
                <div className="ba-client-stamp-track">
                  {Array.from({ length: selected.stampRequired }, (_, idx) => (
                    <span key={`stamp-${idx}`} className={idx < selected.stampCurrent ? "is-on" : ""}>
                      <Scissors size={11} />
                    </span>
                  ))}
                </div>
                <small className="ba-client-stamp-note">
                  {selected.stampCurrent} / {selected.stampRequired} sellos
                </small>
                <ul>
                  <li><Cake size={11} /><span>{selected.birthdayBenefit}</span></li>
                  <li><RefreshCcw size={11} /><span>{selected.inactiveDays} días sin visita · {selected.reactivationBenefit}</span></li>
                  <li><Clock3 size={11} /><span>{selected.offPeakBenefit}</span></li>
                </ul>
              </section>

              <footer>
                <span>Puntos de lealtad</span>
                <strong>{selected.loyaltyPoints}</strong>
              </footer>
            </article>
            </>
          ) : null}
        </div>
        <aside className="ba-client-right">
          <article className="ba-card ba-right-widget ba-client-selected-widget">
            <header className="ba-right-header">
              <h3>Cliente Seleccionado</h3>
              <MoreHorizontal size={12} />
            </header>
            {selected ? (
              <>
                <div className="ba-client-selected-head">
                  <span className="ba-client-initials">{initialsFrom(selected.name)}</span>
                  <div>
                    <strong>{selected.name}</strong>
                    <small>{selected.email}</small>
                  </div>
                </div>
                <div className="ba-client-selected-grid">
                  <p>
                    <span>Telefono</span>
                    <strong>
                      <a
                        className="ba-whatsapp-link"
                        href={phoneToWhatsappUrl(selected.phone, selected.name) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          if (!phoneToWhatsappUrl(selected.phone, selected.name)) e.preventDefault();
                        }}
                      >
                        {selected.phone}
                      </a>
                    </strong>
                  </p>
                  <p><span>Ultima visita</span><strong>{selected.lastVisit}</strong></p>
                  <p><span>Barbero</span><strong>{selected.preferredBarber}</strong></p>
                  <p><span>Servicio</span><strong>{selected.preferredService}</strong></p>
                </div>
                <div className="ba-client-stamp-track">
                  {Array.from({ length: selected.stampRequired }, (_, idx) => (
                    <span key={`side-stamp-${idx}`} className={idx < selected.stampCurrent ? "is-on" : ""}>
                      <Scissors size={11} />
                    </span>
                  ))}
                </div>
                <small className="ba-client-stamp-note">
                  {selected.stampCurrent} / {selected.stampRequired} sellos
                </small>
              </>
            ) : (
              <p className="ba-client-selected-empty">Elige un cliente para ver su tarjeta aqui.</p>
            )}
          </article>

          <article className="ba-card ba-right-widget ba-client-mini-calendar-wrap">
            <header className="ba-right-header">
              <h3>Calendario</h3>
              <MoreHorizontal size={12} />
            </header>
            <div className="ba-calendar-nav">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => {
                  setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
                  setCalendarDay(null);
                }}
              >
                <ChevronLeft size={12} />
              </button>
              <span>{calendarMonthLabel}</span>
              <button
                type="button"
                aria-label="Mes siguiente"
                onClick={() => {
                  setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
                  setCalendarDay(null);
                }}
              >
                <ChevronRight size={12} />
              </button>
            </div>
            <div className="ba-mini-calendar">
              {DAYS.map((day) => (
                <div key={`client-head-${day}`} className="is-head">{day}</div>
              ))}
              {calendarCells.map((cell) => (
                <button
                  key={`client-cell-${cell.key}`}
                  type="button"
                  className={`is-cell ${cell.day !== null && calendarDay === cell.day ? "is-active" : ""}`}
                  onClick={() => cell.day !== null && setCalendarDay(cell.day)}
                  disabled={cell.day === null}
                >
                  {cell.day ?? ""}
                </button>
              ))}
            </div>
          </article>

          <article className="ba-card ba-right-widget ba-client-occupancy-widget">
            <header className="ba-right-header">
              <h3>Tasa de Ocupacion</h3>
              <MoreHorizontal size={12} />
            </header>
            <p className="ba-client-kpi">{occupancyRate}%</p>
            <div className="ba-client-progress">
              <span style={{ width: `${occupancyRate}%` }} />
            </div>
            <p className="ba-loyal-note">
              {clientsForSelectedDay.length} clientes del dia / 12 cupos
            </p>
          </article>

          <div className="ba-client-right-mobile">
            <article className="ba-card ba-right-widget">
              <header className="ba-right-header">
                <h3>Calendario</h3>
                <MoreHorizontal size={12} />
              </header>
              <div className="ba-calendar-nav">
                <button
                  type="button"
                  aria-label="Mes anterior"
                  onClick={() => {
                    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
                    setCalendarDay(null);
                  }}
                >
                  <ChevronLeft size={12} />
                </button>
                <span>{calendarMonthLabel}</span>
                <button
                  type="button"
                  aria-label="Mes siguiente"
                  onClick={() => {
                    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
                    setCalendarDay(null);
                  }}
                >
                  <ChevronRight size={12} />
                </button>
              </div>
              <div className="ba-mini-calendar">
                {DAYS.map((day) => (
                  <div key={`client-mobile-head-${day}`} className="is-head">{day}</div>
                ))}
                {calendarCells.map((cell) => (
                  <button
                    key={`client-mobile-cell-${cell.key}`}
                    type="button"
                    className={`is-cell ${cell.day !== null && calendarDay === cell.day ? "is-active" : ""}`}
                    onClick={() => cell.day !== null && setCalendarDay(cell.day)}
                    disabled={cell.day === null}
                  >
                    {cell.day ?? ""}
                  </button>
                ))}
              </div>
            </article>

            <article className="ba-card ba-right-widget">
              <header className="ba-right-header">
                <h3>Tasa de Ocupacion</h3>
                <MoreHorizontal size={12} />
              </header>
              <p className="ba-client-kpi">{occupancyRate}%</p>
              <div className="ba-client-progress">
                <span style={{ width: `${occupancyRate}%` }} />
              </div>
              <p className="ba-loyal-note">
                {clientsForSelectedDay.length} clientes del dia / 12 cupos
              </p>
            </article>
          </div>
        </aside>
      </section>
    </DashboardShell>
  );
}

