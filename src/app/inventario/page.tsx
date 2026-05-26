"use client";

import { useMemo, useState } from "react";
import { Calculator, CreditCard, DollarSign, Receipt, Scissors, Wallet } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { useDashboard } from "@/store/dashboard-context";

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
  const { merged } = useDashboard();
  const [posClient, setPosClient] = useState("");
  const [posBarber, setPosBarber] = useState("");
  const [posMethod, setPosMethod] = useState("Efectivo");
  const [posReceived, setPosReceived] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [localMovements, setLocalMovements] = useState<Movement[]>([]);

  const services = useMemo(
    () =>
      merged.services.map((item, index) => ({
        id: text(item.id) || `service-${index + 1}`,
        name: text(item.nombre ?? item.name) || `Servicio ${index + 1}`,
        amount: num(item.precio ?? item.price)
      })),
    [merged.services]
  );

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

  const selectedServices = useMemo(() => {
    const ids = new Set(selectedServiceIds);
    return services.filter((service) => ids.has(service.id));
  }, [selectedServiceIds, services]);

  const subtotal = useMemo(
    () => selectedServices.reduce((acc, item) => acc + item.amount, 0),
    [selectedServices]
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

  const handleChargeNow = () => {
    if (!canCharge) return;
    const now = new Date();
    const movement: Movement = {
      id: `local-${Date.now()}`,
      client: posClient.trim() || "Cliente mostrador",
      service: selectedServices.map((item) => item.name).join(", "),
      method: posMethod,
      amount: subtotal,
      status: "Aceptada",
      date: `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`,
      hour: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      barber: posBarber || "Sin barbero"
    };
    setLocalMovements((prev) => [movement, ...prev]);
    setSelectedServiceIds([]);
    setPosReceived("");
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
              <div className="ba-pos-lines">
                {selectedServices.map((item) => (
                  <div key={item.id}><span>{item.name}</span><strong>{money(item.amount)}</strong></div>
                ))}
                {!selectedServices.length ? (
                  <div><span>Selecciona servicios reales</span><strong>$0</strong></div>
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
              </label>
            </div>

            <div className="ba-pos-lines">
              {services.map((service) => {
                const selected = selectedServiceIds.includes(service.id);
                return (
                  <button
                    key={service.id}
                    type="button"
                    className="ba-btn-ghost"
                    onClick={() =>
                      setSelectedServiceIds((prev) =>
                        selected ? prev.filter((id) => id !== service.id) : [...prev, service.id]
                      )
                    }
                  >
                    {selected ? "Quitar" : "Agregar"} {service.name} {money(service.amount)}
                  </button>
                );
              })}
            </div>

            <div className="ba-pos-station">
              <div className="ba-pos-payment-grid">
                <div className="ba-pos-payment-pill"><span>Monto recibido</span><strong>{money2(receivedAmount)}</strong></div>
                <div className="ba-pos-payment-pill is-change"><span>Vueltas</span><strong>{money2(changeAmount)}</strong></div>
                <div className={`ba-pos-payment-pill ${pendingAmount > 0 ? "is-pending" : ""}`}><span>Faltante</span><strong>{money2(pendingAmount)}</strong></div>
              </div>
            </div>

            <div className="ba-pos-actions">
              <button type="button" className="ba-btn-ghost"><Calculator size={14} />Calculadora</button>
              <button type="button" className="ba-card-gold" onClick={handleChargeNow} disabled={!canCharge}>
                {canCharge ? "Cobrar ahora" : "Falta pago"}
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
