"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calculator,
  CreditCard,
  DollarSign,
  Receipt,
  Scissors,
  Wallet,
  Search,
  Trash2,
  Plus,
  Minus,
  X,
  Sparkles,
  User,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { useDashboard } from "@/store/dashboard-context";
import { savePosSale } from "@/lib/dashboard-api";

type Movement = {
  id: string;
  client: string;
  service: string;
  method: string;
  amount: number;
  status: "Pendiente" | "Aceptada";
  date: string;
  hour: string;
  barber: string;
  serviceId?: string;
  barberId?: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function money2(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function formatDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return "-";
  try {
    // Si contiene 'T' o tiene hora completa, lo parseamos respetando la zona horaria del cliente
    if (raw.includes("T") || (raw.includes(" ") && raw.length > 10)) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${dd}/${mm}/${yyyy}`;
      }
    }
    
    // Si es una fecha simple YYYY-MM-DD
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

function formatHour(value: unknown): string {
  return text(value).slice(0, 5) || "-";
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "BA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function buildDefaultServiceImage(name: string): string {
  const safeName = encodeURIComponent(name.slice(0, 24));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260'>
  <defs>
    <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='#0a101d'/>
      <stop offset='100%' stop-color='#141c2f'/>
    </linearGradient>
    <linearGradient id='gold' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='#f59e0b'/>
      <stop offset='100%' stop-color='#b45309'/>
    </linearGradient>
  </defs>
  <rect width='400' height='260' fill='url(#bg)'/>
  <rect x='12' y='12' width='376' height='236' rx='16' fill='none' stroke='#1e293b' stroke-width='1.5'/>
  <circle cx='200' cy='100' r='42' fill='rgba(245,158,11,.1)' stroke='url(#gold)' stroke-width='1.5'/>
  <text x='200' y='112' text-anchor='middle' font-size='38' font-family='Segoe UI, Arial' fill='#f59e0b'>✂</text>
  <text x='200' y='180' text-anchor='middle' font-size='20' font-weight='700' font-family='Segoe UI, Arial' fill='#f8fafc'>${safeName}</text>
  <text x='200' y='210' text-anchor='middle' font-size='11' font-family='Segoe UI, Arial' fill='#94a3b8' letter-spacing='1'>SERVICIO PREMIUM</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${svg}`;
}

function mapAppointment(item: Record<string, unknown>, index: number): Movement {
  // Determinamos si la cita ya ha sido pagada (verificando la columna metodo_pago de la DB)
  const rawMethod = item.metodo_pago || item.pago_metodo || item.metodo || item.method;
  const hasPayment = typeof rawMethod === "string" && rawMethod.trim().length > 0;
  return {
    id: text(item.id) || `cita-${index + 1}`,
    client: text(item.cliente_nombre ?? item.client ?? item.nombre_cliente) || "Cliente",
    service: text(item.servicio_nombre ?? item.service ?? item.nombre_servicio) || "Servicio",
    method: text(rawMethod) || "Pendiente",
    amount: num(item.total),
    status: hasPayment ? "Aceptada" : "Pendiente",
    date: formatDate(item.fecha ?? item.date),
    hour: formatHour(item.hora_inicio ?? item.hora ?? item.hour),
    barber: text(item.barbero_nombre ?? item.barber ?? item.nombre_barbero) || "Sin barbero",
    serviceId: text(item.servicio_id ?? item.id_servicio),
    barberId: text(item.barbero_id ?? item.id_barbero)
  };
}

export default function InventarioPage() {
  const { identity, merged, refresh } = useDashboard();
  const [posClient, setPosClient] = useState("");
  const [posBarber, setPosBarber] = useState("");
  const [posMethod, setPosMethod] = useState("Efectivo");
  const [posReceived, setPosReceived] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [localMovements, setLocalMovements] = useState<Movement[]>([]);
  const [charging, setCharging] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [serviceSearch, setServiceSearch] = useState("");

  // Control de la Calculadora Modal
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState("0");
  const [calcHistory, setCalcHistory] = useState("");

  // Estado para la Tirilla Flotante / Recibo de Éxito
  const [showReceipt, setShowReceipt] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");

  // Optimismo de citas cargadas y cobros locales en tiempo real
  const [loadedAppointmentId, setLoadedAppointmentId] = useState<string | null>(null);
  const [locallyPaidAppointmentIds, setLocallyPaidAppointmentIds] = useState<Record<string, string>>({});

  // Control de Reporte Z
  const [showZReport, setShowZReport] = useState(false);
  const [zReportWhatsappPhone, setZReportWhatsappPhone] = useState("");

  // Load locally paid appointments from localStorage safely post-mount (hydration resilient)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ba_locally_paid_appointments");
      if (saved) {
        try {
          setLocallyPaidAppointmentIds(JSON.parse(saved));
        } catch (e) {
          console.error("Error parsing ba_locally_paid_appointments", e);
        }
      }
    }
  }, []);

  // Sync locally paid appointments to localStorage on updates
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ba_locally_paid_appointments", JSON.stringify(locallyPaidAppointmentIds));
    }
  }, [locallyPaidAppointmentIds]);

  // Autolimpieza inteligente de citas cobradas localmente en base al estado real del backend
  useEffect(() => {
    if (merged.appointments && Object.keys(locallyPaidAppointmentIds).length > 0) {
      setLocallyPaidAppointmentIds((prev) => {
        let hasChanges = false;
        const next = { ...prev };
        for (const apptId of Object.keys(next)) {
          // Buscar si la cita correspondiente en el backend ya viene marcada como pagada
          const dbAppt = merged.appointments.find((item) => text(item.id) === apptId);
          if (dbAppt) {
            const rawMethod = dbAppt.metodo_pago || dbAppt.pago_metodo || dbAppt.metodo || dbAppt.method;
            const hasPaymentInDb = typeof rawMethod === "string" && rawMethod.trim().length > 0;
            if (hasPaymentInDb) {
              delete next[apptId];
              hasChanges = true;
            }
          }
        }
        return hasChanges ? next : prev;
      });
    }
  }, [merged.appointments, locallyPaidAppointmentIds]);

  // Autolimpieza inteligente de cobros rápidos mostrador optimistas
  useEffect(() => {
    if (merged.appointments && localMovements.length > 0) {
      setLocalMovements((prev) => {
        const next = prev.filter((local) => {
          // Buscamos si hay alguna cita en el backend que coincida con este cobro rápido de mostrador
          const isAlreadyInDb = merged.appointments.some((item) => {
            const rawMethod = item.metodo_pago || item.pago_metodo || item.metodo || item.method;
            const hasPayment = typeof rawMethod === "string" && rawMethod.trim().length > 0;
            if (!hasPayment) return false;

            const dbClient = text(item.cliente_nombre ?? item.client ?? item.nombre_cliente) || "Cliente";
            const dbBarber = text(item.barbero_nombre ?? item.barber ?? item.nombre_barbero) || "Sin barbero";
            const dbAmount = num(item.total);
            const dbMethod = text(rawMethod);

            return (
              dbClient === local.client &&
              dbBarber === local.barber &&
              dbAmount === local.amount &&
              dbMethod === local.method
            );
          });
          return !isAlreadyInDb;
        });
        if (next.length !== prev.length) {
          return next;
        }
        return prev;
      });
    }
  }, [merged.appointments, localMovements]);

  const [receiptDetails, setReceiptDetails] = useState<{
    client: string;
    barber: string;
    method: string;
    received: number;
    change: number;
    total: number;
    date: string;
    hour: string;
    services: Array<{
      name: string;
      quantity: number;
      amount: number;
      totalAmount: number;
    }>;
  } | null>(null);

  const services = useMemo(
    () =>
      merged.services.map((item, index) => {
        const name = text(item.nombre ?? item.name) || `Servicio ${index + 1}`;
        const inheritedImage = text(
          item.image_url ??
          item.foto_url ??
          item.cover_url ??
          item.imagen_url ??
          item.imagen ??
          item.photo_url
        );
        return {
          id: text(item.id) || `service-${index + 1}`,
          name,
          amount: num(item.precio ?? item.price),
          image: inheritedImage || buildDefaultServiceImage(name)
        };
      }),
    [merged.services]
  );

  const filteredServices = useMemo(() => {
    return services.filter((s) =>
      s.name.toLowerCase().includes(serviceSearch.toLowerCase())
    );
  }, [services, serviceSearch]);

  const barbers = useMemo(
    () =>
      merged.barbers.map((item, index) => ({
        id: text(item.id) || `barber-${index + 1}`,
        name: text(item.nombre ?? item.name) || `Barbero ${index + 1}`
      })),
    [merged.barbers]
  );

  const sourceMovements = useMemo(() => {
    return merged.appointments.map((item, index) => {
      const appt = mapAppointment(item, index);
      const localMethod = locallyPaidAppointmentIds[appt.id];
      if (localMethod) {
        return {
          ...appt,
          status: "Aceptada" as const,
          method: localMethod
        };
      }
      return appt;
    });
  }, [merged.appointments, locallyPaidAppointmentIds]);

  const movements = useMemo(
    () => [...localMovements, ...sourceMovements],
    [localMovements, sourceMovements]
  );

  const selectedServicesGrouped = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of selectedServiceIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, quantity]) => {
        const service = services.find((s) => s.id === id);
        return {
          ...service,
          quantity,
          totalAmount: (service?.amount ?? 0) * quantity
        };
      })
      .filter((item) => item.id);
  }, [selectedServiceIds, services]);

  const subtotal = useMemo(
    () => selectedServicesGrouped.reduce((acc, item) => acc + (item.totalAmount ?? 0), 0),
    [selectedServicesGrouped]
  );
  const receivedAmount = Number(posReceived || 0);
  const changeAmount = Math.max(0, receivedAmount - subtotal);
  const pendingAmount = Math.max(0, subtotal - receivedAmount);
  const canCharge = subtotal > 0 && (posMethod !== "Efectivo" || receivedAmount >= subtotal);

  const posSummary = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;
    const formattedToday = `${dd}/${mm}/${yyyy}`;

    // 1. Movimientos del día
    const todayMovements = movements.filter((m) => {
      const mDate = text(m.date);
      return mDate === formattedToday || mDate === todayStr;
    });

    // 2. Movimientos cobrados del día
    const paidMovements = todayMovements.filter((item) => item.status !== "Pendiente");

    // 3. Monto total cobrado (Ventas del día)
    const salesDay = paidMovements.reduce((acc, item) => acc + item.amount, 0);

    // 4. Efectivo en caja
    const cashDay = paidMovements
      .filter((item) => item.method?.toLowerCase() === "efectivo")
      .reduce((acc, item) => acc + item.amount, 0);

    // 5. Pagos digitales (monto total cobrado digital)
    const digitalPaymentsAmount = paidMovements
      .filter((item) => item.method?.toLowerCase() !== "efectivo")
      .reduce((acc, item) => acc + item.amount, 0);

    // 6. Conteo de pagos digitales y porcentaje
    const digitalPaymentsCount = paidMovements.filter((item) => item.method?.toLowerCase() !== "efectivo").length;
    const totalPaymentsCount = paidMovements.length;
    const digitalPercentage = totalPaymentsCount > 0 
      ? Math.round((digitalPaymentsCount / totalPaymentsCount) * 100) 
      : 0;

    // 7. Total agendado hoy
    const totalAgendadoHoy = todayMovements.reduce((acc, item) => acc + item.amount, 0);

    // 8. Total pendiente de cobro hoy
    const totalPendienteHoy = todayMovements.filter((item) => item.status === "Pendiente").reduce((acc, item) => acc + item.amount, 0);

    // 9. Citas agendadas de hoy pendientes por cobrar (citas originales de hoy)
    const pendingAppointments = todayMovements.filter((m) => {
      const isPending = m.status === "Pendiente";
      const isSourceAppointment = m.id.startsWith("cita-") || !isNaN(Number(m.id));
      return isPending && isSourceAppointment;
    });

    // 10. Citas agendadas de hoy cobradas / finalizadas (citas originales de hoy)
    const finishedAppointments = todayMovements.filter((m) => {
      const isFinished = m.status !== "Pendiente";
      const isSourceAppointment = m.id.startsWith("cita-") || !isNaN(Number(m.id));
      return isFinished && isSourceAppointment;
    });

    // 11. Cierre por barbero
    const groupedBarbers = new Map<string, { cuts: number; total: number; pending: number }>();
    // Inicializar con los barberos registrados de la barbería para que no se pierdan aunque no tengan cortes
    for (const b of barbers) {
      groupedBarbers.set(b.name, { cuts: 0, total: 0, pending: 0 });
    }
    
    // Agrupar
    for (const item of todayMovements) {
      const barberName = item.barber || "Sin barbero";
      const current = groupedBarbers.get(barberName) ?? { cuts: 0, total: 0, pending: 0 };
      
      if (item.status !== "Pendiente") {
        current.cuts += 1;
        current.total += item.amount;
      } else {
        current.pending += item.amount;
      }
      groupedBarbers.set(barberName, current);
    }
    
    const closeRows = Array.from(groupedBarbers.entries()).map(([barber, row]) => ({
      barber,
      cuts: row.cuts,
      total: row.total,
      pending: row.pending,
      ticketAvg: row.cuts ? row.total / row.cuts : 0
    }));

    return {
      todayMovements,
      paidMovements,
      salesDay,
      cashDay,
      digitalPaymentsAmount,
      digitalPaymentsCount,
      digitalPercentage,
      totalAgendadoHoy,
      totalPendienteHoy,
      pendingAppointments,
      finishedAppointments,
      closeRows
    };
  }, [movements, barbers]);

  // Desestructuración segura del sumario de verdad única para mantener compatibilidad
  const {
    todayMovements,
    paidMovements,
    salesDay,
    cashDay,
    digitalPercentage,
    totalAgendadoHoy,
    totalPendienteHoy,
    pendingAppointments,
    finishedAppointments,
    closeRows
  } = posSummary;

  const handleChargeNow = async () => {
    if (!canCharge || charging) return;
    setCharging(true);
    setChargeError(null);
    try {
      const barberiaId = Number(identity?.barberia_id ?? 0);
      if (!barberiaId) {
        throw new Error("No se pudo obtener el ID de la barbería activa.");
      }

      // Buscar el objeto del barbero seleccionado para enviar su ID real en la DB
      const selectedBarberObj = merged.barbers.find(
        (b) => text(b.nombre ?? b.name) === posBarber
      );
      const barberoIdReal = selectedBarberObj ? text(selectedBarberObj.id) : "";

      const payload = {
        barberia_id: barberiaId,
        cliente_nombre: posClient.trim() || "Cliente mostrador",
        barbero_id: barberoIdReal || posBarber || "Sin barbero",
        metodo_pago: posMethod,
        monto_total: subtotal,
        servicios: selectedServicesGrouped.map((item) => ({
          id: item.id || "",
          name: item.name || "",
          amount: item.amount || 0,
          quantity: item.quantity || 1
        })),
        cita_id: (loadedAppointmentId && !loadedAppointmentId.startsWith("cita-")) ? loadedAppointmentId : undefined
      };

      const res = await savePosSale(payload);
      if (!res.ok) {
        throw new Error(res.message || "Error al procesar el cobro en el servidor.");
      }

      // Guardar copia de los detalles del cobro para la tirilla flotante
      const now = new Date();
      const timeStr = now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
      const dateStr = now.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });

      setReceiptDetails({
        client: posClient.trim() || "Cliente mostrador",
        barber: posBarber || "Sin barbero",
        method: posMethod,
        received: receivedAmount,
        change: changeAmount,
        total: subtotal,
        date: dateStr,
        hour: timeStr,
        services: selectedServicesGrouped.map(item => ({
          name: item.name || "Servicio",
          quantity: item.quantity || 1,
          amount: item.amount || 0,
          totalAmount: item.totalAmount || 0
        }))
      });

      // Crear movimiento optimista en tiempo real para actualizar KPIs e histórico al instante
      const optimisticMovement: Movement = {
        id: `sale-${Date.now()}`,
        client: posClient.trim() || "Cliente mostrador",
        service: selectedServicesGrouped.map(item => item.name).join(", "),
        method: posMethod,
        amount: subtotal,
        status: "Aceptada",
        date: dateStr, // "28/05/2026"
        hour: timeStr,
        barber: posBarber || "Sin barbero"
      };

      setLocalMovements(prev => [optimisticMovement, ...prev]);

      // Si había una cita cargada en el checkout, la marcamos como pagada localmente al instante
      if (loadedAppointmentId) {
        setLocallyPaidAppointmentIds(prev => ({
          ...prev,
          [loadedAppointmentId]: posMethod
        }));
        setLoadedAppointmentId(null);
      }

      // Limpiar campos de la estación de cobro tras éxito
      setSelectedServiceIds([]);
      setPosReceived("");
      setPosClient("");
      setPosBarber("");

      // Activar el modal de la tirilla flotante con pitido electrónico
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(1400, ctx.currentTime);
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        }
      } catch (e) {
        console.warn("PITIDO POS audio error:", e);
      }

      setWhatsappPhone("");
      setShowReceipt(true);

      // Forzar rehidratación desde el servidor en segundo plano
      refresh().catch(err => console.error("Error al rehidratar el contexto del POS:", err));
    } catch (err) {
      console.error("Error procesando cobro POS:", err);
      setChargeError(err instanceof Error ? err.message : "Error al procesar el cobro.");
    } finally {
      setCharging(false);
    }
  };

  // Lógica de Operación de la Calculadora
  const handleCalcPress = (value: string) => {
    if (value === "C") {
      setCalcDisplay("0");
      setCalcHistory("");
      return;
    }
    if (value === "=") {
      try {
        const cleanExpression = calcDisplay.replace(/×/g, "*").replace(/÷/g, "/");
        if (!/^[0-9+\-*/.\s()]+$/.test(cleanExpression)) {
          throw new Error("Sintaxis");
        }
        // eslint-disable-next-line no-eval
        const evaluated = eval(cleanExpression);
        const rounded = Math.round(Number(evaluated) * 100) / 100;
        setCalcHistory(calcDisplay + " =");
        setCalcDisplay(String(rounded));
      } catch {
        setCalcDisplay("Error");
      }
      return;
    }
    if (value === "⌫") {
      if (calcDisplay.length <= 1 || calcDisplay === "Error") {
        setCalcDisplay("0");
      } else {
        setCalcDisplay(calcDisplay.slice(0, -1));
      }
      return;
    }
    // Añadir operadores o números
    if (calcDisplay === "0" || calcDisplay === "Error") {
      if ("+-*/÷×".includes(value)) {
        setCalcDisplay("0" + value);
      } else {
        setCalcDisplay(value);
      }
    } else {
      setCalcDisplay(calcDisplay + value);
    }
  };

  const handleApplyCalcToReceived = () => {
    const val = Number(calcDisplay);
    if (Number.isFinite(val) && val > 0) {
      setPosReceived(String(Math.round(val)));
    }
    setShowCalculator(false);
  };

  return (
    <DashboardShell>
      <section className="p-4 max-w-7xl mx-auto flex flex-col gap-6">
        
        {/* KPI Panel */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <article className="ba-card p-5 relative overflow-hidden transition-all hover:border-amber-500/30">
            <header className="flex justify-between items-center text-[var(--muted)] text-xs font-semibold mb-2">
              <span>VENTAS DEL DÍA</span>
              <DollarSign size={14} className="text-amber-500" />
            </header>
            <strong className="text-2xl font-bold text-[var(--text)] tracking-tight">{money2(salesDay)}</strong>
            <div className="text-[10px] text-[var(--muted)] mt-1">{paidMovements.length} servicios cobrados</div>
          </article>

          <article className="ba-card p-5 relative overflow-hidden transition-all hover:border-amber-500/30">
            <header className="flex justify-between items-center text-[var(--muted)] text-xs font-semibold mb-2">
              <span>TICKETS CERRADOS</span>
              <Receipt size={14} className="text-amber-500" />
            </header>
            <strong className="text-2xl font-bold text-[var(--text)] tracking-tight">{paidMovements.length}</strong>
            <div className="text-[10px] text-[var(--muted)] mt-1">
              {pendingAppointments.length} pendientes por cobrar hoy
            </div>
          </article>

          <article className="ba-card p-5 relative overflow-hidden transition-all hover:border-amber-500/30">
            <header className="flex justify-between items-center text-[var(--muted)] text-xs font-semibold mb-2">
              <span>PAGO DIGITAL</span>
              <CreditCard size={14} className="text-amber-500" />
            </header>
            <strong className="text-2xl font-bold text-[var(--text)] tracking-tight">
              {`${digitalPercentage}%`}
            </strong>
            <div className="text-[10px] text-[var(--muted)] mt-1">Tarjeta o Transferencia</div>
          </article>

          <article className="ba-card p-5 relative overflow-hidden transition-all hover:border-amber-500/30">
            <header className="flex justify-between items-center text-[var(--muted)] text-xs font-semibold mb-2">
              <span>EFECTIVO EN CAJA</span>
              <Wallet size={14} className="text-amber-500" />
            </header>
            <strong className="text-2xl font-bold text-[var(--text)] tracking-tight">{money2(cashDay)}</strong>
            <div className="text-[10px] text-[var(--muted)] mt-1">Caja física de hoy</div>
          </article>
        </div>

        {/* Citas Agendadas Hoy (Pendientes de Cobro) */}
        {pendingAppointments.length > 0 && (
          <div className="ba-card p-5 relative overflow-hidden flex flex-col gap-3">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 to-amber-700" />
            <header className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-500 animate-pulse" />
                  Citas Agendadas de Hoy Pendientes de Cobro
                </h3>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">
                  Haz clic en cualquier fila para cargar automáticamente los datos y servicios al POS.
                </p>
              </div>
              <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-full">
                {pendingAppointments.length} POR COBRAR
              </span>
            </header>

            <div className="overflow-x-auto w-full border border-[var(--panel-stroke)] rounded-2xl bg-[var(--bg-soft)]/20">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--panel-stroke)] bg-[var(--bg-soft)]/60 text-[var(--muted)] font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Hora</th>
                    <th className="p-3">Servicio</th>
                    <th className="p-3">Barbero</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--panel-stroke)]/40">
                  {pendingAppointments.map((appt) => (
                    <tr
                      key={appt.id}
                      className="hover:bg-amber-500/5 transition-colors cursor-pointer group"
                      onClick={() => {
                        setPosClient(appt.client);
                        setPosBarber(appt.barber);
                        setLoadedAppointmentId(appt.id); // Guardar vinculación de la cita agendada
                        
                        let matchedService = services.find(s => s.id === appt.serviceId);
                        if (!matchedService) {
                          matchedService = services.find(s => s.name.toLowerCase() === appt.service.toLowerCase());
                        }

                        if (matchedService) {
                          setSelectedServiceIds([matchedService.id]);
                        }
                      }}
                    >
                      <td className="p-3 font-semibold text-[var(--text)] flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[9px] font-extrabold flex items-center justify-center shrink-0">
                          {initialsFrom(appt.client)}
                        </span>
                        <span className="group-hover:text-amber-500 transition-colors">{appt.client}</span>
                      </td>
                      <td className="p-3 text-[var(--text)] font-medium">
                        {appt.hour}
                      </td>
                      <td className="p-3 text-[var(--muted)]">
                        {appt.service}
                      </td>
                      <td className="p-3 text-[var(--muted)]">
                        {appt.barber}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[10px] rounded-lg uppercase tracking-wider transition-all active:scale-95 shadow-sm shadow-amber-500/10 cursor-pointer"
                        >
                          Cargar Cita ⚡
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Citas Agendadas Hoy Cobradas / Finalizadas */}
        {finishedAppointments.length > 0 && (
          <div className="ba-card p-5 relative overflow-hidden flex flex-col gap-3">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 to-emerald-700" />
            <header className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                  Citas Cobradas / Finalizadas de Hoy
                </h3>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">
                  Registro de las citas programadas de hoy que ya han sido liquidadas.
                </p>
              </div>
              <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full">
                {finishedAppointments.length} COBRADAS
              </span>
            </header>

            <div className="overflow-x-auto w-full border border-[var(--panel-stroke)] rounded-2xl bg-[var(--bg-soft)]/20">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--panel-stroke)] bg-[var(--bg-soft)]/60 text-[var(--muted)] font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Hora</th>
                    <th className="p-3">Servicio</th>
                    <th className="p-3">Barbero</th>
                    <th className="p-3 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--panel-stroke)]/40">
                  {finishedAppointments.map((appt) => (
                    <tr
                      key={appt.id}
                      className="bg-emerald-500/[0.01] hover:bg-emerald-500/[0.02] transition-colors"
                    >
                      <td className="p-3 font-semibold text-[var(--text)] flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-[9px] font-extrabold flex items-center justify-center shrink-0">
                          {initialsFrom(appt.client)}
                        </span>
                        <span>{appt.client}</span>
                      </td>
                      <td className="p-3 text-[var(--text)] font-medium">
                        {appt.hour}
                      </td>
                      <td className="p-3 text-[var(--muted)]">
                        {appt.service}
                      </td>
                      <td className="p-3 text-[var(--muted)]">
                        {appt.barber}
                      </td>
                      <td className="p-3 text-right select-none">
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-950/20 text-emerald-400 font-extrabold text-[10px] rounded-lg uppercase tracking-wider border border-emerald-900/20">
                          Cobrado ✓ ({appt.method})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Main Work Area: Catalog Left | Checkout Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Catalog Column (Left) */}
          <article className="lg:col-span-7 ba-card p-5 flex flex-col gap-4 min-h-[580px]">
            <header className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
                  <Scissors size={18} className="text-amber-500" />
                  Catálogo de Servicios
                </h2>
                <p className="text-[11px] text-[var(--muted)] mt-0.5">Selecciona servicios para agregarlos al tique</p>
              </div>
              <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full shrink-0">
                {filteredServices.length} DISPONIBLES
              </span>
            </header>

            {/* Buscador */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={14} className="text-[var(--muted)]" />
              </span>
              <input
                type="text"
                className="ba-input text-xs w-full pl-9 py-2.5"
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                placeholder="Escribe para buscar servicios..."
              />
            </div>

            {/* Grid de Servicios */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 overflow-y-auto max-h-[460px] pr-1 scrollbar-thin">
              {filteredServices.map((service) => {
                const quantity = selectedServiceIds.filter((id) => id === service.id).length;
                const isSelected = quantity > 0;
                return (
                  <button
                    key={service.id}
                    type="button"
                    className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border text-left transition-all duration-300 active:scale-[0.96] min-h-[150px] cursor-pointer hover:shadow-xl hover:-translate-y-0.5 ${
                      isSelected
                        ? "border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/5"
                        : "border-[var(--panel-stroke)] bg-[var(--bg-soft)] hover:border-amber-500/40 hover:bg-[var(--panel)]"
                    }`}
                    onClick={() =>
                      setSelectedServiceIds((prev) => [...prev, service.id!])
                    }
                  >
                    {/* Imagen del Servicio */}
                    <div className="absolute inset-0 w-full h-[60%] overflow-hidden bg-slate-950">
                      <img
                        src={service.image}
                        alt={service.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-60 group-hover:opacity-85"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-soft)] via-[var(--bg-soft)]/20 to-transparent" />
                    </div>

                    {/* Quantity Badge */}
                    {quantity > 0 && (
                      <span className="absolute top-3 right-3 z-10 w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-lg shadow-amber-500/20">
                        {quantity}
                      </span>
                    )}

                    {/* Info Area */}
                    <div className="relative z-10 mt-auto p-3 w-full flex flex-col justify-end bg-gradient-to-t from-[var(--bg-soft)] via-[var(--bg-soft)]/95 to-transparent pt-8">
                      <span className="font-semibold text-xs text-[var(--text)] group-hover:text-amber-500 line-clamp-1 leading-tight transition-colors">
                        {service.name}
                      </span>
                      <div className="flex justify-between items-center mt-1">
                        <span className="font-bold text-sm text-amber-500">
                          {money(service.amount)}
                        </span>
                        <span className="text-[9px] text-[var(--muted)] group-hover:text-amber-500 uppercase font-medium tracking-wider transition-colors">
                          Agregar +
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {!filteredServices.length ? (
                <div className="col-span-full text-center py-16 text-xs text-[var(--muted)] font-medium bg-[var(--bg)]/10 rounded-2xl border border-dashed border-[var(--panel-stroke)]">
                  <Scissors className="mx-auto text-[var(--muted)] mb-2 animate-bounce-subtle" size={24} />
                  No se encontraron servicios
                </div>
              ) : null}
            </div>
          </article>

          {/* Checkout Column (Right) */}
          <article className="lg:col-span-5 ba-card p-5 flex flex-col justify-between min-h-[580px]">
            <div>
              <header className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
                    <Receipt size={18} className="text-amber-500" />
                    Caja Rápida POS
                  </h2>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5">Procesa y liquida pagos al instante</p>
                </div>
                <span className="text-[9px] text-amber-500 font-semibold uppercase tracking-wider bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 rounded-full shrink-0">
                  Fuente real
                </span>
              </header>

              {/* El Recibo Vivo */}
              <div className="bg-[var(--bg-soft)] border border-[var(--panel-stroke)] rounded-2xl p-4 shadow-xl mb-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-700" />
                <div className="text-[9px] uppercase tracking-widest font-bold text-amber-500 border-b border-[var(--panel-stroke)] pb-2 mb-3 flex justify-between items-center">
                  <span>Detalle de Consumo</span>
                  <Sparkles size={11} className="text-amber-500" />
                </div>
                
                <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
                  {selectedServicesGrouped.map((item) => (
                    <div key={item.id} className="flex justify-between items-center py-2 border-b border-[var(--panel-stroke)]/40 last:border-b-0">
                      <div className="flex flex-col text-left">
                        <span className="font-semibold text-xs text-[var(--text)] line-clamp-1">{item.name}</span>
                        <span className="text-[10px] text-[var(--muted)] font-medium">
                          {item.quantity} × {money(item.amount ?? 0)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          className="w-5 h-5 border border-[var(--panel-stroke)] rounded-lg flex items-center justify-center font-bold text-xs text-[var(--muted)] hover:text-[var(--text)] hover:border-gray-500 hover:bg-[var(--bg)] transition-all active:scale-90 cursor-pointer"
                          onClick={() => setSelectedServiceIds(prev => {
                            const idx = prev.indexOf(item.id!);
                            if (idx > -1) {
                              const next = [...prev];
                              next.splice(idx, 1);
                              return next;
                            }
                            return prev;
                          })}
                        >
                          <Minus size={10} />
                        </button>
                        <button
                          type="button"
                          className="w-5 h-5 border border-[var(--panel-stroke)] rounded-lg flex items-center justify-center font-bold text-xs text-[var(--muted)] hover:text-[var(--text)] hover:border-gray-500 hover:bg-[var(--bg)] transition-all active:scale-90 cursor-pointer"
                          onClick={() => setSelectedServiceIds(prev => [...prev, item.id!])}
                        >
                          <Plus size={10} />
                        </button>
                        <button
                          type="button"
                          className="w-5 h-5 border border-red-950 bg-red-950/20 text-red-400 hover:bg-red-900/40 hover:text-red-200 rounded-lg flex items-center justify-center transition-all active:scale-90 ml-1 cursor-pointer"
                          onClick={() => setSelectedServiceIds(prev => prev.filter(id => id !== item.id))}
                          aria-label="Eliminar"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!selectedServicesGrouped.length ? (
                    <div className="text-center py-8 text-xs text-[var(--muted)] font-medium border border-dashed border-[var(--panel-stroke)] rounded-xl my-2">
                      Agrega servicios desde el catálogo izquierdo
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 pt-3 border-t border-[var(--panel-stroke)] flex flex-col gap-1.5 text-xs text-[var(--muted)]">
                  <p className="flex justify-between"><span>Subtotal</span><strong className="text-[var(--text)]">{money2(subtotal)}</strong></p>
                  <p className="flex justify-between"><span>Descuento lealtad</span><strong className="text-[var(--text)]">$0</strong></p>
                  <p className="flex justify-between border-t border-dashed border-[var(--panel-stroke)] pt-2 text-sm font-bold text-amber-500">
                    <span>Total cobro</span>
                    <strong className="text-amber-500 font-extrabold">{money2(subtotal)}</strong>
                  </p>
                </div>
              </div>

              {/* Formulario Cliente/Barbero */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">Cliente</span>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User size={13} className="text-[var(--muted)]" />
                    </span>
                    <input
                      className="ba-input text-xs w-full pl-8"
                      value={posClient}
                      onChange={(e) => setPosClient(e.target.value)}
                      placeholder="Cliente mostrador"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">Barbero</span>
                  <select
                    className="ba-input text-xs w-full cursor-pointer"
                    value={posBarber}
                    onChange={(e) => setPosBarber(e.target.value)}
                  >
                    <option value="">Selecciona barbero</option>
                    {barbers.map((barber) => (
                      <option key={barber.id} value={barber.name}>{barber.name}</option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">Método de Pago</span>
                  <select
                    className="ba-input text-xs w-full cursor-pointer"
                    value={posMethod}
                    onChange={(e) => setPosMethod(e.target.value)}
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Digital">Digital (Tarjeta/Transf)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">Monto Recibido</span>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <DollarSign size={13} className="text-[var(--muted)]" />
                    </span>
                    <input
                      className="ba-input text-xs w-full pl-8"
                      type="number"
                      min={0}
                      step="1000"
                      value={posReceived}
                      onChange={(e) => setPosReceived(e.target.value)}
                      placeholder="Ej: 50000"
                    />
                  </div>
                  
                  {posMethod === "Efectivo" && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {[10000, 20000, 50000, 100000].map((bill) => (
                        <button
                          key={bill}
                          type="button"
                          className="flex-1 py-1.5 px-2 text-[10px] border border-amber-500/10 rounded-xl bg-amber-500/5 text-amber-400 hover:text-white hover:bg-amber-500/20 font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
                          onClick={() => setPosReceived(String(bill))}
                        >
                          ${bill / 1000}k
                        </button>
                      ))}
                      <button
                        type="button"
                        className="py-1.5 px-3.5 text-[10px] border border-red-950 bg-red-950/20 text-red-400 hover:bg-red-900/40 hover:text-red-200 rounded-xl font-bold transition-all active:scale-95 cursor-pointer"
                        onClick={() => setPosReceived("")}
                      >
                        Limpiar
                      </button>
                    </div>
                  )}
                </label>
              </div>

              {/* KPIs de Estación */}
              <div className="mt-4 p-3 bg-[var(--bg-soft)] border border-[var(--panel-stroke)] rounded-2xl">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-[var(--bg)] border border-[var(--panel-stroke)]/40 p-2 rounded-xl flex flex-col justify-center">
                    <span className="text-[9px] text-[var(--muted)] font-bold uppercase tracking-wider">Recibido</span>
                    <strong className="text-xs text-[var(--text)] font-semibold">{money2(receivedAmount)}</strong>
                  </div>
                  <div className="bg-emerald-950/10 border border-emerald-900/20 p-2 rounded-xl flex flex-col justify-center">
                    <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider">Vueltas</span>
                    <strong className="text-xs text-emerald-500 font-bold">{money2(changeAmount)}</strong>
                  </div>
                  <div className={`bg-[var(--bg)] border p-2 rounded-xl flex flex-col justify-center transition-all ${
                    pendingAmount > 0 ? "border-amber-500/20 bg-amber-500/5" : "border-[var(--panel-stroke)]/40"
                  }`}>
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${
                      pendingAmount > 0 ? "text-amber-500" : "text-[var(--muted)]"
                    }`}>Faltante</span>
                    <strong className={`text-xs font-semibold ${
                      pendingAmount > 0 ? "text-amber-500 font-bold" : "text-[var(--muted)]"
                    }`}>{money2(pendingAmount)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--panel-stroke)]">
              {chargeError && (
                <div className="text-red-500 text-xs px-2 text-center font-bold mb-3 flex items-center justify-center gap-1">
                  <AlertCircle size={12} />
                  {chargeError}
                </div>
              )}

              {/* Acciones */}
              <div className="flex gap-3">
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-4 py-3 border border-[var(--panel-stroke)] hover:border-gray-500 bg-[var(--bg-soft)] hover:bg-[var(--panel)] text-[var(--text)] rounded-xl text-xs font-bold transition-all active:scale-[0.96] cursor-pointer"
                  onClick={() => setShowCalculator(true)}
                >
                  <Calculator size={14} className="text-amber-500" />
                  Calculadora
                </button>
                
                <button
                  type="button"
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs shadow-lg transition-all active:scale-[0.96] cursor-pointer ${
                    canCharge
                      ? "bg-gradient-to-r from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-black shadow-amber-500/10 hover:shadow-amber-500/20 font-extrabold"
                      : "bg-[var(--bg-soft)] border border-[var(--panel-stroke)] text-[var(--muted)] cursor-not-allowed shadow-none"
                  }`}
                  onClick={handleChargeNow}
                  disabled={!canCharge || charging}
                >
                  {charging ? (
                    <>
                      <RefreshCw size={14} className="animate-spin text-black" />
                      Procesando...
                    </>
                  ) : canCharge ? (
                    <>
                      <Sparkles size={14} className="text-black" />
                      Cobrar Ahora
                    </>
                  ) : (
                    "Falta Pago / Registro"
                  )}
                </button>
              </div>
            </div>
          </article>
        </div>

        {/* Lower Details Area: Cierre General | Cierre por Barbero | Movimientos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Cierre General */}
          <article className="ba-card p-5 flex flex-col gap-4">
            <header className="flex justify-between items-center border-b border-[var(--panel-stroke)] pb-3">
              <h2 className="text-xs uppercase tracking-wider font-extrabold text-[var(--text)] flex items-center gap-2">
                <Receipt size={14} className="text-amber-500" />
                Cierre de Caja del Dia
              </h2>
              <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-bold px-2 py-0.5 rounded-full uppercase">
                Activa
              </span>
            </header>
             <div className="flex flex-col gap-2.5 text-xs text-[var(--muted)]">
               <p className="flex justify-between"><span>Total agendado hoy</span><strong className="text-[var(--text)] font-semibold">{money2(totalAgendadoHoy)}</strong></p>
               <p className="flex justify-between"><span>Servicios cobrados (Cerrados)</span><strong className="text-emerald-500 font-bold">{money2(salesDay)}</strong></p>
               <p className="flex justify-between">
                 <span>Servicios pendientes</span>
                 <strong className="text-rose-500 font-bold">
                   {money2(totalPendienteHoy)}
                 </strong>
               </p>
               <p className="flex justify-between"><span>Descuentos aplicados</span><strong className="text-[var(--text)]">$0</strong></p>
               <p className="flex justify-between"><span>Propinas</span><strong className="text-[var(--text)]">$0</strong></p>
               <p className="flex justify-between border-t border-dashed border-[var(--panel-stroke)] pt-3 text-sm font-bold text-amber-500">
                 <span>Neto cierre (Caja Real)</span>
                 <strong className="text-amber-500 font-extrabold">{money2(salesDay)}</strong>
               </p>
             </div>
            
            <button
              type="button"
              className="mt-3 w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-black font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-[0.97] cursor-pointer flex items-center justify-center gap-1.5"
              onClick={() => {
                setZReportWhatsappPhone("");
                setShowZReport(true);
              }}
            >
              Realizar Cierre de Caja 🔒
            </button>
          </article>

          {/* Cierre por Barbero */}
          <article className="ba-card p-5 flex flex-col gap-3">
            <header className="border-b border-[var(--panel-stroke)] pb-3">
              <h2 className="text-xs uppercase tracking-wider font-extrabold text-[var(--text)] flex items-center gap-2">
                <User size={14} className="text-amber-500" />
                Cierre por Barbero
              </h2>
            </header>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-4 text-[10px] uppercase font-bold text-[var(--muted)] pb-1.5 border-b border-[var(--panel-stroke)]">
                <span className="col-span-2">Barbero</span>
                <span className="text-center">Cortes</span>
                <span className="text-right">Total</span>
              </div>
              <div className="max-h-[170px] overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin">
                {closeRows.map((item) => (
                  <div key={item.barber} className="grid grid-cols-4 items-center text-xs text-[var(--text)] py-1 border-b border-[var(--panel-stroke)]/30 last:border-b-0">
                    <span className="col-span-2 flex items-center gap-1.5 font-semibold">
                      <span className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[8px] font-extrabold flex items-center justify-center shrink-0">
                        {initialsFrom(item.barber)}
                      </span>
                      <span className="truncate">{item.barber}</span>
                    </span>
                    <span className="text-center font-medium">{item.cuts}</span>
                    <strong className="text-right text-amber-500">{money2(item.total)}</strong>
                  </div>
                ))}
                {!closeRows.length ? (
                  <div className="text-center py-6 text-xs text-[var(--muted)] font-medium">
                    Sin cierres por barbero
                  </div>
                ) : null}
              </div>
            </div>
          </article>

          {/* Movimientos Recientes */}
          <article className="ba-card p-5 flex flex-col gap-3">
            <header className="border-b border-[var(--panel-stroke)] pb-3">
              <h2 className="text-xs uppercase tracking-wider font-extrabold text-[var(--text)] flex items-center gap-2">
                <RefreshCw size={14} className="text-amber-500" />
                Movimientos Recientes
              </h2>
            </header>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-4 text-[10px] uppercase font-bold text-[var(--muted)] pb-1.5 border-b border-[var(--panel-stroke)]">
                <span>Cliente</span>
                <span className="col-span-2">Servicio</span>
                <span className="text-right">Monto</span>
              </div>
              <div className="max-h-[170px] overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin">
                {movements.map((item) => (
                  <div key={item.id} className="grid grid-cols-4 items-center text-xs text-[var(--text)] py-1.5 border-b border-[var(--panel-stroke)]/30 last:border-b-0">
                    <span className="truncate font-semibold text-[var(--text)]">{item.client}</span>
                    <span className="col-span-2 truncate text-[var(--muted)] pr-1">{item.service}</span>
                    <strong className="text-right text-amber-500">{money2(item.amount)}</strong>
                  </div>
                ))}
                {!movements.length ? (
                  <div className="text-center py-6 text-xs text-[var(--muted)] font-medium">
                    Sin movimientos registrados
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* CALCULADORA MODAL (APPLE STYLE CON CORTE DORADO) */}
      {showCalculator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-[340px] bg-[var(--bg)] border border-[var(--panel-stroke)] rounded-3xl overflow-hidden shadow-2xl">
            {/* Header */}
            <header className="flex justify-between items-center px-5 py-4 bg-[var(--bg-soft)] border-b border-[var(--panel-stroke)]">
              <div className="flex items-center gap-2">
                <Calculator size={16} className="text-amber-500" />
                <h3 className="text-xs font-bold text-[var(--text)] uppercase tracking-wider">Calculadora POS</h3>
              </div>
              <button
                type="button"
                className="w-6 h-6 rounded-lg bg-[var(--bg)] hover:bg-[var(--bg-soft)] text-[var(--muted)] hover:text-[var(--text)] border border-[var(--panel-stroke)] flex items-center justify-center transition-colors cursor-pointer"
                onClick={() => setShowCalculator(false)}
              >
                <X size={14} />
              </button>
            </header>

            {/* Display */}
            <div className="p-5 bg-[var(--bg)] flex flex-col justify-end items-end text-right min-h-[90px] border-b border-[var(--panel-stroke)]/30">
              <span className="text-xs text-[var(--muted)] font-medium tracking-wide h-5 overflow-x-auto w-full whitespace-nowrap">
                {calcHistory || "\u00A0"}
              </span>
              <strong className="text-3xl font-extrabold text-[var(--text)] tracking-tight break-all overflow-x-auto w-full mt-1">
                {calcDisplay}
              </strong>
            </div>

            {/* Teclado */}
            <div className="p-4 bg-[var(--bg-soft)]/20 grid grid-cols-4 gap-2.5">
              {/* Row 1 */}
              <button
                type="button"
                className="py-3.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 hover:text-red-300 font-bold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer border border-red-900/10"
                onClick={() => handleCalcPress("C")}
              >
                C
              </button>
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)] hover:bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-stroke)]/50 font-bold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("⌫")}
              >
                ⌫
              </button>
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)] hover:bg-[var(--panel)] text-amber-500 border border-[var(--panel-stroke)]/50 font-bold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("/")}
              >
                ÷
              </button>
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)] hover:bg-[var(--panel)] text-amber-500 border border-[var(--panel-stroke)]/50 font-bold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("*")}
              >
                ×
              </button>

              {/* Row 2 */}
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)]/40 hover:bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-stroke)]/30 font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("7")}
              >
                7
              </button>
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)]/40 hover:bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-stroke)]/30 font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("8")}
              >
                8
              </button>
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)]/40 hover:bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-stroke)]/30 font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("9")}
              >
                9
              </button>
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)] hover:bg-[var(--panel)] text-amber-500 border border-[var(--panel-stroke)]/50 font-bold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("-")}
              >
                -
              </button>

              {/* Row 3 */}
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)]/40 hover:bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-stroke)]/30 font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("4")}
              >
                4
              </button>
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)]/40 hover:bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-stroke)]/30 font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("5")}
              >
                5
              </button>
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)]/40 hover:bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-stroke)]/30 font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("6")}
              >
                6
              </button>
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)] hover:bg-[var(--panel)] text-amber-500 border border-[var(--panel-stroke)]/50 font-bold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("+")}
              >
                +
              </button>

              {/* Row 4 */}
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)]/40 hover:bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-stroke)]/30 font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("1")}
              >
                1
              </button>
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)]/40 hover:bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-stroke)]/30 font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("2")}
              >
                2
              </button>
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)]/40 hover:bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-stroke)]/30 font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("3")}
              >
                3
              </button>
              <button
                type="button"
                className="row-span-2 py-8 bg-gradient-to-b from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-black font-extrabold rounded-2xl text-base transition-all active:scale-95 flex items-center justify-center cursor-pointer shadow-lg shadow-amber-500/10"
                onClick={() => handleCalcPress("=")}
              >
                =
              </button>

              {/* Row 5 */}
              <button
                type="button"
                className="col-span-2 py-3.5 bg-[var(--bg-soft)]/40 hover:bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-stroke)]/30 font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer text-center"
                onClick={() => handleCalcPress("0")}
              >
                0
              </button>
              <button
                type="button"
                className="py-3.5 bg-[var(--bg-soft)]/40 hover:bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-stroke)]/30 font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress(".")}
              >
                .
              </button>
            </div>

            {/* Bottom Actions */}
            <footer className="p-4 bg-[var(--bg-soft)] border-t border-[var(--panel-stroke)] flex flex-col gap-2">
              <button
                type="button"
                className="py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 text-amber-500 text-xs font-bold rounded-xl transition-colors active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                onClick={handleApplyCalcToReceived}
              >
                <DollarSign size={14} />
                Usar como Pago Recibido
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* TIRILLA FLOTANTE MODAL (RECIBO DE VENTA) */}
      {showReceipt && receiptDetails && (
        <div className="ba-pos-receipt-modal animate-fade-in" onClick={() => setShowReceipt(false)}>
          {/* Virtual Metal Ejection Slot */}
          <div className="ba-pos-printer-slot" onClick={(e) => e.stopPropagation()} />
          
          <div className="ba-pos-receipt-slip select-text text-slate-900" onClick={(e) => e.stopPropagation()}>
            <header>
              <div className="flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[9px] select-none shrink-0">
                  ✓
                </span>
                <h3>Cobro Exitoso</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowReceipt(false)}
                aria-label="Cerrar"
              >
                <X size={10} />
              </button>
            </header>

            <div className="text-center py-1 flex flex-col gap-0.5">
              <strong className="text-sm font-extrabold uppercase tracking-wider">{merged.biz_name || "Barber Agency"}</strong>
              <p className="ba-pos-receipt-subtitle select-none">{merged.address || "Local Premium"}</p>
              
              <div className="text-[7px] text-slate-500 font-bold uppercase select-none mt-2">
                ================================
              </div>
              <div className="flex justify-between items-center text-[9px] text-slate-600 px-1 font-semibold">
                <span>Fecha: {receiptDetails.date}</span>
                <span>Hora: {receiptDetails.hour}</span>
              </div>
              <div className="text-[7px] text-slate-500 font-bold uppercase select-none">
                ================================
              </div>
            </div>

            <div className="py-1">
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1 select-none">Resumen de Consumo</p>
              <div className="ba-pos-receipt-rows">
                {receiptDetails.services.map((s, idx) => (
                  <p key={idx} className="flex justify-between text-xs my-0.5">
                    <span className="text-slate-700">
                      {s.name} <strong className="text-slate-900 font-bold font-mono">x{s.quantity}</strong>
                    </span>
                    <strong className="text-slate-900 font-mono font-bold">{money(s.totalAmount)}</strong>
                  </p>
                ))}
                
                <p className="is-total flex justify-between text-xs pt-2 mt-2">
                  <span>TOTAL COBRADO</span>
                  <strong className="font-extrabold font-mono">{money(receiptDetails.total)}</strong>
                </p>
              </div>
            </div>

            {/* Metadatos transaccionales */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] text-slate-600 flex flex-col gap-1.5 select-none">
              <div className="flex justify-between">
                <span>Cliente:</span>
                <strong className="text-slate-800 font-bold">{receiptDetails.client}</strong>
              </div>
              <div className="flex justify-between">
                <span>Atendido por:</span>
                <strong className="text-slate-800 font-bold">{receiptDetails.barber}</strong>
              </div>
              <div className="flex justify-between">
                <span>Método de Pago:</span>
                <strong className="text-slate-800 font-bold">{receiptDetails.method}</strong>
              </div>
              {receiptDetails.method === "Efectivo" && (
                <>
                  <div className="flex justify-between border-t border-slate-200/60 pt-1.5 mt-0.5">
                    <span>Efectivo Recibido:</span>
                    <strong className="text-slate-800 font-bold font-mono">{money(receiptDetails.received)}</strong>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Vueltas (Cambio):</span>
                    <strong className="font-extrabold font-mono">{money(receiptDetails.change)}</strong>
                  </div>
                </>
              )}
            </div>

            {/* WhatsApp invoice share drawer (Interactive) */}
            <div className="ba-pos-whatsapp-box mt-3.5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col gap-2 shrink-0 select-none">
              <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                <span>💬 Compartir Ticket Digital</span>
              </div>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-[10px] font-bold text-emerald-600">
                    +57
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    className="w-full bg-white border border-emerald-300 text-emerald-950 rounded-lg pl-9 pr-2 py-1.5 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="WhatsApp Celular"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const servicesText = receiptDetails.services
                      .map(s => `• *${s.name}* x${s.quantity} (_$${Math.round(s.totalAmount).toLocaleString()}_)`)
                      .join("\n");
                    const totalText = `*$${Math.round(receiptDetails.total).toLocaleString()}*`;
                    const changeText = receiptDetails.method === "Efectivo" 
                      ? `\n💵 *Recibido:* $${Math.round(receiptDetails.received).toLocaleString()}\n💵 *Vueltas:* $${Math.round(receiptDetails.change).toLocaleString()}`
                      : "";
                    
                    const textMessage = `💈 *BARBERÍA ${merged.biz_name.toUpperCase()}* 💈\n================================\n🧾 *COMPROBANTE DE COMPRA POS*\n--------------------------------\n📅 *Fecha:* ${receiptDetails.date}\n⏰ *Hora:* ${receiptDetails.hour}\n👤 *Cliente:* ${receiptDetails.client}\n✂️ *Atendido por:* ${receiptDetails.barber}\n💳 *Método de Pago:* ${receiptDetails.method}\n================================\n🛍️ *SERVICIOS:*\n${servicesText}\n--------------------------------\n💰 *TOTAL PAGADO:* ${totalText}${changeText}\n================================\n¡Gracias por tu visita! Te esperamos pronto. ✂️🔥`;
                    
                    const cleanPhone = whatsappPhone.replace(/\D/g, "");
                    let targetPhone = cleanPhone;
                    if (cleanPhone.length === 10) {
                      targetPhone = "57" + cleanPhone;
                    }
                    
                    const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(textMessage)}`;
                    window.open(waUrl, "_blank");
                  }}
                  disabled={whatsappPhone.length < 10}
                  className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all active:scale-95 flex items-center justify-center shrink-0 cursor-pointer ${
                    whatsappPhone.length === 10
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/10"
                      : "bg-emerald-200 text-emerald-400 cursor-not-allowed"
                  }`}
                >
                  Enviar
                </button>
              </div>
            </div>

            {/* Simulated Printed Barcode */}
            <div className="flex flex-col items-center justify-center my-3.5 gap-1 shrink-0 select-none">
              <svg className="w-48 h-6 text-slate-800" viewBox="0 0 100 20" preserveAspectRatio="none">
                <rect x="2" width="2" height="20" fill="currentColor"/>
                <rect x="6" width="1" height="20" fill="currentColor"/>
                <rect x="8" width="3" height="20" fill="currentColor"/>
                <rect x="13" width="1" height="20" fill="currentColor"/>
                <rect x="15" width="2" height="20" fill="currentColor"/>
                <rect x="18" width="4" height="20" fill="currentColor"/>
                <rect x="23" width="1" height="20" fill="currentColor"/>
                <rect x="25" width="2" height="20" fill="currentColor"/>
                <rect x="28" width="3" height="20" fill="currentColor"/>
                <rect x="33" width="1" height="20" fill="currentColor"/>
                <rect x="35" width="2" height="20" fill="currentColor"/>
                <rect x="38" width="4" height="20" fill="currentColor"/>
                <rect x="43" width="1" height="20" fill="currentColor"/>
                <rect x="45" width="2" height="20" fill="currentColor"/>
                <rect x="48" width="3" height="20" fill="currentColor"/>
                <rect x="53" width="1" height="20" fill="currentColor"/>
                <rect x="55" width="2" height="20" fill="currentColor"/>
                <rect x="58" width="4" height="20" fill="currentColor"/>
                <rect x="63" width="1" height="20" fill="currentColor"/>
                <rect x="65" width="2" height="20" fill="currentColor"/>
                <rect x="68" width="3" height="20" fill="currentColor"/>
                <rect x="73" width="1" height="20" fill="currentColor"/>
                <rect x="75" width="2" height="20" fill="currentColor"/>
                <rect x="78" width="4" height="20" fill="currentColor"/>
                <rect x="83" width="1" height="20" fill="currentColor"/>
                <rect x="86" width="2" height="20" fill="currentColor"/>
                <rect x="89" width="3" height="20" fill="currentColor"/>
                <rect x="94" width="2" height="20" fill="currentColor"/>
              </svg>
              <span className="text-[7px] font-mono tracking-[4px] text-slate-500 uppercase">
                0185{receiptDetails.date.replace(/\//g, "")}
              </span>
            </div>

            <div className="text-center text-[9px] text-slate-500 font-bold select-none leading-none">
              ¡Gracias por tu preferencia!
            </div>
            <div className="text-center text-[7px] text-slate-400 font-bold select-none leading-none mt-1">
              Software BarberAgency POS v1.0
            </div>

            <footer>
              <button
                type="button"
                className="px-3.5 py-1.5 border border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 text-xs text-slate-700 rounded-xl font-bold transition-all active:scale-95 cursor-pointer select-none"
                onClick={() => setShowReceipt(false)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-black text-xs font-extrabold rounded-xl transition-all active:scale-95 shadow-sm shadow-amber-500/10 cursor-pointer flex items-center gap-1 select-none"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.print();
                  }
                }}
              >
                <Receipt size={12} />
                Imprimir
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* REPORT Z MODAL (TIRILLA FÍSICA DE CIERRE DE CAJA) */}
      {showZReport && (
        <div className="ba-pos-receipt-modal animate-fade-in" onClick={() => setShowZReport(false)}>
          {/* Virtual Metal Ejection Slot */}
          <div className="ba-pos-printer-slot" onClick={(e) => e.stopPropagation()} />
          
          <div className="ba-pos-receipt-slip select-text text-slate-900" onClick={(e) => e.stopPropagation()}>
            <header>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-[9px] select-none shrink-0">
                  🔒
                </span>
                <h3 className="text-red-700 font-extrabold">Reporte Z de Caja</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowZReport(false)}
                aria-label="Cerrar"
              >
                <X size={10} />
              </button>
            </header>

            <div className="text-center py-1 flex flex-col gap-0.5">
              <strong className="text-sm font-extrabold uppercase tracking-wider">{merged.biz_name || "Barber Agency"}</strong>
              <p className="ba-pos-receipt-subtitle select-none">{merged.address || "Local Premium"}</p>
              <strong className="text-[10px] text-red-600 font-bold uppercase tracking-wider mt-1 select-none">*** REPORTE DE CIERRE DIARIO ***</strong>
              
              <div className="text-[7px] text-slate-500 font-bold uppercase select-none mt-2">
                ================================
              </div>
              <div className="flex justify-between items-center text-[9px] text-slate-600 px-1 font-semibold font-mono">
                <span>Fecha: {new Date().toLocaleDateString("es-CO")}</span>
                <span>Hora: {new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="text-[7px] text-slate-500 font-bold uppercase select-none">
                ================================
              </div>
            </div>

            <div className="py-1">
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1 select-none">Resumen Financiero</p>
              <div className="ba-pos-receipt-rows">
                <p className="flex justify-between text-xs my-0.5">
                  <span className="text-slate-700">Servicios Cobrados</span>
                  <strong className="text-slate-900 font-mono font-bold">{money(salesDay)}</strong>
                </p>
                <p className="flex justify-between text-xs my-0.5">
                  <span className="text-slate-700">Efectivo en Caja</span>
                  <strong className="text-slate-900 font-mono font-bold">{money(cashDay)}</strong>
                </p>
                <p className="flex justify-between text-xs my-0.5">
                  <span className="text-slate-700">Pagos Digitales</span>
                  <strong className="text-slate-900 font-mono font-bold">{money(salesDay - cashDay)}</strong>
                </p>
                <p className="flex justify-between text-xs my-0.5">
                  <span className="text-slate-700">Cant. Servicios Cobrados</span>
                  <strong className="text-slate-900 font-mono font-bold">{paidMovements.length}</strong>
                </p>
                <p className="flex justify-between text-xs my-0.5">
                  <span className="text-slate-700">Cant. Servicios Pendientes</span>
                  <strong className="text-slate-900 font-mono font-bold">
                    {movements.filter(m => m.status === "Pendiente").length}
                  </strong>
                </p>
                <p className="flex justify-between text-xs my-0.5">
                  <span className="text-slate-700">Monto Pendiente de Cobro</span>
                  <strong className="text-slate-950 font-mono font-bold">
                    {money(movements.filter(m => m.status === "Pendiente").reduce((acc, m) => acc + m.amount, 0))}
                  </strong>
                </p>
                
                <p className="is-total flex justify-between text-xs pt-2 mt-2 border-t border-double border-slate-400">
                  <span>NETO CAJA CIERRE</span>
                  <strong className="font-extrabold font-mono text-slate-950">{money(salesDay)}</strong>
                </p>
              </div>
            </div>

            <div className="py-2 border-t border-dashed border-slate-300">
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1 select-none">Ventas por Barbero</p>
              <div className="flex flex-col gap-1 px-1">
                {closeRows.map((item) => (
                  <div key={item.barber} className="flex justify-between items-center text-xs">
                    <span className="text-slate-700 font-semibold truncate">{item.barber}</span>
                    <span className="text-slate-500 font-mono text-[10px] ml-auto mr-3">{item.cuts} serv</span>
                    <strong className="text-slate-900 font-mono font-bold">{money(item.total)}</strong>
                  </div>
                ))}
                {!closeRows.length ? (
                  <div className="text-center py-2 text-[10px] text-slate-500 italic select-none">
                    Sin ventas registradas
                  </div>
                ) : null}
              </div>
            </div>

            {/* WhatsApp share for Z-Report */}
            <div className="ba-pos-whatsapp-box mt-3.5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col gap-2 shrink-0 select-none">
              <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                <span>💬 Enviar Reporte Z a Supervisor</span>
              </div>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-[10px] font-bold text-emerald-600">
                    +57
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    className="w-full bg-white border border-emerald-300 text-emerald-950 rounded-lg pl-9 pr-2 py-1.5 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="WhatsApp Celular"
                    value={zReportWhatsappPhone}
                    onChange={(e) => setZReportWhatsappPhone(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const barbersText = closeRows
                      .map(r => `• *${r.barber}*: ${r.cuts} cortes | $${Math.round(r.total).toLocaleString()}`)
                      .join("\n");
                    
                    // Consumir el estado unificado posSummary para evitar discrepancias
                    const textMessage = `💈 *BARBERÍA ${merged.biz_name.toUpperCase()}* 💈\n================================\n🔒 *REPORTE DE CIERRE DE CAJA (Z)* 🔒\n--------------------------------\n📅 *Fecha Cierre:* ${new Date().toLocaleDateString("es-CO")}\n⏰ *Hora Cierre:* ${new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}\n================================\n💰 *VENTAS TOTALES:* $${Math.round(salesDay).toLocaleString()}\n💵 *Efectivo en Caja:* $${Math.round(cashDay).toLocaleString()}\n💳 *Pago Digital:* $${Math.round(salesDay - cashDay).toLocaleString()}\n--------------------------------\n🛍️ *Servicios Realizados:* ${paidMovements.length}\n⏳ *Servicios Pendientes:* ${pendingAppointments.length} ($${Math.round(totalPendienteHoy).toLocaleString()})\n================================\n💈 *VENTAS POR BARBERO:*\n${barbersText}\n================================\n¡Reporte Z de Caja generado con éxito! 🔥🔒`;
                    
                    const cleanPhone = zReportWhatsappPhone.replace(/\D/g, "");
                    let targetPhone = cleanPhone;
                    if (cleanPhone.length === 10) {
                      targetPhone = "57" + cleanPhone;
                    }
                    
                    const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(textMessage)}`;
                    window.open(waUrl, "_blank");
                  }}
                  disabled={zReportWhatsappPhone.length < 10}
                  className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all active:scale-95 flex items-center justify-center shrink-0 cursor-pointer ${
                    zReportWhatsappPhone.length === 10
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/10"
                      : "bg-emerald-200 text-emerald-400 cursor-not-allowed"
                  }`}
                >
                  Enviar
                </button>
              </div>
            </div>

            {/* Simulated Printed Barcode */}
            <div className="flex flex-col items-center justify-center my-3.5 gap-1 shrink-0 select-none">
              <svg className="w-48 h-6 text-slate-800" viewBox="0 0 100 20" preserveAspectRatio="none">
                <rect x="2" width="2" height="20" fill="currentColor"/>
                <rect x="6" width="1" height="20" fill="currentColor"/>
                <rect x="8" width="3" height="20" fill="currentColor"/>
                <rect x="13" width="1" height="20" fill="currentColor"/>
                <rect x="15" width="2" height="20" fill="currentColor"/>
                <rect x="18" width="4" height="20" fill="currentColor"/>
                <rect x="23" width="1" height="20" fill="currentColor"/>
                <rect x="25" width="2" height="20" fill="currentColor"/>
                <rect x="28" width="3" height="20" fill="currentColor"/>
                <rect x="33" width="1" height="20" fill="currentColor"/>
                <rect x="35" width="2" height="20" fill="currentColor"/>
                <rect x="38" width="4" height="20" fill="currentColor"/>
                <rect x="43" width="1" height="20" fill="currentColor"/>
                <rect x="45" width="2" height="20" fill="currentColor"/>
                <rect x="48" width="3" height="20" fill="currentColor"/>
                <rect x="53" width="1" height="20" fill="currentColor"/>
                <rect x="55" width="2" height="20" fill="currentColor"/>
                <rect x="58" width="4" height="20" fill="currentColor"/>
                <rect x="63" width="1" height="20" fill="currentColor"/>
                <rect x="65" width="2" height="20" fill="currentColor"/>
                <rect x="68" width="3" height="20" fill="currentColor"/>
                <rect x="73" width="1" height="20" fill="currentColor"/>
                <rect x="75" width="2" height="20" fill="currentColor"/>
                <rect x="78" width="4" height="20" fill="currentColor"/>
                <rect x="83" width="1" height="20" fill="currentColor"/>
                <rect x="86" width="2" height="20" fill="currentColor"/>
                <rect x="89" width="3" height="20" fill="currentColor"/>
                <rect x="94" width="2" height="20" fill="currentColor"/>
              </svg>
              <span className="text-[7px] font-mono tracking-[4px] text-slate-500 uppercase">
                REPORT-Z-{new Date().toLocaleDateString("es-CO").replace(/\//g, "")}
              </span>
            </div>

            <div className="text-center text-[9px] text-slate-500 font-bold select-none leading-none">
              *** FINAL DE REPORTE Z ***
            </div>
            <div className="text-center text-[7px] text-slate-400 font-bold select-none leading-none mt-1">
              Software BarberAgency POS v1.0
            </div>

            <footer>
              <button
                type="button"
                className="px-3.5 py-1.5 border border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 text-xs text-slate-700 rounded-xl font-bold transition-all active:scale-95 cursor-pointer select-none"
                onClick={() => setShowZReport(false)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="px-3.5 py-1.5 bg-gradient-to-r from-red-500 to-red-700 hover:from-red-400 hover:to-red-600 text-white text-xs font-extrabold rounded-xl transition-all active:scale-95 shadow-sm shadow-red-500/10 cursor-pointer flex items-center gap-1 select-none"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.print();
                  }
                }}
              >
                <Receipt size={12} />
                Imprimir Reporte Z
              </button>
            </footer>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
