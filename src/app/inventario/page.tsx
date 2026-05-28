"use client";

import { useMemo, useState } from "react";
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
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw || "-";
  return `${match[3]}/${match[2]}/${match[1]}`;
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
  const status = text(item.estado ?? item.status).toLowerCase();
  return {
    id: text(item.id) || `cita-${index + 1}`,
    client: text(item.cliente_nombre ?? item.client ?? item.nombre_cliente) || "Cliente",
    service: text(item.servicio_nombre ?? item.service ?? item.nombre_servicio) || "Servicio",
    method: text(item.metodo ?? item.method) || "Pendiente",
    amount: num(item.total),
    status: status.includes("pend") ? "Pendiente" : "Aceptada",
    date: formatDate(item.fecha ?? item.date),
    hour: formatHour(item.hora_inicio ?? item.hora ?? item.hour),
    barber: text(item.barbero_nombre ?? item.barber ?? item.nombre_barbero) || "Sin barbero"
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

  const sourceMovements = useMemo(
    () => merged.appointments.map(mapAppointment),
    [merged.appointments]
  );

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

  const paidMovements = movements.filter((item) => item.status !== "Pendiente");
  const salesDay = paidMovements.reduce((acc, item) => acc + item.amount, 0);
  const cashDay = paidMovements
    .filter((item) => item.method.toLowerCase() === "efectivo")
    .reduce((acc, item) => acc + item.amount, 0);
  const digitalPayments = paidMovements.filter((item) => item.method.toLowerCase() !== "efectivo").length;

  const closeRows = useMemo(() => {
    const grouped = new Map<string, { cuts: number; total: number; pending: number }>();
    for (const item of movements) {
      const current = grouped.get(item.barber) ?? { cuts: 0, total: 0, pending: 0 };
      current.cuts += 1;
      if (item.status === "Pendiente") current.pending += item.amount;
      else current.total += item.amount;
      grouped.set(item.barber, current);
    }
    return Array.from(grouped.entries()).map(([barber, row]) => ({
      barber,
      cuts: row.cuts,
      total: row.total,
      pending: row.pending,
      ticketAvg: row.cuts ? row.total / row.cuts : 0
    }));
  }, [movements]);

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
        }))
      };

      const res = await savePosSale(payload);
      if (!res.ok) {
        throw new Error(res.message || "Error al procesar el cobro en el servidor.");
      }

      // Limpiar campos de la estación de cobro tras éxito
      setSelectedServiceIds([]);
      setPosReceived("");
      setPosClient("");
      setPosBarber("");

      // Forzar rehidratación desde el servidor de forma inmediata
      await refresh();
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
      <section className="ba-pos-layout p-4 max-w-7xl mx-auto flex flex-col gap-6">
        
        {/* KPI Panel */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <article className="bg-gray-950/60 border border-gray-800/80 rounded-2xl p-5 shadow-lg backdrop-blur-sm relative overflow-hidden transition-all hover:border-amber-500/30">
            <header className="flex justify-between items-center text-gray-400 text-xs font-semibold mb-2">
              <span>VENTAS DEL DÍA</span>
              <DollarSign size={14} className="text-amber-500" />
            </header>
            <strong className="text-2xl font-bold text-white tracking-tight">{money2(salesDay)}</strong>
            <div className="text-[10px] text-gray-500 mt-1">{paidMovements.length} servicios cobrados</div>
          </article>

          <article className="bg-gray-950/60 border border-gray-800/80 rounded-2xl p-5 shadow-lg backdrop-blur-sm relative overflow-hidden transition-all hover:border-amber-500/30">
            <header className="flex justify-between items-center text-gray-400 text-xs font-semibold mb-2">
              <span>TICKETS CERRADOS</span>
              <Receipt size={14} className="text-amber-500" />
            </header>
            <strong className="text-2xl font-bold text-white tracking-tight">{paidMovements.length}</strong>
            <div className="text-[10px] text-gray-500 mt-1">
              {movements.filter((item) => item.status === "Pendiente").length} pendientes por cobrar
            </div>
          </article>

          <article className="bg-gray-950/60 border border-gray-800/80 rounded-2xl p-5 shadow-lg backdrop-blur-sm relative overflow-hidden transition-all hover:border-amber-500/30">
            <header className="flex justify-between items-center text-gray-400 text-xs font-semibold mb-2">
              <span>PAGO DIGITAL</span>
              <CreditCard size={14} className="text-amber-500" />
            </header>
            <strong className="text-2xl font-bold text-white tracking-tight">
              {paidMovements.length ? `${Math.round((digitalPayments / paidMovements.length) * 100)}%` : "0%"}
            </strong>
            <div className="text-[10px] text-gray-500 mt-1">Tarjeta o Transferencia</div>
          </article>

          <article className="bg-gray-950/60 border border-gray-800/80 rounded-2xl p-5 shadow-lg backdrop-blur-sm relative overflow-hidden transition-all hover:border-amber-500/30">
            <header className="flex justify-between items-center text-gray-400 text-xs font-semibold mb-2">
              <span>EFECTIVO EN CAJA</span>
              <Wallet size={14} className="text-amber-500" />
            </header>
            <strong className="text-2xl font-bold text-white tracking-tight">{money2(cashDay)}</strong>
            <div className="text-[10px] text-gray-500 mt-1">Caja física de hoy</div>
          </article>
        </div>

        {/* Main Work Area: Catalog Left | Checkout Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Catalog Column (Left) */}
          <article className="lg:col-span-7 bg-gray-950/40 border border-gray-800/60 rounded-3xl p-5 shadow-xl backdrop-blur-md flex flex-col gap-4 min-h-[580px]">
            <header className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Scissors size={18} className="text-amber-500" />
                  Catálogo de Servicios
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Selecciona servicios para agregarlos al ticket</p>
              </div>
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full shrink-0">
                {filteredServices.length} DISPONIBLES
              </span>
            </header>

            {/* Buscador */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={14} className="text-gray-500" />
              </span>
              <input
                type="text"
                className="w-full pl-9 pr-4 py-2.5 bg-gray-900/50 border border-gray-800 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/40 transition-all"
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
                        ? "border-amber-500 bg-amber-950/20 shadow-lg shadow-amber-500/5"
                        : "border-gray-800 bg-gray-950/40 hover:border-gray-700 hover:bg-gray-900/40"
                    }`}
                    onClick={() =>
                      setSelectedServiceIds((prev) => [...prev, service.id!])
                    }
                  >
                    {/* Imagen del Servicio */}
                    <div className="absolute inset-0 w-full h-[60%] overflow-hidden bg-gray-900">
                      <img
                        src={service.image}
                        alt={service.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-60 group-hover:opacity-85"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/20 to-transparent" />
                    </div>

                    {/* Quantity Badge */}
                    {quantity > 0 && (
                      <span className="absolute top-3 right-3 z-10 w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-lg shadow-amber-500/20">
                        {quantity}
                      </span>
                    )}

                    {/* Info Area */}
                    <div className="relative z-10 mt-auto p-3 w-full flex flex-col justify-end bg-gradient-to-t from-gray-950 via-gray-950/90 to-transparent pt-8">
                      <span className="font-semibold text-xs text-gray-200 group-hover:text-amber-300 line-clamp-1 leading-tight transition-colors">
                        {service.name}
                      </span>
                      <div className="flex justify-between items-center mt-1">
                        <span className="font-bold text-sm text-amber-500">
                          {money(service.amount)}
                        </span>
                        <span className="text-[9px] text-gray-500 group-hover:text-gray-300 uppercase font-medium tracking-wider transition-colors">
                          Agregar +
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {!filteredServices.length ? (
                <div className="col-span-full text-center py-16 text-xs text-gray-500 font-medium bg-gray-950/10 rounded-2xl border border-dashed border-gray-800/80">
                  <Scissors className="mx-auto text-gray-600 mb-2 animate-bounce-subtle" size={24} />
                  No se encontraron servicios
                </div>
              ) : null}
            </div>
          </article>

          {/* Checkout Column (Right) */}
          <article className="lg:col-span-5 bg-gray-950/40 border border-gray-800/60 rounded-3xl p-5 shadow-xl backdrop-blur-md flex flex-col justify-between min-h-[580px]">
            <div>
              <header className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Receipt size={18} className="text-amber-500" />
                    Caja Rápida POS
                  </h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">Procesa y liquida pagos al instante</p>
                </div>
                <span className="text-[9px] text-amber-500/80 font-semibold uppercase tracking-wider bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 rounded-full shrink-0">
                  Fuente real
                </span>
              </header>

              {/* El Recibo Vivo */}
              <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 shadow-xl mb-4 bg-gradient-to-b from-gray-950 to-gray-900/80 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-700" />
                <div className="text-[9px] uppercase tracking-widest font-bold text-amber-500 border-b border-gray-800/80 pb-2 mb-3 flex justify-between items-center">
                  <span>Detalle de Consumo</span>
                  <Sparkles size={11} className="text-amber-500" />
                </div>
                
                <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
                  {selectedServicesGrouped.map((item) => (
                    <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-800/40 last:border-b-0">
                      <div className="flex flex-col text-left">
                        <span className="font-semibold text-xs text-gray-200 line-clamp-1">{item.name}</span>
                        <span className="text-[10px] text-gray-500 font-medium">
                          {item.quantity} × {money(item.amount ?? 0)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          className="w-5 h-5 border border-gray-800 rounded-lg flex items-center justify-center font-bold text-xs text-gray-400 hover:text-white hover:border-gray-600 hover:bg-gray-800 transition-all active:scale-90 cursor-pointer"
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
                          className="w-5 h-5 border border-gray-800 rounded-lg flex items-center justify-center font-bold text-xs text-gray-400 hover:text-white hover:border-gray-600 hover:bg-gray-800 transition-all active:scale-90 cursor-pointer"
                          onClick={() => setSelectedServiceIds(prev => [...prev, item.id!])}
                        >
                          <Plus size={10} />
                        </button>
                        <button
                          type="button"
                          className="w-5 h-5 border border-red-950 bg-red-950/20 text-red-400 hover:bg-red-900/45 hover:text-red-200 rounded-lg flex items-center justify-center transition-all active:scale-90 ml-1 cursor-pointer"
                          onClick={() => setSelectedServiceIds(prev => prev.filter(id => id !== item.id))}
                          aria-label="Eliminar"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!selectedServicesGrouped.length ? (
                    <div className="text-center py-8 text-xs text-gray-500 font-medium border border-dashed border-gray-800/60 rounded-xl my-2">
                      Agrega servicios desde el catálogo izquierdo
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 pt-3 border-t border-gray-800/80 flex flex-col gap-1.5 text-xs text-gray-400">
                  <p className="flex justify-between"><span>Subtotal</span><strong className="text-gray-200">{money2(subtotal)}</strong></p>
                  <p className="flex justify-between"><span>Descuento lealtad</span><strong className="text-gray-200">$0</strong></p>
                  <p className="flex justify-between border-t border-dashed border-gray-800 pt-2 text-sm font-bold text-amber-500">
                    <span>Total cobro</span>
                    <strong className="text-amber-500 font-extrabold">{money2(subtotal)}</strong>
                  </p>
                </div>
              </div>

              {/* Formulario Cliente/Barbero */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Cliente</span>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User size={13} className="text-gray-500" />
                    </span>
                    <input
                      className="w-full pl-8 pr-3 py-2 bg-gray-900/60 border border-gray-800 rounded-xl text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
                      value={posClient}
                      onChange={(e) => setPosClient(e.target.value)}
                      placeholder="Cliente mostrador"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Barbero</span>
                  <select
                    className="w-full px-3 py-2 bg-gray-900/60 border border-gray-800 rounded-xl text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
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
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Método de Pago</span>
                  <select
                    className="w-full px-3 py-2 bg-gray-900/60 border border-gray-800 rounded-xl text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
                    value={posMethod}
                    onChange={(e) => setPosMethod(e.target.value)}
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Digital">Digital (Tarjeta/Transf)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Monto Recibido</span>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <DollarSign size={13} className="text-gray-500" />
                    </span>
                    <input
                      className="w-full pl-8 pr-3 py-2 bg-gray-900/60 border border-gray-800 rounded-xl text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
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
              <div className="mt-4 p-3 bg-gray-900/30 border border-gray-800/80 rounded-2xl">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-950/60 border border-gray-800/40 p-2 rounded-xl flex flex-col justify-center">
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Recibido</span>
                    <strong className="text-xs text-gray-200 font-semibold">{money2(receivedAmount)}</strong>
                  </div>
                  <div className="bg-emerald-950/20 border border-emerald-900/30 p-2 rounded-xl flex flex-col justify-center">
                    <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider">Vueltas</span>
                    <strong className="text-xs text-emerald-400 font-bold">{money2(changeAmount)}</strong>
                  </div>
                  <div className={`bg-gray-950/60 border p-2 rounded-xl flex flex-col justify-center transition-all ${
                    pendingAmount > 0 ? "border-amber-500/20 bg-amber-500/5" : "border-gray-800/40"
                  }`}>
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${
                      pendingAmount > 0 ? "text-amber-500" : "text-gray-500"
                    }`}>Faltante</span>
                    <strong className={`text-xs font-semibold ${
                      pendingAmount > 0 ? "text-amber-500 font-bold" : "text-gray-400"
                    }`}>{money2(pendingAmount)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-800/60">
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
                  className="flex items-center gap-1.5 px-4 py-3 border border-gray-800 hover:border-gray-700 bg-gray-900/60 hover:bg-gray-900 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition-all active:scale-[0.96] cursor-pointer"
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
                      : "bg-gray-900 border border-gray-800 text-gray-600 cursor-not-allowed shadow-none"
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
          <article className="bg-gray-950/40 border border-gray-800/60 rounded-3xl p-5 shadow-xl backdrop-blur-md flex flex-col gap-4">
            <header className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h2 className="text-xs uppercase tracking-wider font-extrabold text-white flex items-center gap-2">
                <Receipt size={14} className="text-amber-500" />
                Cierre de Caja del Dia
              </h2>
              <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full uppercase">
                Activa
              </span>
            </header>
            <div className="flex flex-col gap-2.5 text-xs text-gray-400">
              <p className="flex justify-between"><span>Servicios cobrados</span><strong className="text-gray-200">{money2(salesDay)}</strong></p>
              <p className="flex justify-between">
                <span>Servicios pendientes</span>
                <strong className="text-gray-200">
                  {money2(movements.filter((item) => item.status === "Pendiente").reduce((acc, item) => acc + item.amount, 0))}
                </strong>
              </p>
              <p className="flex justify-between"><span>Descuentos aplicados</span><strong className="text-gray-200">$0</strong></p>
              <p className="flex justify-between"><span>Propinas</span><strong className="text-gray-200">$0</strong></p>
              <p className="flex justify-between border-t border-dashed border-gray-800 pt-3 text-sm font-bold text-amber-500">
                <span>Neto cierre</span>
                <strong className="text-amber-500 font-extrabold">{money2(salesDay)}</strong>
              </p>
            </div>
          </article>

          {/* Cierre por Barbero */}
          <article className="bg-gray-950/40 border border-gray-800/60 rounded-3xl p-5 shadow-xl backdrop-blur-md flex flex-col gap-3">
            <header className="border-b border-gray-800 pb-3">
              <h2 className="text-xs uppercase tracking-wider font-extrabold text-white flex items-center gap-2">
                <User size={14} className="text-amber-500" />
                Cierre por Barbero
              </h2>
            </header>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-4 text-[10px] uppercase font-bold text-gray-500 pb-1.5 border-b border-gray-800/60">
                <span className="col-span-2">Barbero</span>
                <span className="text-center">Cortes</span>
                <span className="text-right">Total</span>
              </div>
              <div className="max-h-[170px] overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin">
                {closeRows.map((item) => (
                  <div key={item.barber} className="grid grid-cols-4 items-center text-xs text-gray-300 py-1 border-b border-gray-800/30 last:border-b-0">
                    <span className="col-span-2 flex items-center gap-1.5 font-semibold">
                      <span className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[8px] font-extrabold flex items-center justify-center shrink-0">
                        {initialsFrom(item.barber)}
                      </span>
                      <span className="truncate">{item.barber}</span>
                    </span>
                    <span className="text-center font-medium">{item.cuts}</span>
                    <strong className="text-right text-amber-500/90">{money2(item.total)}</strong>
                  </div>
                ))}
                {!closeRows.length ? (
                  <div className="text-center py-6 text-xs text-gray-600 font-medium">
                    Sin cierres por barbero
                  </div>
                ) : null}
              </div>
            </div>
          </article>

          {/* Movimientos Recientes */}
          <article className="bg-gray-950/40 border border-gray-800/60 rounded-3xl p-5 shadow-xl backdrop-blur-md flex flex-col gap-3">
            <header className="border-b border-gray-800 pb-3">
              <h2 className="text-xs uppercase tracking-wider font-extrabold text-white flex items-center gap-2">
                <RefreshCw size={14} className="text-amber-500" />
                Movimientos Recientes
              </h2>
            </header>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-4 text-[10px] uppercase font-bold text-gray-500 pb-1.5 border-b border-gray-800/60">
                <span>Cliente</span>
                <span className="col-span-2">Servicio</span>
                <span className="text-right">Monto</span>
              </div>
              <div className="max-h-[170px] overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin">
                {movements.map((item) => (
                  <div key={item.id} className="grid grid-cols-4 items-center text-xs text-gray-300 py-1.5 border-b border-gray-800/30 last:border-b-0">
                    <span className="truncate font-semibold text-gray-300">{item.client}</span>
                    <span className="col-span-2 truncate text-gray-400 pr-1">{item.service}</span>
                    <strong className="text-right text-amber-500/90">{money2(item.amount)}</strong>
                  </div>
                ))}
                {!movements.length ? (
                  <div className="text-center py-6 text-xs text-gray-600 font-medium">
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
          <div className="relative w-full max-w-[340px] bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl shadow-black/50">
            {/* Header */}
            <header className="flex justify-between items-center px-5 py-4 bg-slate-900/80 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <Calculator size={16} className="text-amber-500" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Calculadora POS</h3>
              </div>
              <button
                type="button"
                className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                onClick={() => setShowCalculator(false)}
              >
                <X size={14} />
              </button>
            </header>

            {/* Display */}
            <div className="p-5 bg-slate-950 flex flex-col justify-end items-end text-right min-h-[90px] border-b border-slate-900">
              <span className="text-xs text-gray-500 font-medium tracking-wide h-5 overflow-x-auto w-full whitespace-nowrap">
                {calcHistory || "\u00A0"}
              </span>
              <strong className="text-3xl font-extrabold text-white tracking-tight break-all overflow-x-auto w-full mt-1">
                {calcDisplay}
              </strong>
            </div>

            {/* Teclado */}
            <div className="p-4 bg-slate-900/40 grid grid-cols-4 gap-2.5">
              {/* Row 1 */}
              <button
                type="button"
                className="py-3.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 hover:text-red-300 font-bold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("C")}
              >
                C
              </button>
              <button
                type="button"
                className="py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("⌫")}
              >
                ⌫
              </button>
              <button
                type="button"
                className="py-3.5 bg-slate-800 hover:bg-slate-700 text-amber-500 font-bold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("/")}
              >
                ÷
              </button>
              <button
                type="button"
                className="py-3.5 bg-slate-800 hover:bg-slate-700 text-amber-500 font-bold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("*")}
              >
                ×
              </button>

              {/* Row 2 */}
              <button
                type="button"
                className="py-3.5 bg-slate-800/40 hover:bg-slate-800 text-white font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("7")}
              >
                7
              </button>
              <button
                type="button"
                className="py-3.5 bg-slate-800/40 hover:bg-slate-800 text-white font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("8")}
              >
                8
              </button>
              <button
                type="button"
                className="py-3.5 bg-slate-800/40 hover:bg-slate-800 text-white font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("9")}
              >
                9
              </button>
              <button
                type="button"
                className="py-3.5 bg-slate-800 hover:bg-slate-700 text-amber-500 font-bold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("-")}
              >
                -
              </button>

              {/* Row 3 */}
              <button
                type="button"
                className="py-3.5 bg-slate-800/40 hover:bg-slate-800 text-white font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("4")}
              >
                4
              </button>
              <button
                type="button"
                className="py-3.5 bg-slate-800/40 hover:bg-slate-800 text-white font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("5")}
              >
                5
              </button>
              <button
                type="button"
                className="py-3.5 bg-slate-800/40 hover:bg-slate-800 text-white font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("6")}
              >
                6
              </button>
              <button
                type="button"
                className="py-3.5 bg-slate-800 hover:bg-slate-700 text-amber-500 font-bold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("+")}
              >
                +
              </button>

              {/* Row 4 */}
              <button
                type="button"
                className="py-3.5 bg-slate-800/40 hover:bg-slate-800 text-white font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("1")}
              >
                1
              </button>
              <button
                type="button"
                className="py-3.5 bg-slate-800/40 hover:bg-slate-800 text-white font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("2")}
              >
                2
              </button>
              <button
                type="button"
                className="py-3.5 bg-slate-800/40 hover:bg-slate-800 text-white font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress("3")}
              >
                3
              </button>
              <button
                type="button"
                className="row-span-2 py-8 bg-gradient-to-b from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-black font-extrabold rounded-2xl text-base transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                onClick={() => handleCalcPress("=")}
              >
                =
              </button>

              {/* Row 5 */}
              <button
                type="button"
                className="col-span-2 py-3.5 bg-slate-800/40 hover:bg-slate-800 text-white font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer text-center"
                onClick={() => handleCalcPress("0")}
              >
                0
              </button>
              <button
                type="button"
                className="py-3.5 bg-slate-800/40 hover:bg-slate-800 text-white font-semibold rounded-2xl text-sm transition-all active:scale-95 cursor-pointer"
                onClick={() => handleCalcPress(".")}
              >
                .
              </button>
            </div>

            {/* Bottom Actions */}
            <footer className="p-4 bg-slate-900 border-t border-slate-800/80 flex flex-col gap-2">
              <button
                type="button"
                className="py-3 bg-gradient-to-r from-amber-500/10 to-amber-700/10 hover:from-amber-500/20 hover:to-amber-700/20 border border-amber-500/30 hover:border-amber-500/50 text-amber-400 hover:text-amber-300 text-xs font-bold rounded-xl transition-colors active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                onClick={handleApplyCalcToReceived}
              >
                <DollarSign size={14} />
                Usar como Pago Recibido
              </button>
            </footer>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
