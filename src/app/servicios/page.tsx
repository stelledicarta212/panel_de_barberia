"use client";

import { useMemo, useState } from "react";
import { Clock3, DollarSign, MoreHorizontal, Plus, Scissors, Search, SlidersHorizontal, SquarePen, Trash2, TrendingUp, X } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { useDashboard } from "@/store/dashboard-context";
import { addServicio, updateServicio, deleteServicio } from "@/lib/dashboard-api";

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
  const { merged, refresh, identity } = useDashboard();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Modal and form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);

  const [formNombre, setFormNombre] = useState("");
  const [formPrecio, setFormPrecio] = useState("");
  const [formDuracion, setFormDuracion] = useState("");
  const [formImagenUrl, setFormImagenUrl] = useState("");
  const [formActivo, setFormActivo] = useState(true);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<ServiceCard | null>(null);

  const [loadingAction, setLoadingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const services = useMemo<ServiceCard[]>(() => {
    // Return only active services in the dashboard panel so logical deletes (activo = false)
    // are correctly removed from the UI.
    return merged.services
      .filter((item) => item.activo !== false)
      .map((item, index) => {
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

  const handleOpenAdd = () => {
    setModalMode("add");
    setEditingServiceId(null);
    setFormNombre("");
    setFormPrecio("");
    setFormDuracion("");
    setFormImagenUrl("");
    setFormActivo(true);
    setActionError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (service: ServiceCard) => {
    setModalMode("edit");
    const idNum = Number(service.id);
    setEditingServiceId(isNaN(idNum) ? null : idNum);
    setFormNombre(service.name);
    setFormPrecio(String(service.price));
    setFormDuracion(String(service.duration));
    const isDataUrl = service.image?.startsWith("data:");
    setFormImagenUrl(isDataUrl ? "" : (service.image || ""));
    
    const originalItem = merged.services.find(item => text(item.id) === service.id);
    setFormActivo(originalItem ? originalItem.activo !== false : true);

    setActionError(null);
    setIsModalOpen(true);
  };

  const handleOpenDelete = (service: ServiceCard) => {
    setServiceToDelete(service);
    setActionError(null);
    setIsDeleteOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identity?.barberia_id) {
      setActionError("No hay identidad de barbería seleccionada o no tienes permisos.");
      return;
    }

    const precioNum = Number(formPrecio);
    const duracionNum = Number(formDuracion);

    if (!formNombre.trim()) {
      setActionError("El nombre es requerido.");
      return;
    }
    if (isNaN(precioNum) || precioNum <= 0) {
      setActionError("El precio debe ser un número mayor a 0.");
      return;
    }
    if (isNaN(duracionNum) || duracionNum <= 0) {
      setActionError("La duración debe ser un número mayor a 0.");
      return;
    }

    setLoadingAction(true);
    setActionError(null);

    try {
      if (modalMode === "add") {
        const res = await addServicio({
          barberia_id: identity.barberia_id,
          nombre: formNombre.trim(),
          precio: precioNum,
          duracion_min: duracionNum,
          imagen_url: formImagenUrl.trim() || undefined
        });

        if (!res.ok) {
          throw new Error(res.message || "Error al agregar servicio");
        }
      } else {
        if (editingServiceId === null) {
          throw new Error("ID de servicio no válido para editar.");
        }
        const res = await updateServicio({
          barberia_id: identity.barberia_id,
          id: editingServiceId,
          nombre: formNombre.trim(),
          precio: precioNum,
          duracion_min: duracionNum,
          imagen_url: formImagenUrl.trim() || undefined,
          activo: formActivo
        });

        if (!res.ok) {
          throw new Error(res.message || "Error al actualizar servicio");
        }
      }

      await refresh();
      setIsModalOpen(false);
      setSelectedId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!identity?.barberia_id) {
      setActionError("No hay identidad de barbería seleccionada o no tienes permisos.");
      return;
    }
    if (!serviceToDelete) return;

    const idNum = Number(serviceToDelete.id);
    if (isNaN(idNum)) {
      setActionError("ID de servicio no válido.");
      return;
    }

    setLoadingAction(true);
    setActionError(null);

    try {
      const res = await deleteServicio({
        barberia_id: identity.barberia_id,
        id: idNum
      });

      if (!res.ok) {
        throw new Error(res.message || "Error al eliminar servicio");
      }

      await refresh();
      setIsDeleteOpen(false);
      setServiceToDelete(null);
      setSelectedId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <DashboardShell>
      <section className="ba-services-layout">
        <div className="ba-services-main ba-card">
          <header className="ba-services-head">
            <h1>Servicios</h1>
            <button
              type="button"
              className="ba-mini-gold"
              onClick={handleOpenAdd}
            >
              <Plus size={12} />
              Agregar servicio
            </button>
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
                    <button
                      type="button"
                      aria-label="Editar"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(service);
                      }}
                    >
                      <SquarePen size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label="Eliminar"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDelete(service);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
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
              <button
                type="button"
                className="ba-btn-ghost"
                onClick={() => handleOpenEdit(selected)}
              >
                Editar
              </button>
              <button
                type="button"
                className="ba-card-gold"
                style={{
                  background: "linear-gradient(180deg, #ff8080, #ef4444)",
                  border: "1px solid rgba(255, 126, 126, 0.4)",
                  color: "#fff"
                }}
                onClick={() => handleOpenDelete(selected)}
              >
                Eliminar
              </button>
            </footer>
          </article>
        ) : null}

        {/* Add/Edit Modal */}
        {isModalOpen && (
          <div className="ba-modal-overlay" onClick={() => setIsModalOpen(false)}>
            <div className="ba-modal ba-card" onClick={(e) => e.stopPropagation()}>
              <header className="ba-modal-header">
                <h2>{modalMode === "add" ? "Agregar Servicio" : "Editar Servicio"}</h2>
                <button type="button" onClick={() => setIsModalOpen(false)}>
                  <X size={16} />
                </button>
              </header>
              <form className="ba-modal-form" onSubmit={handleSubmit}>
                <label className="ba-field-label">
                  <span>Nombre del servicio</span>
                  <input
                    type="text"
                    className="ba-input"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    placeholder="Ej. Corte de Cabello + Lavado"
                    required
                    disabled={loadingAction}
                  />
                </label>
                <div className="ba-form-row">
                  <label className="ba-field-label">
                    <span>Precio ($)</span>
                    <input
                      type="number"
                      className="ba-input"
                      value={formPrecio}
                      onChange={(e) => setFormPrecio(e.target.value)}
                      placeholder="Ej. 30"
                      min="1"
                      required
                      disabled={loadingAction}
                    />
                  </label>
                  <label className="ba-field-label">
                    <span>Duración (minutos)</span>
                    <input
                      type="number"
                      className="ba-input"
                      value={formDuracion}
                      onChange={(e) => setFormDuracion(e.target.value)}
                      placeholder="Ej. 45"
                      min="5"
                      required
                      disabled={loadingAction}
                    />
                  </label>
                </div>
                <label className="ba-field-label">
                  <span>URL de Imagen (Opcional)</span>
                  <input
                    type="url"
                    className="ba-input"
                    value={formImagenUrl}
                    onChange={(e) => setFormImagenUrl(e.target.value)}
                    placeholder="https://ejemplo.com/imagen.jpg"
                    disabled={loadingAction}
                  />
                </label>

                {modalMode === "edit" && (
                  <label className="ba-switch-label">
                    <input
                      type="checkbox"
                      checked={formActivo}
                      onChange={(e) => setFormActivo(e.target.checked)}
                      disabled={loadingAction}
                    />
                    <span>Servicio activo</span>
                  </label>
                )}

                {actionError && <p className="ba-error-message">{actionError}</p>}

                <div className="ba-modal-actions">
                  <button
                    type="button"
                    className="ba-btn-ghost"
                    onClick={() => setIsModalOpen(false)}
                    disabled={loadingAction}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="ba-btn-gold"
                    disabled={loadingAction}
                  >
                    {loadingAction ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {isDeleteOpen && (
          <div className="ba-modal-overlay" onClick={() => setIsDeleteOpen(false)}>
            <div className="ba-modal ba-card" onClick={(e) => e.stopPropagation()}>
              <header className="ba-modal-header">
                <h2>Eliminar Servicio</h2>
                <button type="button" onClick={() => setIsDeleteOpen(false)}>
                  <X size={16} />
                </button>
              </header>
              <div className="ba-modal-form">
                <p style={{ margin: 0, fontSize: "14px", color: "var(--text)" }}>
                  ¿Estás seguro de que deseas eliminar el servicio{" "}
                  <strong>{serviceToDelete?.name}</strong>?
                </p>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>
                  Esta acción desactivará el servicio y no estará disponible para nuevas citas.
                  Los registros históricos en el sistema no se verán afectados.
                </p>

                {actionError && <p className="ba-error-message">{actionError}</p>}

                <div className="ba-modal-actions">
                  <button
                    type="button"
                    className="ba-btn-ghost"
                    onClick={() => setIsDeleteOpen(false)}
                    disabled={loadingAction}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="ba-btn-gold"
                    style={{
                      background: "linear-gradient(180deg, #ff8080, #ef4444)",
                      border: "1px solid rgba(255, 126, 126, 0.4)",
                      color: "#fff"
                    }}
                    onClick={handleConfirmDelete}
                    disabled={loadingAction}
                  >
                    {loadingAction ? "Eliminando..." : "Confirmar y Desactivar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
