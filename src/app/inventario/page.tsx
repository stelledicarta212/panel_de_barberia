"use client";

import { useMemo, useRef, useState } from "react";
import { Calculator, Cake, Clock3, CreditCard, DollarSign, Gift, Receipt, RefreshCcw, Scissors, Wallet, X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";

type Movement = {
  id: string;
  client: string;
  service: string;
  method: string;
  amount: string;
  status: "Pendiente" | "Enviada" | "Aceptada";
  date: string;
  hour: string;
  barber: string;
  tip: string;
  avatar: string;
  stampCurrent: number;
  stampRequired: number;
  birthdayBenefit: string;
  inactiveDays: number;
  reactivationBenefit: string;
  offPeakBenefit: string;
  barberAvatar: string;
};

type BarberClose = {
  id: string;
  barber: string;
  avatar: string;
  cuts: string;
  ticketAvg: string;
  total: string;
  commission: string;
  pending: string;
};

const BARBER_AVATARS = [
  "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/04/barbero1.1.png",
  "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/04/barbero2.1.png",
  "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/04/barbero3.1.png",
  "https://barberagency-barberagency.gymh5g.easypanel.host/wp-content/uploads/2026/04/barbero4.1.png"
];

function initialsFrom(name: string): string {
  const chunks = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!chunks.length) return "CL";
  if (chunks.length === 1) return chunks[0].slice(0, 2).toUpperCase();
  return `${chunks[0][0] ?? ""}${chunks[1][0] ?? ""}`.toUpperCase();
}

const MOVEMENTS: Movement[] = [
  {
    id: "m1",
    client: "Juan Perez",
    service: "Corte + Barba",
    method: "Tarjeta",
    amount: "$32.00",
    status: "Aceptada",
    date: "19/09/2023",
    hour: "10:20",
    barber: "Alex M.",
    tip: "$4.00",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop",
    stampCurrent: 5,
    stampRequired: 8,
    birthdayBenefit: "15% OFF en cumpleanos",
    inactiveDays: 12,
    reactivationBenefit: "Reactiva con 20% OFF",
    offPeakBenefit: "Promo 2x1 en horas muertas",
    barberAvatar: BARBER_AVATARS[0]
  },
  {
    id: "m2",
    client: "Luis G.",
    service: "Corte Clasico",
    method: "Efectivo",
    amount: "$20.00",
    status: "Enviada",
    date: "18/09/2023",
    hour: "11:05",
    barber: "James R.",
    tip: "$2.00",
    avatar: "https://images.unsplash.com/photo-1542909168-82c3e7fdca5c?w=120&auto=format&fit=crop",
    stampCurrent: 3,
    stampRequired: 8,
    birthdayBenefit: "Servicio especial en cumpleanos",
    inactiveDays: 23,
    reactivationBenefit: "Hace rato no vienes... 20% OFF",
    offPeakBenefit: "15% OFF en horario valle",
    barberAvatar: BARBER_AVATARS[1]
  },
  {
    id: "m3",
    client: "Maria S.",
    service: "Barba Premium",
    method: "Transferencia",
    amount: "$12.00",
    status: "Aceptada",
    date: "17/09/2023",
    hour: "12:35",
    barber: "Aldo H.",
    tip: "$0.00",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop",
    stampCurrent: 6,
    stampRequired: 8,
    birthdayBenefit: "20% OFF en cumpleanos",
    inactiveDays: 8,
    reactivationBenefit: "Cliente activa",
    offPeakBenefit: "10% OFF horas muertas",
    barberAvatar: BARBER_AVATARS[2]
  },
  {
    id: "m4",
    client: "Carlos R.",
    service: "Fade",
    method: "Tarjeta",
    amount: "$24.00",
    status: "Pendiente",
    date: "17/09/2023",
    hour: "13:10",
    barber: "Alex M.",
    tip: "$3.00",
    avatar: "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=120&auto=format&fit=crop",
    stampCurrent: 2,
    stampRequired: 8,
    birthdayBenefit: "Servicio de barba gratis",
    inactiveDays: 31,
    reactivationBenefit: "Mensaje de reactivacion activo",
    offPeakBenefit: "Promo tardes L-J",
    barberAvatar: BARBER_AVATARS[0]
  }
];

const BARBER_CLOSE: BarberClose[] = [
  {
    id: "b1",
    barber: "Alex M.",
    avatar: BARBER_AVATARS[0],
    cuts: "6",
    ticketAvg: "$28.00",
    total: "$168.00",
    commission: "$50.40",
    pending: "$0.00"
  },
  {
    id: "b2",
    barber: "James R.",
    avatar: BARBER_AVATARS[1],
    cuts: "4",
    ticketAvg: "$31.00",
    total: "$124.00",
    commission: "$37.20",
    pending: "$12.00"
  },
  {
    id: "b3",
    barber: "Aldo H.",
    avatar: BARBER_AVATARS[2],
    cuts: "4",
    ticketAvg: "$19.00",
    total: "$76.00",
    commission: "$22.80",
    pending: "$0.00"
  }
];

function moneyToNumber(value: string): number {
  const clean = String(value || "").replace(/[^0-9.-]/g, "");
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function toCop(value: number): string {
  return `$${Math.round(value)}`;
}

export default function InventarioPage() {
  const [movements, setMovements] = useState<Movement[]>(MOVEMENTS);
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [receiptBarberId, setReceiptBarberId] = useState<string | null>(null);
  const [closeReceiptOpen, setCloseReceiptOpen] = useState(false);
  const [posClient, setPosClient] = useState("Cliente mostrador");
  const [posBarber, setPosBarber] = useState("Alex M.");
  const [posMethod, setPosMethod] = useState("Efectivo");
  const [posReceived, setPosReceived] = useState("");
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcPosition, setCalcPosition] = useState<{ x: number; y: number } | null>(null);
  const [calcDragging, setCalcDragging] = useState(false);
  const calcDragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [posItems, setPosItems] = useState([
    { name: "Corte Clasico", amount: 20000 },
    { name: "Barba Premium", amount: 15000 }
  ]);

  const selectedMovement = useMemo(
    () => movements.find((row) => row.id === selectedMovementId) ?? null,
    [selectedMovementId, movements]
  );

  const barberCloseRows = useMemo<BarberClose[]>(() => {
    const grouped = new Map<string, { total: number; cuts: number; pending: number; avatar: string }>();
    for (const item of movements) {
      const current = grouped.get(item.barber) ?? {
        total: 0,
        cuts: 0,
        pending: 0,
        avatar: item.barberAvatar || BARBER_AVATARS[0]
      };
      const amount = moneyToNumber(item.amount);
      current.cuts += 1;
      if (item.status === "Pendiente") current.pending += amount;
      else current.total += amount;
      grouped.set(item.barber, current);
    }
    return Array.from(grouped.entries()).map(([barber, row], index) => {
      const avg = row.cuts ? row.total / row.cuts : 0;
      return {
        id: `b-${index + 1}`,
        barber,
        avatar: row.avatar,
        cuts: String(row.cuts),
        ticketAvg: asMoney(avg),
        total: asMoney(row.total),
        commission: asMoney(row.total * 0.3),
        pending: asMoney(row.pending)
      };
    });
  }, [movements]);

  const selectedBarber = useMemo(
    () => barberCloseRows.find((row) => row.id === selectedBarberId) ?? null,
    [selectedBarberId, barberCloseRows]
  );

  const receiptBarber = useMemo(
    () => barberCloseRows.find((row) => row.id === receiptBarberId) ?? null,
    [receiptBarberId, barberCloseRows]
  );

  const subtotal = useMemo(() => posItems.reduce((acc, item) => acc + item.amount, 0), [posItems]);
  const tax = useMemo(() => subtotal * 0.08, [subtotal]);
  const loyaltyDiscount = useMemo(() => Math.min(5000, subtotal * 0.1), [subtotal]);
  const posTotal = useMemo(() => Math.max(0, subtotal + tax - loyaltyDiscount), [subtotal, tax, loyaltyDiscount]);
  const receivedAmount = useMemo(() => Number(posReceived || 0), [posReceived]);
  const changeAmount = useMemo(() => Math.max(0, receivedAmount - posTotal), [receivedAmount, posTotal]);
  const pendingAmount = useMemo(() => Math.max(0, posTotal - receivedAmount), [receivedAmount, posTotal]);
  const canCharge = useMemo(() => posMethod !== "Efectivo" || receivedAmount >= posTotal, [posMethod, receivedAmount, posTotal]);
  const digitalPayments = useMemo(
    () => movements.filter((m) => m.method !== "Efectivo" && m.status !== "Pendiente").length,
    [movements]
  );
  const paidPayments = useMemo(
    () => movements.filter((m) => m.status !== "Pendiente"),
    [movements]
  );
  const salesDay = useMemo(
    () => paidPayments.reduce((acc, m) => acc + moneyToNumber(m.amount), 0),
    [paidPayments]
  );
  const cashDay = useMemo(
    () => paidPayments.filter((m) => m.method === "Efectivo").reduce((acc, m) => acc + moneyToNumber(m.amount), 0),
    [paidPayments]
  );
  const closeSummary = useMemo(() => {
    const pending = movements.filter((m) => m.status === "Pendiente").reduce((acc, m) => acc + moneyToNumber(m.amount), 0);
    const tips = movements.reduce((acc, m) => acc + moneyToNumber(m.tip), 0);
    const discounts = loyaltyDiscount;
    const extras = paidPayments
      .filter((m) => /barba|premium|extra|lavado/i.test(m.service))
      .reduce((acc, m) => acc + moneyToNumber(m.amount), 0);
    const net = salesDay + tips - discounts;
    return { pending, tips, discounts, extras, net };
  }, [movements, loyaltyDiscount, paidPayments, salesDay]);

  const addCashAmount = (amount: number) => {
    const next = Number(posReceived || 0) + amount;
    setPosReceived(String(next));
  };

  const handleChargeNow = () => {
    const paid = posMethod !== "Efectivo" || receivedAmount >= posTotal;
    const now = new Date();
    const date = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    const hour = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const services = posItems.map((i) => i.name).join(", ");
    const avatarIndex = Math.abs(posBarber.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % BARBER_AVATARS.length;
    const newMovement: Movement = {
      id: `m-${Date.now()}`,
      client: posClient.trim() || "Cliente mostrador",
      service: services || "Servicio",
      method: posMethod,
      amount: asMoney(posTotal),
      status: paid ? "Aceptada" : "Pendiente",
      date,
      hour,
      barber: posBarber || "Sin barbero",
      tip: "$0.00",
      avatar: "",
      stampCurrent: 0,
      stampRequired: 8,
      birthdayBenefit: "Sin beneficio",
      inactiveDays: 0,
      reactivationBenefit: "Sin regla",
      offPeakBenefit: "Sin promo",
      barberAvatar: BARBER_AVATARS[avatarIndex]
    };
    setMovements((prev) => [newMovement, ...prev]);
    setSelectedMovementId(newMovement.id);
    setPosReceived("");
  };

  const handlePrintReceipt = () => {
    if (!receiptBarber) return;
    const printWindow = window.open("", "_blank", "width=420,height=780");
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>Tirilla de Cierre</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #111; }
            .ticket { width: 280px; margin: 0 auto; border: 1px dashed #888; padding: 14px; }
            h1 { margin: 0 0 6px; font-size: 16px; text-align: center; }
            .muted { font-size: 12px; color: #555; text-align: center; margin-bottom: 12px; }
            .row { display: flex; justify-content: space-between; font-size: 13px; margin: 6px 0; }
            .total { font-weight: 700; border-top: 1px dashed #777; margin-top: 10px; padding-top: 8px; }
            .foot { margin-top: 14px; font-size: 11px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          <div class="ticket">
            <h1>BarberAgency POS</h1>
            <div class="muted">Tirilla de cierre por barbero</div>
            <div class="row"><span>Barbero</span><strong>${receiptBarber.barber}</strong></div>
            <div class="row"><span>Cortes</span><strong>${receiptBarber.cuts}</strong></div>
            <div class="row"><span>Ticket prom.</span><strong>${receiptBarber.ticketAvg}</strong></div>
            <div class="row"><span>Comision</span><strong>${receiptBarber.commission}</strong></div>
            <div class="row"><span>Pendiente</span><strong>${receiptBarber.pending}</strong></div>
            <div class="row total"><span>Total cierre</span><strong>${receiptBarber.total}</strong></div>
            <div class="foot">Emitido: ${new Date().toLocaleString()}</div>
          </div>
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handlePrintCloseReceipt = () => {
    const printWindow = window.open("", "_blank", "width=420,height=780");
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>Tirilla Cierre Caja</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #111; }
            .ticket { width: 280px; margin: 0 auto; border: 1px dashed #888; padding: 14px; }
            h1 { margin: 0 0 6px; font-size: 16px; text-align: center; }
            .muted { font-size: 12px; color: #555; text-align: center; margin-bottom: 12px; }
            .row { display: flex; justify-content: space-between; font-size: 13px; margin: 6px 0; }
            .total { font-weight: 700; border-top: 1px dashed #777; margin-top: 10px; padding-top: 8px; }
            .foot { margin-top: 14px; font-size: 11px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          <div class="ticket">
            <h1>BarberAgency POS</h1>
            <div class="muted">Tirilla de cierre de caja</div>
            <div class="row"><span>Cortes del dia</span><strong>$280.00</strong></div>
            <div class="row"><span>Servicios extra</span><strong>$88.00</strong></div>
            <div class="row"><span>Descuentos aplicados</span><strong>$22.00</strong></div>
            <div class="row"><span>Propinas</span><strong>$46.00</strong></div>
            <div class="row total"><span>Neto cierre</span><strong>$392.00</strong></div>
            <div class="foot">Emitido: ${new Date().toLocaleString()}</div>
          </div>
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const startCalcDrag = (clientX: number, clientY: number) => {
    const baseX = calcPosition?.x ?? Math.max(16, (window.innerWidth - 360) / 2);
    const baseY = calcPosition?.y ?? Math.max(16, (window.innerHeight - 460) / 2);
    calcDragRef.current = { startX: clientX, startY: clientY, baseX, baseY };
    setCalcDragging(true);
  };

  const moveCalcDrag = (clientX: number, clientY: number) => {
    const drag = calcDragRef.current;
    if (!drag) return;
    const maxX = Math.max(16, window.innerWidth - 380);
    const maxY = Math.max(16, window.innerHeight - 120);
    const nextX = Math.min(maxX, Math.max(16, drag.baseX + (clientX - drag.startX)));
    const nextY = Math.min(maxY, Math.max(16, drag.baseY + (clientY - drag.startY)));
    setCalcPosition({ x: nextX, y: nextY });
  };

  const endCalcDrag = () => {
    setCalcDragging(false);
    calcDragRef.current = null;
  };

  return (
    <DashboardShell>
      <section className="ba-pos-layout">
        <div className="ba-pos-top-grid">
          <article className="ba-card ba-pos-kpi">
            <header>
              <span>Ventas del dia</span>
              <DollarSign size={14} />
            </header>
            <strong>$368.00</strong>
            <small>{paidPayments.length} servicios cobrados</small>
          </article>

          <article className="ba-card ba-pos-kpi">
            <header>
              <span>Tickets cerrados</span>
              <Receipt size={14} />
            </header>
            <strong>{paidPayments.length}</strong>
            <small>{movements.filter((m) => m.status === "Pendiente").length} pendientes por cobrar</small>
          </article>

          <article className="ba-card ba-pos-kpi">
            <header>
              <span>Pago digital</span>
              <CreditCard size={14} />
            </header>
            <strong>{paidPayments.length ? `${Math.round((digitalPayments / paidPayments.length) * 100)}%` : "0%"}</strong>
            <small>Tarjeta/transferencia</small>
          </article>

          <article className="ba-card ba-pos-kpi">
            <header>
              <span>Efectivo</span>
              <Wallet size={14} />
            </header>
            <strong>{asMoney(cashDay)}</strong>
            <small>Caja fisica actual</small>
          </article>
        </div>

        <div className="ba-pos-main-grid">
          <article className="ba-card ba-pos-checkout">
            <header className="ba-card-title">
              <h2>Caja Rapida POS</h2>
              <span className="ba-editable-chip">Frontend demo</span>
            </header>

            <div className="ba-pos-ticket">
              <div className="ba-pos-lines">
                {posItems.map((item) => (
                  <div key={item.name}>
                    <span>{item.name}</span>
                    <strong>{toCop(item.amount)}</strong>
                  </div>
                ))}
              </div>
              <div className="ba-pos-summary">
                <p><span>Subtotal</span><strong>{asMoney(subtotal)}</strong></p>
                <p><span>Impuesto</span><strong>{asMoney(tax)}</strong></p>
                <p><span>Descuento lealtad</span><strong>-{asMoney(loyaltyDiscount)}</strong></p>
                <p className="is-total"><span>Total</span><strong>{asMoney(posTotal)}</strong></p>
              </div>
            </div>

            <div className="ba-form-grid">
              <label className="ba-field">
                <span>Cliente</span>
                <input className="ba-input" value={posClient} onChange={(e) => setPosClient(e.target.value)} />
              </label>
              <label className="ba-field">
                <span>Barbero</span>
                <input className="ba-input" value={posBarber} onChange={(e) => setPosBarber(e.target.value)} />
              </label>
              <label className="ba-field">
                <span>Metodo</span>
                <select className="ba-input" value={posMethod} onChange={(e) => setPosMethod(e.target.value)}>
                  <option>Efectivo</option>
                  <option>Tarjeta</option>
                  <option>Transferencia</option>
                </select>
              </label>
              <label className="ba-field">
                <span>Recibido</span>
                <input
                  className="ba-input"
                  type="number"
                  min={0}
                  step="1000"
                  value={posReceived}
                  onChange={(e) => setPosReceived(e.target.value)}
                  placeholder="Ej: 50000"
                />
              </label>
            </div>

            <div className="ba-pos-station">
              <div className="ba-pos-calc-launch-wrap">
                <button type="button" className="ba-pos-calc-launch" onClick={() => setCalcOpen(true)}>
                  <Calculator size={14} />
                  Abrir calculadora
                </button>
              </div>

              <div className="ba-pos-payment-grid">
                <div className="ba-pos-payment-pill">
                  <span>Monto recibido</span>
                  <strong>{asMoney(receivedAmount)}</strong>
                </div>
                <div className="ba-pos-payment-pill is-change">
                  <span>Vueltas</span>
                  <strong>{asMoney(changeAmount)}</strong>
                </div>
                <div className={`ba-pos-payment-pill ${pendingAmount > 0 ? "is-pending" : ""}`}>
                  <span>Faltante</span>
                  <strong>{asMoney(pendingAmount)}</strong>
                </div>
              </div>

              <div className="ba-pos-quick-cash">
                {[10000, 20000, 50000, 100000].map((bill) => (
                  <button key={bill} type="button" className="ba-btn-ghost" onClick={() => addCashAmount(bill)}>
                    +{toCop(bill)}
                  </button>
                ))}
              </div>
            </div>

            <div className="ba-pos-actions">
              <button type="button" className="ba-btn-ghost">Guardar ticket</button>
              <button type="button" className="ba-card-gold" onClick={handleChargeNow} disabled={!canCharge}>
                {canCharge ? "Cobrar ahora" : "Falta efectivo"}
              </button>
            </div>
          </article>

          <article className="ba-card ba-pos-close">
            <header className="ba-card-title">
              <h2>Cierre de Caja del Dia</h2>
              <Scissors size={14} />
            </header>
            <div className="ba-pos-close-grid">
              <p><span>Cortes del dia</span><strong>{asMoney(salesDay)}</strong></p>
              <p><span>Servicios extra</span><strong>{asMoney(closeSummary.extras)}</strong></p>
              <p><span>Descuentos aplicados</span><strong>{asMoney(closeSummary.discounts)}</strong></p>
              <p><span>Propinas</span><strong>{asMoney(closeSummary.tips)}</strong></p>
              <p className="is-net"><span>Neto cierre</span><strong>{asMoney(closeSummary.net)}</strong></p>
            </div>
            <div className="ba-pos-actions ba-pos-close-actions">
              <button type="button" className="ba-pos-close-btn ba-pos-close-btn-print" onClick={() => setCloseReceiptOpen(true)}>
                Imprimir tirilla
              </button>
              <button type="button" className="ba-pos-close-btn ba-pos-close-btn-main">
                Cerrar caja
              </button>
            </div>
          </article>
        </div>

        <div className="ba-pos-bottom-grid">
          <article className="ba-card ba-pos-table">
            <header className="ba-card-title">
              <h2>Movimientos recientes</h2>
            </header>
            <div className="ba-pos-table-head ba-pos-table-head-movements">
              <span>Cliente</span>
              <span>Servicio</span>
              <span>Barbero</span>
              <span>Metodo</span>
              <span>Monto</span>
            </div>
            {movements.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`ba-pos-table-row ba-pos-table-row-movements ba-pos-table-row-selectable ${selectedMovement?.id === item.id ? "is-selected" : ""}`}
                onClick={() => {
                  setSelectedBarberId(null);
                  setSelectedMovementId(item.id);
                }}
              >
                <span>{item.client}</span>
                <span>{item.service}</span>
                <span className="ba-pos-user-cell">
                  <img src={item.barberAvatar} alt={item.barber} loading="lazy" />
                  {item.barber}
                </span>
                <span>{item.method}</span>
                <strong>{item.amount}</strong>
              </button>
            ))}

            {selectedMovement ? (
              <article className="ba-overlay-card ba-pos-overlay-card">
                <header className="ba-overlay-head">
                  <div className="ba-overlay-user">
                    <span className="ba-overlay-initials">{initialsFrom(selectedMovement.client)}</span>
                    <div>
                      <strong>{selectedMovement.client}</strong>
                      <small>{selectedMovement.service}</small>
                    </div>
                  </div>
                  <button type="button" onClick={() => setSelectedMovementId(null)} aria-label="Cerrar ficha">
                    <X size={12} />
                  </button>
                </header>
                <div className="ba-overlay-grid">
                  <p><span>Fecha</span><strong>{selectedMovement.date}</strong></p>
                  <p><span>Estado</span><strong>{selectedMovement.status}</strong></p>
                  <p><span>Servicio</span><strong>{selectedMovement.service}</strong></p>
                  <p><span>Metodo de pago</span><strong>{selectedMovement.method}</strong></p>
                  <p><span>Barbero</span><strong>{selectedMovement.barber}</strong></p>
                  <p><span>Hora</span><strong>{selectedMovement.hour}</strong></p>
                  <p><span>Propina</span><strong>{selectedMovement.tip}</strong></p>
                  <p><span>Total</span><strong>{selectedMovement.amount}</strong></p>
                </div>
                <section className="ba-client-loyalty-card">
                  <header>
                    <h4><Gift size={12} />Beneficios de Lealtad</h4>
                  </header>
                  <div className="ba-client-stamp-track">
                    {Array.from({ length: selectedMovement.stampRequired }, (_, idx) => (
                      <span key={`stamp-move-${idx}`} className={idx < selectedMovement.stampCurrent ? "is-on" : ""}>
                        <Scissors size={11} />
                      </span>
                    ))}
                  </div>
                  <small className="ba-client-stamp-note">
                    {selectedMovement.stampCurrent} / {selectedMovement.stampRequired} sellos
                  </small>
                  <ul>
                    <li><Cake size={11} /><span>{selectedMovement.birthdayBenefit}</span></li>
                    <li><RefreshCcw size={11} /><span>{selectedMovement.inactiveDays} dias sin visita - {selectedMovement.reactivationBenefit}</span></li>
                    <li><Clock3 size={11} /><span>{selectedMovement.offPeakBenefit}</span></li>
                  </ul>
                </section>
                <footer className="ba-overlay-actions">
                  <button type="button" className="ba-btn-ghost">Ver</button>
                  <button type="button" className="ba-card-gold">Enviar</button>
                </footer>
              </article>
            ) : null}
          </article>

          <article className="ba-card ba-pos-table">
            <header className="ba-card-title">
              <h2>Cierre por barbero</h2>
            </header>
            <div className="ba-pos-table-head">
              <span>Barbero</span>
              <span>Cortes</span>
              <span>Ticket prom.</span>
              <span>Total</span>
            </div>
            {barberCloseRows.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`ba-pos-table-row ba-pos-table-row-selectable ${selectedBarber?.id === item.id ? "is-selected" : ""}`}
                onClick={() => {
                  setSelectedMovementId(null);
                  setSelectedBarberId(item.id);
                }}
              >
                <span className="ba-pos-user-cell">
                  <img src={item.avatar} alt={item.barber} loading="lazy" />
                  {item.barber}
                </span>
                <span>{item.cuts}</span>
                <span>{item.ticketAvg}</span>
                <strong>{item.total}</strong>
              </button>
            ))}

            {selectedBarber ? (
              <article className="ba-overlay-card ba-pos-overlay-card">
                <header className="ba-overlay-head">
                  <div className="ba-overlay-user">
                    <img src={selectedBarber.avatar} alt={selectedBarber.barber} loading="lazy" />
                    <div>
                      <strong>{selectedBarber.barber}</strong>
                      <small>Resumen de cierre</small>
                    </div>
                  </div>
                  <button type="button" onClick={() => setSelectedBarberId(null)} aria-label="Cerrar ficha">
                    <X size={12} />
                  </button>
                </header>
                <div className="ba-overlay-grid">
                  <p><span>Cortes</span><strong>{selectedBarber.cuts}</strong></p>
                  <p><span>Ticket promedio</span><strong>{selectedBarber.ticketAvg}</strong></p>
                  <p><span>Total facturado</span><strong>{selectedBarber.total}</strong></p>
                  <p><span>Comision</span><strong>{selectedBarber.commission}</strong></p>
                  <p><span>Pendiente</span><strong>{selectedBarber.pending}</strong></p>
                </div>
                <footer className="ba-overlay-actions">
                  <button type="button" className="ba-btn-ghost" onClick={() => setReceiptBarberId(selectedBarber.id)}>Imprimir</button>
                  <button type="button" className="ba-card-gold">Liquidar</button>
                </footer>
              </article>
            ) : null}
          </article>
        </div>

        {receiptBarber ? (
          <aside className="ba-pos-receipt-modal" role="dialog" aria-modal="true">
            <article className="ba-pos-receipt-slip">
              <header>
                <h3>Tirilla de Cierre</h3>
                <button type="button" onClick={() => setReceiptBarberId(null)} aria-label="Cerrar tirilla">
                  <X size={12} />
                </button>
              </header>
              <p className="ba-pos-receipt-subtitle">Resumen de caja por barbero</p>
              <div className="ba-pos-receipt-rows">
                <p><span>Barbero</span><strong>{receiptBarber.barber}</strong></p>
                <p><span>Cortes</span><strong>{receiptBarber.cuts}</strong></p>
                <p><span>Ticket prom.</span><strong>{receiptBarber.ticketAvg}</strong></p>
                <p><span>Comision</span><strong>{receiptBarber.commission}</strong></p>
                <p><span>Pendiente</span><strong>{receiptBarber.pending}</strong></p>
                <p className="is-total"><span>Total cierre</span><strong>{receiptBarber.total}</strong></p>
              </div>
              <small className="ba-pos-receipt-date">Emitido: {new Date().toLocaleString()}</small>
              <footer>
                <button type="button" className="ba-btn-ghost" onClick={() => setReceiptBarberId(null)}>Cerrar</button>
                <button type="button" className="ba-card-gold" onClick={handlePrintReceipt}>Imprimir</button>
              </footer>
            </article>
          </aside>
        ) : null}

        {closeReceiptOpen ? (
          <aside className="ba-pos-receipt-modal" role="dialog" aria-modal="true">
            <article className="ba-pos-receipt-slip">
              <header>
                <h3>Tirilla Cierre Caja</h3>
                <button type="button" onClick={() => setCloseReceiptOpen(false)} aria-label="Cerrar tirilla">
                  <X size={12} />
                </button>
              </header>
              <p className="ba-pos-receipt-subtitle">Resumen general del dia</p>
              <div className="ba-pos-receipt-rows">
                <p><span>Cortes del dia</span><strong>{asMoney(salesDay)}</strong></p>
                <p><span>Servicios extra</span><strong>{asMoney(closeSummary.extras)}</strong></p>
                <p><span>Descuentos aplicados</span><strong>{asMoney(closeSummary.discounts)}</strong></p>
                <p><span>Propinas</span><strong>{asMoney(closeSummary.tips)}</strong></p>
                <p className="is-total"><span>Neto cierre</span><strong>{asMoney(closeSummary.net)}</strong></p>
              </div>
              <small className="ba-pos-receipt-date">Emitido: {new Date().toLocaleString()}</small>
              <footer>
                <button type="button" className="ba-btn-ghost" onClick={() => setCloseReceiptOpen(false)}>Cerrar</button>
                <button type="button" className="ba-card-gold" onClick={handlePrintCloseReceipt}>Imprimir</button>
              </footer>
            </article>
          </aside>
        ) : null}

        {calcOpen ? (
          <aside
            className="ba-pos-receipt-modal"
            role="dialog"
            aria-modal="true"
            onMouseMove={(e) => {
              if (calcDragging) moveCalcDrag(e.clientX, e.clientY);
            }}
            onMouseUp={endCalcDrag}
            onMouseLeave={endCalcDrag}
            onTouchMove={(e) => {
              if (!calcDragging) return;
              const touch = e.touches[0];
              if (!touch) return;
              moveCalcDrag(touch.clientX, touch.clientY);
            }}
            onTouchEnd={endCalcDrag}
          >
            <article
              className={`ba-pos-calc-modal ${calcDragging ? "is-dragging" : ""}`}
              style={calcPosition ? { position: "fixed", left: `${calcPosition.x}px`, top: `${calcPosition.y}px`, margin: 0 } : undefined}
            >
              <header
                className="ba-pos-calc-drag-handle"
                onMouseDown={(e) => startCalcDrag(e.clientX, e.clientY)}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  if (!touch) return;
                  startCalcDrag(touch.clientX, touch.clientY);
                }}
              >
                <h3><Calculator size={14} />Calculadora POS</h3>
                <button type="button" onClick={() => setCalcOpen(false)} aria-label="Cerrar calculadora">
                  <X size={12} />
                </button>
              </header>

              <div className="ba-pos-calculator" aria-label="Calculadora POS">
                <div className="ba-pos-calc-display">
                  <span>Monto recibido</span>
                  <strong>{asMoney(receivedAmount)}</strong>
                </div>

                <div className="ba-pos-num-pad">
                  {[7, 8, 9, 4, 5, 6, 1, 2, 3].map((n) => (
                    <button
                      key={`pos-n-${n}`}
                      type="button"
                      className="ba-pos-num-btn"
                      onClick={() => setPosReceived((prev) => `${prev || ""}${n}`)}
                    >
                      {n}
                    </button>
                  ))}
                  <button type="button" className="ba-pos-num-btn is-op" onClick={() => setPosReceived((prev) => `${prev || ""}00`)}>
                    00
                  </button>
                  <button type="button" className="ba-pos-num-btn" onClick={() => setPosReceived((prev) => `${prev || ""}0`)}>0</button>
                  <button type="button" className="ba-pos-num-btn is-op" onClick={() => setPosReceived((prev) => (prev ? prev.slice(0, -1) : ""))}>
                    <X size={12} />
                  </button>
                </div>

                <div className="ba-pos-calc-shortcuts">
                  {[1000, 5000, 10000].map((step) => (
                    <button key={step} type="button" className="ba-pos-num-btn is-op" onClick={() => addCashAmount(step)}>
                      +{toCop(step)}
                    </button>
                  ))}
                  <button type="button" className="ba-pos-num-btn is-clear" onClick={() => setPosReceived("")}>
                    Limpiar
                  </button>
                </div>
              </div>
            </article>
          </aside>
        ) : null}
      </section>
    </DashboardShell>
  );
}
