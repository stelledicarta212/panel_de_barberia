"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Cake, CalendarDays, ChevronLeft, ChevronRight, Clock3, Eye, Gift, MoreHorizontal, Pencil, Plus, RefreshCcw, Scissors, Send, Trash2, X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { useDashboard } from "@/store/dashboard-context";

type RequestStatus = "Pendiente" | "Enviada" | "Aceptada";

type RequestItem = {
  id: string;
  client: string;
  phone?: string;
  service: string;
  date: string;
  hour?: string;
  barber?: string;
  description?: string;
  total?: number;
  status: RequestStatus;
  avatar: string;
  stampCurrent: number;
  stampRequired: number;
  birthdayBenefit: string;
  inactiveDays: number;
  reactivationBenefit: string;
  offPeakBenefit: string;
};

type CreatedAppointment = {
  ticketId: string;
  client: string;
  date: string;
  barber: string;
  hour: string;
  items: Array<{ name: string; price: number }>;
  subtotal: number;
  tax: number;
  total: number;
};

type ServiceOption = {
  id: string;
  name: string;
  price: number;
};

type BarberOption = {
  id: string;
  name: string;
};

const INITIAL_REQUESTS: RequestItem[] = [
  {
    id: "R-01",
    client: "Juan Perez",
    service: "Corte de Pelo",
    date: "15/05/2023",
    status: "Pendiente",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop",
    stampCurrent: 5,
    stampRequired: 8,
    birthdayBenefit: "20% OFF en cumpleanos",
    inactiveDays: 11,
    reactivationBenefit: "10% OFF si regresa esta semana",
    offPeakBenefit: "15% OFF Lun-Jue 2pm-5pm"
  },
  {
    id: "R-02",
    client: "Juan Perez",
    service: "Corte de Pelo",
    date: "11/06/2023",
    status: "Enviada",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop",
    stampCurrent: 5,
    stampRequired: 8,
    birthdayBenefit: "20% OFF en cumpleanos",
    inactiveDays: 11,
    reactivationBenefit: "10% OFF si regresa esta semana",
    offPeakBenefit: "15% OFF Lun-Jue 2pm-5pm"
  },
  {
    id: "R-03",
    client: "Olivik",
    service: "Corte de Pelo",
    date: "19/09/2023",
    status: "Aceptada",
    avatar: "https://images.unsplash.com/photo-1542909168-82c3e7fdca5c?w=120&auto=format&fit=crop",
    stampCurrent: 7,
    stampRequired: 8,
    birthdayBenefit: "Servicio de barba gratis",
    inactiveDays: 4,
    reactivationBenefit: "Mensaje no programado",
    offPeakBenefit: "12% OFF Lun-Mie 3pm-5pm"
  }
];

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const DAYS = ["L", "M", "X", "J", "V", "S", "D"];
const RESERVATIONS_STORAGE_KEY = "ba_dashboard_reservas";
const BARBER_OFF_DAYS_STORAGE_KEY = "ba_barberos_descansos";
const BARBER_MANUAL_AVAILABILITY_STORAGE_KEY = "ba_barberos_manual_availability";

function statusClass(status: RequestStatus): string {
  if (status === "Pendiente") return "is-pending";
  if (status === "Enviada") return "is-sent";
  return "is-accepted";
}

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

function toCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapServiceOptions(services: Array<Record<string, unknown>>): ServiceOption[] {
  const mapped = services.map((item, index) => {
    const name = textValue(item.nombre ?? item.name) || `Servicio ${index + 1}`;
    const id = textValue(item.id) || `srv-${index + 1}`;
    const price = Math.max(0, numberValue(item.precio ?? item.price));
    return { id, name, price };
  });
  return mapped.length
    ? mapped
    : [
        { id: "default-1", name: "Corte de Pelo", price: 15 },
        { id: "default-2", name: "Barba", price: 6 }
      ];
}

function mapBarberOptions(barbers: Array<Record<string, unknown>>): BarberOption[] {
  const mapped = barbers.map((item, index) => ({
    id: textValue(item.id) || `barber-${index + 1}`,
    name: textValue(item.nombre ?? item.name) || `Barbero ${index + 1}`
  }));
  return mapped.length
    ? mapped
    : [
        { id: "barber-default-1", name: "Alex M." },
        { id: "barber-default-2", name: "James R." }
      ];
}

function formatDbDate(value: unknown): string {
  const raw = textValue(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function mapAppointmentRequests(appointments: Array<Record<string, unknown>>): RequestItem[] {
  return appointments.map((item, index) => {
    const client = textValue(item.cliente_nombre ?? item.client ?? item.nombre_cliente) || "Cliente";
    const statusText = textValue(item.estado ?? item.status).toLowerCase();
    const status: RequestStatus =
      statusText.includes("pend") ? "Pendiente" : statusText.includes("acept") || statusText.includes("confirm") ? "Aceptada" : "Enviada";
    return {
      id: textValue(item.id) || `cita-${index + 1}`,
      client,
      phone: textValue(item.cliente_tel ?? item.telefono ?? item.phone),
      service: textValue(item.servicio_nombre ?? item.service ?? item.nombre_servicio) || "Servicio",
      date: formatDbDate(item.fecha ?? item.date),
      hour: textValue(item.hora_inicio ?? item.hora ?? item.hour).slice(0, 5),
      barber: textValue(item.barbero_nombre ?? item.barber ?? item.nombre_barbero),
      description: textValue(item.notas ?? item.description),
      total: numberValue(item.total),
      status,
      avatar: "",
      stampCurrent: 0,
      stampRequired: 8,
      birthdayBenefit: "Sin beneficio configurado",
      inactiveDays: 0,
      reactivationBenefit: "Sin automatizacion",
      offPeakBenefit: "Sin promocion"
    };
  });
}

function formatDate(day: number, month: number, year: number): string {
  const dd = String(day).padStart(2, "0");
  const mm = String(month + 1).padStart(2, "0");
  return `${dd}/${mm}/${year}`;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "CL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function hourToMinutes(value?: string): number {
  const raw = String(value || "").trim();
  const [h, m] = raw.split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return -1;
  return hh * 60 + mm;
}

function phoneToWhatsappUrl(phone: string, clientName: string): string | null {
  const digits = String(phone || "").replace(/\D+/g, "");
  if (!digits) return null;
  const normalized = digits.length <= 10 ? `57${digits}` : digits;
  const message = encodeURIComponent(`Hola ${clientName}, te escribimos de la barbería por tu cita.`);
  return `https://wa.me/${normalized}?text=${message}`;
}

export default function CitasPage() {
  const { merged } = useDashboard();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(true);
  const [isDayPickerOpen, setIsDayPickerOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());
  const [reserveMonth, setReserveMonth] = useState(() => new Date());
  const [reserveDay, setReserveDay] = useState<number | null>(new Date().getDate());
  const [form, setForm] = useState({
    cliente: "camilo rodriguez",
    telefono: "",
    barbero: "",
    hora: "10:00",
    descripcion: "Descripcion de cita de lado..."
  });
  const serviceOptions = useMemo(() => mapServiceOptions(merged.services), [merged.services]);
  const barberOptions = useMemo(() => mapBarberOptions(merged.barbers), [merged.barbers]);
  const hourOptions = useMemo(
    () => ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "14:00", "15:00", "16:00", "17:00"],
    []
  );
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [created, setCreated] = useState<CreatedAppointment | null>(null);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [barberOffDays, setBarberOffDays] = useState<Record<string, number[]>>({});
  const [barberManualAvailability, setBarberManualAvailability] = useState<Record<string, boolean | undefined>>({});
  const [agendaBarberFilter, setAgendaBarberFilter] = useState<string>("global");
  const [nowTime, setNowTime] = useState(() =>
    new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date())
  );
  const formRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const remoteRequests = mapAppointmentRequests(merged.appointments);
    setRequests(remoteRequests);
    setSelectedId((current) => (current && remoteRequests.some((req) => req.id === current) ? current : null));
  }, [merged.appointments]);

  const selected = requests.find((req) => req.id === selectedId) ?? null;
  const calendarCells = useMemo(() => buildCalendar(currentMonth), [currentMonth]);
  const monthLabel = `${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
  const reserveCalendarCells = useMemo(() => buildCalendar(reserveMonth), [reserveMonth]);
  const reserveMonthLabel = `${MONTHS[reserveMonth.getMonth()]} ${reserveMonth.getFullYear()}`;
  const selectedDateString = selectedDay
    ? formatDate(selectedDay, currentMonth.getMonth(), currentMonth.getFullYear())
    : null;
  const reserveDateString = reserveDay
    ? formatDate(reserveDay, reserveMonth.getMonth(), reserveMonth.getFullYear())
    : null;

  const computedItems = useMemo(() => {
    const selectedMap = new Set(selectedServiceIds);
    const picked = serviceOptions.filter((service) => selectedMap.has(service.id));
    if (!picked.length) return [{ name: "Sin servicio seleccionado", price: 0 }];
    return picked.map((service) => ({ name: service.name, price: service.price }));
  }, [serviceOptions, selectedServiceIds]);
  const subtotal = useMemo(() => computedItems.reduce((acc, item) => acc + item.price, 0), [computedItems]);
  const tax = useMemo(() => Number((subtotal * 0.13).toFixed(2)), [subtotal]);
  const total = useMemo(() => Number((subtotal + tax).toFixed(2)), [subtotal, tax]);

  const activeSummary = created ?? {
    ticketId: "1234",
    client: form.cliente || "cliente",
    date: reserveDateString ?? "Sin fecha",
    barber: form.barbero || barberOptions[0]?.name || "Sin barbero",
    hour: form.hora || "Sin hora",
    items: computedItems,
    subtotal,
    tax,
    total
  };

  const prevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setSelectedDay(null);
    setIsDayPickerOpen(false);
  };

  const availableBarberOptions = useMemo(() => {
    return barberOptions.filter((barber) => {
      const manualFlag = barberManualAvailability[barber.id];
      if (manualFlag === false) return false;
      if (!reserveDay) return true;
      if (manualFlag === true) return true;
      const restDays = barberOffDays[barber.id] ?? [];
      return !restDays.includes(reserveDay);
    });
  }, [barberOptions, barberOffDays, barberManualAvailability, reserveDay]);

  const nextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setSelectedDay(null);
    setIsDayPickerOpen(false);
  };

  const handleCreateCita = () => {
    if (!reserveDateString) return;
    const date = reserveDateString;
    const firstService = computedItems[0]?.name ?? "Servicio";
    const isEditing = Boolean(editingRequestId);
    const id = editingRequestId ?? `R-${String(requests.length + 1).padStart(2, "0")}`;
    const ticketId = String(1234 + requests.length);

    const newRequest: RequestItem = {
      id,
      client: form.cliente || "Cliente",
      phone: form.telefono || "",
      service: computedItems.map((item) => item.name).join(", ") || firstService,
      date,
      barber: form.barbero || barberOptions[0]?.name || "Sin barbero",
      hour: form.hora || "Sin hora",
      description: form.descripcion || "",
      total,
      status: "Enviada",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop",
      stampCurrent: 1,
      stampRequired: 8,
      birthdayBenefit: "15% OFF en cumpleanos",
      inactiveDays: 0,
      reactivationBenefit: "Recien creada",
      offPeakBenefit: "Promo segun horario"
    };

    setRequests((prev) => {
      if (isEditing) {
        return prev.map((req) => (req.id === id ? { ...req, ...newRequest } : req));
      }
      return [newRequest, ...prev];
    });
    setSelectedId(id);
    setCreated({
      ticketId,
      client: form.cliente || "Cliente",
      date,
      barber: form.barbero || barberOptions[0]?.name || "Sin barbero",
      hour: form.hora || "Sin hora",
      items: computedItems,
      subtotal,
      tax,
      total
    });
    setEditingRequestId(null);
  };
  const handleEditRequest = (req: RequestItem) => {
    setEditingRequestId(req.id);
    setIsCreateOpen(true);
    setForm((prev) => ({
      ...prev,
      cliente: req.client,
      telefono: req.phone ?? prev.telefono,
      barbero: req.barber ?? prev.barbero,
      hora: req.hour ?? prev.hora,
      descripcion: req.description ?? prev.descripcion
    }));

    const targetServices = req.service
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);
    const matchedIds = serviceOptions
      .filter((srv) => targetServices.some((target) => srv.name.toLowerCase().includes(target) || target.includes(srv.name.toLowerCase())))
      .map((srv) => srv.id);
    if (matchedIds.length) {
      setSelectedServiceIds(matchedIds);
    } else {
      const fallback = serviceOptions.find((srv) => req.service.toLowerCase().includes(srv.name.toLowerCase()));
      setSelectedServiceIds(fallback ? [fallback.id] : []);
    }

    const [d, m, y] = req.date.split("/");
    const day = Number(d);
    const month = Number(m) - 1;
    const year = Number(y);
    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
      setReserveMonth(new Date(year, month, 1));
      setReserveDay(day);
      setCurrentMonth(new Date(year, month, 1));
      setSelectedDay(day);
    }
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const handleDeleteRequest = (id: string) => {
    setRequests((prev) => prev.filter((req) => req.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
    setEditingRequestId((prev) => (prev === id ? null : prev));
    setDetailOpen((prev) => (selectedId === id ? false : prev));
  };

  const handleOpenDetail = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  };
  const prevReserveMonth = () => {
    setReserveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setReserveDay(null);
  };
  const nextReserveMonth = () => {
    setReserveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setReserveDay(null);
  };
  const filteredRequests = selectedDateString
    ? requests.filter((req) => req.date === selectedDateString)
    : requests;
  const boardDateString = selectedDateString ?? formatDate(new Date().getDate(), currentMonth.getMonth(), currentMonth.getFullYear());
  const [boardDayPart, boardMonthPart, boardYearPart] = boardDateString.split("/");
  const agendaDayNumber = Number(boardDayPart);
  const agendaMonthNumber = Number(boardMonthPart);
  const agendaYearNumber = Number(boardYearPart);
  const agendaBarberStatus = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const barber of barberOptions) {
      const manualFlag = barberManualAvailability[barber.id];
      const offDays = barberOffDays[barber.id] ?? [];
      const isRestDay = offDays.includes(agendaDayNumber);
      const isSameMonthAsBoard =
        Number.isFinite(agendaMonthNumber) &&
        Number.isFinite(agendaYearNumber) &&
        agendaMonthNumber === currentMonth.getMonth() + 1 &&
        agendaYearNumber === currentMonth.getFullYear();
      const autoActive = isSameMonthAsBoard ? !isRestDay : true;
      const isActive = manualFlag === undefined ? autoActive : manualFlag;
      map.set(barber.name, isActive);
    }
    return map;
  }, [
    barberOptions,
    barberManualAvailability,
    barberOffDays,
    agendaDayNumber,
    agendaMonthNumber,
    agendaYearNumber,
    currentMonth
  ]);
  const agendaHours = useMemo(() => {
    const slots: string[] = [];
    for (let h = 9; h <= 19; h += 1) {
      slots.push(`${String(h).padStart(2, "0")}:00`);
      if (h !== 19) slots.push(`${String(h).padStart(2, "0")}:30`);
    }
    return slots;
  }, []);
  const dayRequests = useMemo(
    () =>
      requests
        .filter((req) => req.date === boardDateString)
        .sort(
        (a, b) => hourToMinutes(a.hour ?? form.hora) - hourToMinutes(b.hour ?? form.hora)
      ),
    [requests, boardDateString, form.hora]
  );
  const visibleDayRequests = useMemo(() => {
    if (agendaBarberFilter === "global") return dayRequests;
    return dayRequests.filter((req) => (req.barber ?? "").trim() === agendaBarberFilter);
  }, [dayRequests, agendaBarberFilter]);

  const daysWithAppointments = useMemo(() => {
    const set = new Set<number>();
    const mm = String(currentMonth.getMonth() + 1).padStart(2, "0");
    const yyyy = String(currentMonth.getFullYear());
    for (const req of requests) {
      const [d, m, y] = req.date.split("/");
      if (m === mm && y === yyyy) {
        const dayNum = Number(d);
        if (Number.isFinite(dayNum)) set.add(dayNum);
      }
    }
    return set;
  }, [requests, currentMonth]);
  const occupancyRate = useMemo(() => {
    const reserved = visibleDayRequests.length;
    const totalSlots = agendaHours.length;
    if (!totalSlots) return 0;
    return Math.min(100, Math.round((reserved / totalSlots) * 100));
  }, [visibleDayRequests, agendaHours]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTime(
        new Intl.DateTimeFormat("es-CO", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        }).format(new Date())
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadManualAvailability = () => {
      try {
        const raw = window.localStorage.getItem(BARBER_MANUAL_AVAILABILITY_STORAGE_KEY);
        if (!raw) {
          setBarberManualAvailability({});
          return;
        }
        const parsed = JSON.parse(raw);
        setBarberManualAvailability(
          parsed && typeof parsed === "object" ? (parsed as Record<string, boolean | undefined>) : {}
        );
      } catch {
        setBarberManualAvailability({});
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
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RESERVATIONS_STORAGE_KEY, JSON.stringify(requests));
    window.dispatchEvent(new CustomEvent("ba-reservas-updated"));
  }, [requests]);

  useEffect(() => {
    const loadBarberOffDays = () => {
      try {
        const raw = window.localStorage.getItem(BARBER_OFF_DAYS_STORAGE_KEY);
        if (!raw) {
          setBarberOffDays({});
          return;
        }
        const parsed = JSON.parse(raw);
        setBarberOffDays(parsed && typeof parsed === "object" ? (parsed as Record<string, number[]>) : {});
      } catch {
        setBarberOffDays({});
      }
    };
    loadBarberOffDays();
    window.addEventListener("storage", loadBarberOffDays);
    window.addEventListener("ba-barberos-descanso-updated", loadBarberOffDays as EventListener);
    return () => {
      window.removeEventListener("storage", loadBarberOffDays);
      window.removeEventListener("ba-barberos-descanso-updated", loadBarberOffDays as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!form.barbero) return;
    const stillAvailable = availableBarberOptions.some((barber) => barber.name === form.barbero);
    if (!stillAvailable) {
      setForm((prev) => ({ ...prev, barbero: "" }));
    }
  }, [availableBarberOptions, form.barbero]);

  return (
    <DashboardShell>
      <section className="ba-citas-layout">
        <div className="ba-citas-left ba-card">
          <header className="ba-citas-head">
            <h1>Citas</h1>
            <button type="button" className="ba-mini-gold" onClick={() => setIsCreateOpen((v) => !v)}>
              <Plus size={12} />
              {isCreateOpen ? "Ocultar Nueva Cita" : "Crear Nueva Cita"}
            </button>
          </header>

          <section className="ba-citas-live-grid">
            <article className="ba-card ba-citas-live-card">
              <header>
                <h3>Reloj del Sistema</h3>
              </header>
              <p className="ba-citas-live-time">{nowTime}</p>
              <small>Hora local del dispositivo</small>
            </article>
            <article className="ba-card ba-citas-live-card">
              <header>
                <h3>Tasa de Ocupacion</h3>
              </header>
              <p className="ba-citas-live-rate">{occupancyRate}%</p>
              <div className="ba-client-progress">
                <span style={{ width: `${occupancyRate}%` }} />
              </div>
              <small>{visibleDayRequests.length} reservas del dia / {agendaHours.length} turnos</small>
            </article>
          </section>

          <article className="ba-card ba-citas-calendar-inline">
            <header className="ba-card-title">
              <h2>Calendario/Reserva de Citas</h2>
              <button type="button" aria-label="Opciones"><MoreHorizontal size={12} /></button>
            </header>
            <div className="ba-citas-board-desktop">
              <div className="ba-citas-board-top">
                <button type="button" aria-label="Mes anterior" onClick={prevMonth}><ChevronLeft size={12} /></button>
                <div className="ba-citas-board-top-center">
                  <span>{monthLabel}</span>
                  <select
                    className="ba-citas-board-barber-filter"
                    value={agendaBarberFilter}
                    onChange={(e) => setAgendaBarberFilter(e.target.value)}
                    aria-label="Filtrar agenda por barbero"
                  >
                    <option value="global">Citas hoy</option>
                    {barberOptions.map((barber) => (
                      <option key={`agenda-filter-${barber.id}`} value={barber.name}>
                        {`Citas ${barber.name}`}
                      </option>
                    ))}
                  </select>
                  <em
                    className={`ba-agenda-status-chip ${
                      agendaBarberFilter === "global"
                        ? "is-global"
                        : agendaBarberStatus.get(agendaBarberFilter)
                          ? "is-active"
                          : "is-inactive"
                    }`}
                  >
                    {agendaBarberFilter === "global"
                      ? "Global"
                      : agendaBarberStatus.get(agendaBarberFilter)
                        ? "Activo"
                        : "Inactivo"}
                  </em>
                  <div className="ba-citas-board-day-picker">
                    <button
                      type="button"
                      className="ba-citas-board-day-trigger"
                      onClick={() => setIsDayPickerOpen((prev) => !prev)}
                      aria-label="Seleccionar dia"
                    >
                      <CalendarDays size={12} />
                      <span>{selectedDay ? String(selectedDay).padStart(2, "0") : "--"}</span>
                    </button>
                    {isDayPickerOpen && (
                      <div className="ba-citas-board-day-popover">
                        <div className="ba-citas-board-day-week-head">
                          {DAYS.map((day) => (
                            <span key={`picker-head-${day}`}>{day}</span>
                          ))}
                        </div>
                        <div className="ba-citas-board-day-grid">
                          {calendarCells.map((cell) => (
                            <button
                              key={`board-day-${cell.key}`}
                              type="button"
                              disabled={cell.day === null}
                              className={`ba-citas-board-day ${selectedDay === cell.day ? "is-active" : ""} ${cell.day !== null && daysWithAppointments.has(cell.day) ? "is-marked" : ""}`}
                              onClick={() => {
                                if (cell.day === null) return;
                                setSelectedDay(cell.day);
                                setIsDayPickerOpen(false);
                              }}
                            >
                              {cell.day ?? ""}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <button type="button" aria-label="Mes siguiente" onClick={nextMonth}><ChevronRight size={12} /></button>
              </div>
              <div className="ba-citas-board-grid">
                <div className="ba-citas-board-head">Hora</div>
                <div className="ba-citas-board-head">Turnos</div>
                <div className="ba-citas-board-head">Detalle</div>
                {agendaHours.map((hour) => {
                  const reqsAtHour = visibleDayRequests.filter((req) => (req.hour ?? "") === hour);
                  const reqAtHour = reqsAtHour[0] ?? null;
                  const barberSummary = reqsAtHour
                    .map((req) => (req.barber ?? "").trim())
                    .filter(Boolean)
                    .slice(0, 2)
                    .join(", ");
                  const hasMoreBarbers = reqsAtHour.length > 2;
                  return (
                    <div key={`row-${hour}`} className="ba-citas-board-row">
                      <div className="ba-citas-board-time">{hour}</div>
                      <button
                        type="button"
                        className={`ba-citas-board-slot ${reqAtHour ? "is-booked" : "is-empty"}`}
                        onClick={() => {
                          if (reqAtHour) {
                            handleOpenDetail(reqAtHour.id);
                            return;
                          }
                          setForm((prev) => ({ ...prev, hora: hour }));
                          setIsCreateOpen(true);
                        }}
                      >
                        {reqAtHour ? (
                          <>
                            <strong>{reqAtHour.client}{reqsAtHour.length > 1 ? ` +${reqsAtHour.length - 1}` : ""}</strong>
                            <small>
                              {reqsAtHour.length > 1
                                ? `${reqsAtHour.length} reservas · ${barberSummary}${hasMoreBarbers ? "..." : ""}`
                                : reqAtHour.service}
                            </small>
                          </>
                        ) : (
                          <small>Disponible</small>
                        )}
                      </button>
                      <div className={`ba-citas-board-state ${reqAtHour ? statusClass(reqAtHour.status) : ""}`}>
                        {reqAtHour ? (reqsAtHour.length > 1 ? `${reqsAtHour.length} citas` : reqAtHour.status) : "-"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="ba-citas-board-mobile">
              <div className="ba-calendar-nav">
                <button type="button" aria-label="Mes anterior" onClick={prevMonth}><ChevronLeft size={12} /></button>
                <span>{monthLabel}</span>
                <button type="button" aria-label="Mes siguiente" onClick={nextMonth}><ChevronRight size={12} /></button>
              </div>
              <div className="ba-mini-calendar">
                {DAYS.map((day) => (
                  <div key={`head-${day}`} className="is-head">{day}</div>
                ))}
                {calendarCells.map((cell) => (
                  <button
                    key={cell.key}
                    type="button"
                    className={`is-cell ${
                      cell.day !== null && selectedDay === cell.day
                        ? "is-active"
                        : cell.day !== null && daysWithAppointments.has(cell.day)
                          ? "is-marked"
                          : ""
                    }`}
                    onClick={() => cell.day !== null && setSelectedDay(cell.day)}
                    disabled={cell.day === null}
                  >
                    {cell.day ?? ""}
                  </button>
                ))}
              </div>
            </div>
          </article>

          <article className="ba-citas-table-wrap">
            <header className="ba-citas-table-head">
              <h3>Solicitudes de Cita</h3>
              <button type="button" aria-label="Opciones"><MoreHorizontal size={12} /></button>
            </header>

            <div className="ba-citas-table">
              <div className="ba-citas-row ba-citas-row-head">
                <span>Cliente</span>
                <span>Servicio</span>
                <span>Fecha</span>
                <span>Hora</span>
                <span>Barbero</span>
                <span>Estado</span>
                <span>Acciones</span>
              </div>

              {filteredRequests.map((req) => (
                <div
                  className={`ba-citas-row ba-citas-row-selectable ${selected?.id === req.id ? "is-selected" : ""}`}
                  key={req.id}
                  onClick={() => handleOpenDetail(req.id)}
                >
                  <span className="ba-citas-client">
                    <span className="ba-citas-initials" aria-hidden="true">{initialsFromName(req.client)}</span>
                    <span data-label="Cliente">{req.client}</span>
                  </span>
                  <span data-label="Servicio">{req.service}</span>
                  <span data-label="Fecha">{req.date}</span>
                  <span data-label="Hora">{(req.hour ?? form.hora) || "Sin hora"}</span>
                  <span data-label="Barbero">{(req.barber ?? form.barbero) || "Sin barbero"}</span>
                  <span data-label="Estado">
                    <em className={`ba-status-chip ${statusClass(req.status)}`}>{req.status}</em>
                  </span>
                  <span className="ba-citas-actions" data-label="Acciones">
                    <button type="button" className="is-gold-action" onClick={(e) => { e.stopPropagation(); handleOpenDetail(req.id); }}><Eye size={11} />Ver</button>
                    <button type="button" className="is-gold-action" onClick={(e) => { e.stopPropagation(); handleEditRequest(req); }}><Pencil size={11} />Editar</button>
                    <button type="button" className="is-gold-action" onClick={(e) => { e.stopPropagation(); handleDeleteRequest(req.id); }}><Trash2 size={11} />Borrar</button>
                    <button type="button" className="is-gold-action"><Send size={11} />Enviar</button>
                  </span>
                </div>
              ))}
            </div>
          </article>

          {selected && detailOpen ? (
            <>
            <button
              type="button"
              className="ba-citas-overlay-backdrop"
              aria-label="Cerrar detalle"
              onClick={() => setDetailOpen(false)}
            />
            <article className="ba-overlay-card ba-citas-overlay-card">
              <header className="ba-overlay-head">
                <div className="ba-overlay-user">
                  <span className="ba-overlay-initials" aria-hidden="true">{initialsFromName(selected.client)}</span>
                  <div>
                    <strong>{selected.client}</strong>
                    <small>{selected.service}</small>
                  </div>
                </div>
                <button type="button" onClick={() => setDetailOpen(false)} aria-label="Cerrar ficha">
                  <X size={12} />
                </button>
              </header>
              <div className="ba-overlay-grid">
                <p><span>Cliente</span><strong>{selected.client}</strong></p>
                <p>
                  <span>Telefono</span>
                  {selected.phone ? (
                    <strong>
                      <a
                        className="ba-whatsapp-link"
                        href={phoneToWhatsappUrl(selected.phone, selected.client) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          if (!phoneToWhatsappUrl(selected.phone ?? "", selected.client)) e.preventDefault();
                        }}
                      >
                        {selected.phone}
                      </a>
                    </strong>
                  ) : (
                    <strong>Sin telefono</strong>
                  )}
                </p>
                <p><span>Fecha</span><strong>{selected.date}</strong></p>
                <p><span>Hora</span><strong>{selected.hour ?? "Sin hora"}</strong></p>
                <p><span>Barbero</span><strong>{selected.barber ?? "Sin barbero"}</strong></p>
                <p><span>Estado</span><strong>{selected.status}</strong></p>
                <p><span>Servicio</span><strong>{selected.service}</strong></p>
                <p><span>Descripcion</span><strong>{selected.description || "Sin descripcion"}</strong></p>
                <p><span>Total</span><strong>{toCurrency(selected.total ?? 0)}</strong></p>
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
                  <li><RefreshCcw size={11} /><span>{selected.inactiveDays} dias sin visita Â· {selected.reactivationBenefit}</span></li>
                  <li><Clock3 size={11} /><span>{selected.offPeakBenefit}</span></li>
                </ul>
              </section>
              <footer className="ba-overlay-actions">
                <button type="button" className="ba-btn-ghost" onClick={() => handleDeleteRequest(selected.id)}>Borrar</button>
                <button type="button" className="ba-btn-ghost">Ver</button>
                <button type="button" className="ba-card-gold">Enviar</button>
              </footer>
            </article>
            </>
          ) : null}
        </div>

        <aside className="ba-citas-right">
          {isCreateOpen ? (
            <article className="ba-card ba-cita-form" ref={formRef}>
              <header className="ba-right-header">
                <h3>{editingRequestId ? `Editar Cita ${editingRequestId}` : "Crear Nueva Cita"}</h3>
                <button type="button" aria-label="Opciones"><MoreHorizontal size={12} /></button>
              </header>

              <label>Cliente</label>
              <input
                className="ba-mini-field"
                value={form.cliente}
                onChange={(e) => setForm((prev) => ({ ...prev, cliente: e.target.value }))}
              />

              <label>Telefono</label>
              <input
                className="ba-mini-field"
                value={form.telefono}
                onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))}
                placeholder="3001234567"
              />

              <label>Seleccion de Servicios</label>
              <div className="ba-cita-services-picker">
                {serviceOptions.map((service) => {
                  const isSelected = selectedServiceIds.includes(service.id);
                  return (
                    <button
                      key={service.id}
                      type="button"
                      className={`ba-cita-service-option ${isSelected ? "is-selected" : ""}`}
                      onClick={() => toggleService(service.id)}
                    >
                      <span>{service.name}</span>
                      <strong>{toCurrency(service.price)}</strong>
                    </button>
                  );
                })}
              </div>

              <label>Descripcion</label>
              <textarea
                className="ba-mini-textarea"
                value={form.descripcion}
                onChange={(e) => setForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                placeholder="Descripcion de cita de lado..."
              />

              <label>Calendario de Reserva</label>
              <div className="ba-cita-reserve-calendar">
                <div className="ba-calendar-nav">
                  <button type="button" aria-label="Mes anterior reserva" onClick={prevReserveMonth}><ChevronLeft size={12} /></button>
                  <span>{reserveMonthLabel}</span>
                  <button type="button" aria-label="Mes siguiente reserva" onClick={nextReserveMonth}><ChevronRight size={12} /></button>
                </div>
                <div className="ba-mini-calendar">
                  {DAYS.map((day) => (
                    <div key={`reserve-head-${day}`} className="is-head">{day}</div>
                  ))}
                  {reserveCalendarCells.map((cell) => (
                    <button
                      key={`reserve-${cell.key}`}
                      type="button"
                      className={`is-cell ${cell.day !== null && reserveDay === cell.day ? "is-active" : ""}`}
                      onClick={() => cell.day !== null && setReserveDay(cell.day)}
                      disabled={cell.day === null}
                    >
                      {cell.day ?? ""}
                    </button>
                  ))}
                </div>
              </div>

              <label>Barbero</label>
              <select
                className="ba-mini-field"
                value={form.barbero}
                onChange={(e) => setForm((prev) => ({ ...prev, barbero: e.target.value }))}
              >
                <option value="">Selecciona barbero</option>
                {availableBarberOptions.map((barber) => (
                  <option key={barber.id} value={barber.name}>{barber.name}</option>
                ))}
              </select>
              {reserveDay && availableBarberOptions.length === 0 ? (
                <small className="ba-loyal-note">No hay barberos disponibles para ese día (descanso).</small>
              ) : null}

              <label>Hora</label>
              <select
                className="ba-mini-field"
                value={form.hora}
                onChange={(e) => setForm((prev) => ({ ...prev, hora: e.target.value }))}
              >
                {hourOptions.map((hour) => (
                  <option key={hour} value={hour}>{hour}</option>
                ))}
              </select>

              <div className="ba-mini-total">
                <small>Dia seleccionado</small>
                <strong>{reserveDateString ?? "Sin fecha"}</strong>
              </div>

              <div className="ba-mini-total">
                <small>Precio Total</small>
                <strong>{toCurrency(total)}</strong>
              </div>

              <button type="button" className="ba-card-gold" onClick={handleCreateCita} disabled={!reserveDateString || !selectedServiceIds.length}>
                {editingRequestId ? "Guardar cambios" : "Enviar Cita"}
              </button>
            </article>
          ) : (
            <article className="ba-card ba-cita-form">
              <header className="ba-right-header">
                <h3>Nueva Cita Oculta</h3>
              </header>
              <p className="ba-loyal-note">Pulsa Crear Nueva Cita para mostrar el formulario.</p>
            </article>
          )}

          <article className="ba-card ba-cita-summary">
            <header className="ba-right-header">
              <h3>Cita #{activeSummary.ticketId} para {activeSummary.client || "cliente"}</h3>
              <button type="button" aria-label="Opciones"><MoreHorizontal size={12} /></button>
            </header>

            <ul>
              <li><span>Barbero</span><span>{activeSummary.barber}</span></li>
              <li><span>Hora</span><span>{activeSummary.hour}</span></li>
              {activeSummary.items.map((item, idx) => (
                <li key={`${item.name}-${idx}`}><span>{item.name}</span><span>{toCurrency(item.price)}</span></li>
              ))}
              <li><span>Fecha</span><span>{activeSummary.date}</span></li>
              <li><span>Subtotal</span><span>{toCurrency(activeSummary.subtotal)}</span></li>
              <li><span>Impuesto</span><span>{toCurrency(activeSummary.tax)}</span></li>
              <li className="is-total"><span>Total</span><span>{toCurrency(activeSummary.total)}</span></li>
            </ul>

            <div className="ba-cita-summary-actions">
              <button type="button" className="ba-btn-ghost">Editar</button>
              <button type="button" className="ba-card-gold">Enviar</button>
            </div>
          </article>
        </aside>
      </section>
    </DashboardShell>
  );
}


