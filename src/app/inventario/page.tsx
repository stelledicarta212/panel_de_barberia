"use client";

import { useMemo, useState } from "react";
import { Calculator, CreditCard, DollarSign, Receipt, Scissors, Wallet } from "lucide-react";
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
  return `$${Math.round(value)}`;
}

function money2(value: number): string {
  return `$${value.toFixed(2)}`;
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

  const services = useMemo(
    () =>
      merged.services.map((item, index) => ({
        id: text(item.id) || `service-${index + 1}`,
        name: text(item.nombre ?? item.name) || `Servicio ${index + 1}`,
        amount: num(item.precio ?? item.price)
      })),
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

  return (
    <DashboardShell>
      <section className="ba-pos-layout">
        <div className="ba-pos-top-grid">
          <article className="ba-card ba-pos-kpi">
            <header><span>Ventas del dia</span><DollarSign size={14} /></header>
            <strong>{money2(salesDay)}</strong>
            <small>{paidMovements.length} servicios cobrados</small>
          </article>
          <article className="ba-card ba-pos-kpi">
            <header><span>Tickets cerrados</span><Receipt size={14} /></header>
            <strong>{paidMovements.length}</strong>
            <small>{movements.filter((item) => item.status === "Pendiente").length} pendientes por cobrar</small>
          </article>
          <article className="ba-card ba-pos-kpi">
            <header><span>Pago digital</span><CreditCard size={14} /></header>
            <strong>{paidMovements.length ? `${Math.round((digitalPayments / paidMovements.length) * 100)}%` : "0%"}</strong>
            <small>Tarjeta/transferencia</small>
          </article>
          <article className="ba-card ba-pos-kpi">
            <header><span>Efectivo</span><Wallet size={14} /></header>
            <strong>{money2(cashDay)}</strong>
            <small>Caja fisica actual</small>
          </article>
        </div>

        <div className="ba-pos-main-grid">
          <article className="ba-card ba-pos-checkout">
            <header className="ba-card-title">
              <h2>Caja Rapida POS</h2>
              <span className="ba-editable-chip">Fuente real</span>
            </header>

            <div className="ba-pos-ticket">
              <div className="ba-pos-lines flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1">
                {selectedServicesGrouped.map((item) => (
                  <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-100/10 last:border-b-0">
                    <div className="flex flex-col text-left">
                      <span className="font-semibold text-xs text-gray-200">{item.name}</span>
                      <span className="text-[10px] text-gray-400">
                        {item.quantity} x {money(item.amount ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="w-5 h-5 border border-gray-600 rounded-md flex items-center justify-center font-bold text-xs text-gray-400 hover:text-white hover:border-gray-400 transition-colors"
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
                        -
                      </button>
                      <button
                        type="button"
                        className="w-5 h-5 border border-gray-600 rounded-md flex items-center justify-center font-bold text-xs text-gray-400 hover:text-white hover:border-gray-400 transition-colors"
                        onClick={() => setSelectedServiceIds(prev => [...prev, item.id!])}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="w-5 h-5 border border-red-900 bg-red-950/20 text-red-400 hover:bg-red-950 hover:text-red-300 rounded-md flex items-center justify-center text-[10px] transition-colors ml-1"
                        onClick={() => setSelectedServiceIds(prev => prev.filter(id => id !== item.id))}
                        aria-label="Eliminar"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
                {!selectedServicesGrouped.length ? (
                  <div className="text-center py-4 text-xs text-gray-500">Selecciona servicios del catálogo</div>
                ) : null}
              </div>
              <div className="ba-pos-summary">
                <p><span>Subtotal</span><strong>{money2(subtotal)}</strong></p>
                <p><span>Descuento lealtad</span><strong>$0.00</strong></p>
                <p className="is-total"><span>Total</span><strong>{money2(subtotal)}</strong></p>
              </div>
            </div>

            <div className="ba-form-grid">
              <label className="ba-field">
                <span>Cliente</span>
                <input className="ba-input" value={posClient} onChange={(e) => setPosClient(e.target.value)} placeholder="Cliente mostrador" />
              </label>
              <label className="ba-field">
                <span>Barbero</span>
                <select className="ba-input" value={posBarber} onChange={(e) => setPosBarber(e.target.value)}>
                  <option value="">Selecciona barbero</option>
                  {barbers.map((barber) => <option key={barber.id} value={barber.name}>{barber.name}</option>)}
                </select>
              </label>
              <label className="ba-field">
                <span>Metodo</span>
                <select className="ba-input" value={posMethod} onChange={(e) => setPosMethod(e.target.value)}>
                  <option>Efectivo</option>
                  <option>Digital</option>
                </select>
              </label>
              <label className="ba-field">
                <span>Recibido</span>
                <input className="ba-input" type="number" min={0} step="1000" value={posReceived} onChange={(e) => setPosReceived(e.target.value)} placeholder="Ej: 50000" />
                {posMethod === "Efectivo" && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {[10000, 20000, 50000, 100000].map((bill) => (
                      <button
                        key={bill}
                        type="button"
                        className="px-2 py-1 text-[10px] border border-gray-600 rounded-lg bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 font-semibold transition-colors active:scale-95"
                        onClick={() => setPosReceived(String(bill))}
                      >
                        ${bill / 1000}k
                      </button>
                    ))}
                    <button
                      type="button"
                      className="px-2 py-1 text-[10px] border border-red-900 bg-red-950/20 text-red-400 hover:bg-red-950 hover:text-red-300 rounded-lg font-semibold transition-colors active:scale-95"
                      onClick={() => setPosReceived("")}
                    >
                      Limpiar
                    </button>
                  </div>
                )}
              </label>
            </div>

            <div className="mt-4 mb-2">
              <span className="text-xs font-semibold text-gray-400 block mb-2">Catálogo de Servicios</span>
              <input
                type="text"
                className="ba-input mb-3 text-xs py-2"
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                placeholder="🔍 Buscar servicio..."
              />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto pr-1">
                {filteredServices.map((service) => {
                  const quantity = selectedServiceIds.filter((id) => id === service.id).length;
                  const isSelected = quantity > 0;
                  return (
                    <button
                      key={service.id}
                      type="button"
                      className={`flex flex-col justify-between p-3 border rounded-xl text-left transition-all active:scale-[0.96] duration-100 min-h-[90px] ${
                        isSelected
                          ? "border-amber-500 bg-amber-500/10"
                          : "border-gray-800 bg-gray-900/40 hover:border-gray-700"
                      }`}
                      onClick={() =>
                        setSelectedServiceIds((prev) => [...prev, service.id!])
                      }
                    >
                      <div className="flex justify-between items-start w-full gap-1">
                        <span className="font-semibold text-xs text-gray-200 line-clamp-2 leading-tight">
                          {service.name}
                        </span>
                        {quantity > 0 && (
                          <span className="w-4 h-4 bg-amber-500 text-white rounded-full flex items-center justify-center text-[9px] font-bold shrink-0">
                            {quantity}
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-xs text-amber-500 mt-2">
                        {money(service.amount)}
                      </span>
                    </button>
                  );
                })}
                {!filteredServices.length ? (
                  <div className="col-span-full text-center py-6 text-xs text-gray-500">Sin servicios coincidentes</div>
                ) : null}
              </div>
            </div>

            <div className="ba-pos-station">
              <div className="ba-pos-payment-grid">
                <div className="ba-pos-payment-pill"><span>Monto recibido</span><strong>{money2(receivedAmount)}</strong></div>
                <div className="ba-pos-payment-pill is-change"><span>Vueltas</span><strong>{money2(changeAmount)}</strong></div>
                <div className={`ba-pos-payment-pill ${pendingAmount > 0 ? "is-pending" : ""}`}><span>Faltante</span><strong>{money2(pendingAmount)}</strong></div>
              </div>
            </div>

            {chargeError && (
              <div className="text-red-500 text-xs px-2 text-center font-semibold mb-2">
                {chargeError}
              </div>
            )}

            <div className="ba-pos-actions">
              <button type="button" className="ba-btn-ghost"><Calculator size={14} />Calculadora</button>
              <button
                type="button"
                className="ba-card-gold"
                onClick={handleChargeNow}
                disabled={!canCharge || charging}
              >
                {charging ? "Cargando..." : canCharge ? "Cobrar ahora" : "Falta pago"}
              </button>
            </div>
          </article>

          <article className="ba-card ba-pos-close">
            <header className="ba-card-title"><h2>Cierre de Caja del Dia</h2><Scissors size={14} /></header>
            <div className="ba-pos-close-grid">
              <p><span>Servicios cobrados</span><strong>{money2(salesDay)}</strong></p>
              <p><span>Servicios pendientes</span><strong>{money2(movements.filter((item) => item.status === "Pendiente").reduce((acc, item) => acc + item.amount, 0))}</strong></p>
              <p><span>Descuentos aplicados</span><strong>$0.00</strong></p>
              <p><span>Propinas</span><strong>$0.00</strong></p>
              <p className="is-net"><span>Neto cierre</span><strong>{money2(salesDay)}</strong></p>
            </div>
          </article>
        </div>

        <div className="ba-pos-bottom-grid">
          <article className="ba-card ba-pos-table">
            <header className="ba-card-title"><h2>Movimientos recientes</h2></header>
            <div className="ba-pos-table-head ba-pos-table-head-movements">
              <span>Cliente</span><span>Servicio</span><span>Barbero</span><span>Metodo</span><span>Monto</span>
            </div>
            {movements.map((item) => (
              <div key={item.id} className="ba-pos-table-row ba-pos-table-row-movements">
                <span>{item.client}</span>
                <span>{item.service}</span>
                <span className="ba-pos-user-cell"><span className="ba-overlay-initials">{initialsFrom(item.barber)}</span>{item.barber}</span>
                <span>{item.method}</span>
                <strong>{money2(item.amount)}</strong>
              </div>
            ))}
            {!movements.length ? (
              <div className="ba-pos-table-row ba-pos-table-row-movements">
                <span>Sin movimientos reales</span><span>Reservas/cobros apareceran aqui</span><span>-</span><span>-</span><strong>$0.00</strong>
              </div>
            ) : null}
          </article>

          <article className="ba-card ba-pos-table">
            <header className="ba-card-title"><h2>Cierre por barbero</h2></header>
            <div className="ba-pos-table-head">
              <span>Barbero</span><span>Cortes</span><span>Ticket prom.</span><span>Total</span>
            </div>
            {closeRows.map((item) => (
              <div key={item.barber} className="ba-pos-table-row">
                <span className="ba-pos-user-cell"><span className="ba-overlay-initials">{initialsFrom(item.barber)}</span>{item.barber}</span>
                <span>{item.cuts}</span>
                <span>{money2(item.ticketAvg)}</span>
                <strong>{money2(item.total)}</strong>
              </div>
            ))}
            {!closeRows.length ? (
              <div className="ba-pos-table-row">
                <span>Sin cierre por barbero</span><span>0</span><span>$0.00</span><strong>$0.00</strong>
              </div>
            ) : null}
          </article>
        </div>
      </section>
    </DashboardShell>
  );
}
