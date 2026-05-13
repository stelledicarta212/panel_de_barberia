"use client";

import { useMemo, useState } from "react";
import { Clock3, DollarSign, MoreHorizontal, Plus, Scissors, Search, SlidersHorizontal, SquarePen, Trash2, TrendingUp, X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { useDashboard } from "@/store/dashboard-context";
import Link from "next/link";

type ServiceCard = {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  image?: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildDefaultServiceImage(name: string): string {
  const safeName = encodeURIComponent(name.slice(0, 28));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='520' viewBox='0 0 900 520'>
  <defs>
    <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='#0a1324'/>
      <stop offset='55%' stop-color='#1a2234'/>
      <stop offset='100%' stop-color='#0d1628'/>
    </linearGradient>
    <linearGradient id='gold' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='#f6dfaa'/>
      <stop offset='50%' stop-color='#d9bc7a'/>
      <stop offset='100%' stop-color='#b8964e'/>
    </linearGradient>
  </defs>
  <rect width='900' height='520' fill='url(#bg)'/>
  <rect x='26' y='26' width='848' height='468' rx='26' fill='none' stroke='#3c465f' stroke-width='2'/>
  <circle cx='145' cy='138' r='62' fill='rgba(217,188,122,.2)' stroke='url(#gold)' stroke-width='2'/>
  <text x='145' y='154' text-anchor='middle' font-size='54' font-family='Segoe UI, Arial' fill='url(#gold)'>✂</text>
  <text x='240' y='145' font-size='46' font-weight='700' font-family='Segoe UI, Arial' fill='#f2f4fa'>${safeName}</text>
  <text x='240' y='192' font-size='24' font-family='Segoe UI, Arial' fill='#9faac0'>Servicio premium de barbería</text>
  <rect x='240' y='238' width='196' height='48' rx='14' fill='rgba(217,188,122,.17)' stroke='rgba(217,188,122,.45)'/>
  <text x='338' y='270' text-anchor='middle' font-size='22' font-family='Segoe UI, Arial' fill='#ead39b'>Corte y estilo</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${svg}`;
}

export default function ServiciosPage() {
  const { merged } = useDashboard();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const services = useMemo<ServiceCard[]>(() => {
    return merged.services.map((item, index) => {
      const name = text(item.nombre ?? item.name) || `Servicio ${index + 1}`;
      const duration = Math.max(15, numberValue(item.duracion_min ?? item.duration_minutes, 45));
      const price = Math.max(5, numberValue(item.precio ?? item.price, 40));
      const inheritedImage = text(
        item.image_url ??
        item.foto_url ??
        item.cover_url ??
        item.imagen_url ??
        item.imagen ??
        item.photo_url
      );

      return {
        id: text(item.id) || `service-${index}`,
        name,
        description: text(item.descripcion ?? item.description) || `${name} con acabado premium y detalle profesional.`,
        duration,
        price,
        image: inheritedImage || buildDefaultServiceImage(name)
      };
    });
  }, [merged.services]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((service) => service.name.toLowerCase().includes(q) || service.description.toLowerCase().includes(q));
  }, [services, query]);

  const selected = filtered.find((service) => service.id === selectedId) ?? null;
  const topServices = useMemo(() => [...services].sort((a, b) => b.price - a.price).slice(0, 4), [services]);
  const totalRevenue = useMemo(() => services.reduce((acc, item) => acc + item.price, 0), [services]);

  return (
    <DashboardShell>
      <section className="ba-services-layout">
        <div className="ba-services-main ba-card">
          <header className="ba-services-head">
            <h1>Servicios</h1>
            <Link
              href="https://barberagency-barberagency.gymh5g.easypanel.host/registro-barberias/"
              target="_blank"
              rel="noreferrer"
              className="ba-mini-gold"
            >
              <Plus size={12} />
              Agregar servicio
            </Link>
          </header>

          <div className="ba-services-toolbar">
            <button type="button" className="ba-services-filter">
              <SlidersHorizontal size={12} />
              Filtro
            </button>
            <label className="ba-mini-search">
              <Search size={12} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Buscar servicios"
              />
            </label>
          </div>

          <div className="ba-services-grid">
            {filtered.map((service) => (
              <article
                key={service.id}
                className={`ba-service-list-card ${selected?.id === service.id ? "is-selected" : ""}`}
                onClick={() => setSelectedId(service.id)}
              >
                <div className="ba-service-list-thumb">
                  <img src={service.image} alt={service.name} loading="lazy" />
                </div>
                <div className="ba-service-list-head">
                  <span className="ba-service-icon-badge">
                    <Scissors size={13} />
                  </span>
                  <button type="button" aria-label="Opciones" className="ba-card-menu">
                    <MoreHorizontal size={12} />
                  </button>
                </div>

                <div className="ba-service-list-body">
                  <div className="ba-service-list-title">
                    <h3>{service.name}</h3>
                    <div className="ba-service-meta">
                      <span><Clock3 size={11} />{service.duration} min</span>
                      <strong><DollarSign size={11} />{service.price}</strong>
                    </div>
                  </div>
                  <p>{service.description}</p>
                  <div className="ba-service-actions">
                    <button type="button" aria-label="Editar"><SquarePen size={12} /></button>
                    <button type="button" aria-label="Eliminar"><Trash2 size={12} /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {!filtered.length ? (
            <div className="ba-services-empty">
              <p>{`No hay servicios para "${query}".`}</p>
            </div>
          ) : null}
        </div>

        <aside className="ba-services-right">
          <article className="ba-card ba-right-widget">
            <header className="ba-right-header">
              <h3>Top servicios</h3>
              <MoreHorizontal size={12} />
            </header>
            <ul className="ba-services-top-list">
              {topServices.map((service) => (
                <li key={`top-${service.id}`}>
                  <span><Scissors size={11} /> {service.name}</span>
                  <strong>${service.price}</strong>
                </li>
              ))}
            </ul>
          </article>

          <article className="ba-card ba-right-widget">
            <header className="ba-right-header">
              <h3>Ingresos por servicio</h3>
              <MoreHorizontal size={12} />
            </header>
            <div className="ba-services-income-chart">
              <div className="ba-services-income-lines">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="ba-services-income-wave" />
            </div>
            <div className="ba-services-income-stats">
              <p><span>Ganancia total</span><strong>${totalRevenue}</strong></p>
              <p><span>Ingreso activo</span><strong>${Math.round(totalRevenue * 0.42)}</strong></p>
            </div>
          </article>

          <article className="ba-card ba-right-widget">
            <header className="ba-right-header">
              <h3>Promociones activas</h3>
              <MoreHorizontal size={12} />
            </header>
            <ul className="ba-services-promo-list">
              {filtered.slice(0, 3).map((service, index) => (
                <li key={`promo-${service.id}`}>
                  <span className="ba-services-promo-index">#{index + 1}</span>
                  <div>
                    <strong>{service.name}</strong>
                    <small>Promo destacada de temporada</small>
                  </div>
                </li>
              ))}
            </ul>
          </article>

          <article className="ba-card ba-right-widget ba-services-insight">
            <header className="ba-right-header">
              <h3>Resumen</h3>
              <TrendingUp size={12} />
            </header>
            <p>{services.length} servicios configurados</p>
            <small>Click en cada servicio para ver detalle, editar o eliminar.</small>
          </article>
        </aside>

        {selected ? (
          <article className="ba-overlay-card ba-services-overlay">
            <header className="ba-overlay-head">
              <div className="ba-overlay-user">
                <img src={selected.image} alt={selected.name} loading="lazy" />
                <div>
                  <strong>{selected.name}</strong>
                  <small>{selected.description}</small>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Cerrar ficha">
                <X size={12} />
              </button>
            </header>
            <div className="ba-overlay-grid">
              <p><span>Duracion</span><strong>{selected.duration} min</strong></p>
              <p><span>Precio</span><strong>${selected.price}</strong></p>
              <p><span>Estado</span><strong>Activo</strong></p>
              <p><span>Popularidad</span><strong>Alta</strong></p>
            </div>
            <footer className="ba-overlay-actions">
              <button type="button" className="ba-btn-ghost">Editar</button>
              <button type="button" className="ba-card-gold">Aplicar</button>
            </footer>
          </article>
        ) : null}
      </section>
    </DashboardShell>
  );
}
