"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  AlertCircle,
  Clock,
  Edit2,
  Percent,
  Plus,
  RefreshCw,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X
} from "lucide-react";
import type { OffPeakRule, OffPeakRuleInput } from "@/types/off-peak";
import {
  DIAS_SEMANA_LABELS,
  createOffPeakRuleClient,
  deleteOffPeakRuleClient,
  fetchOffPeakRules,
  formatDiasSemana,
  formatHoraCorta,
  updateOffPeakRuleClient
} from "@/lib/off-peak-client";

interface ServiceItem {
  id?: number | string;
  nombre?: string;
  precio?: number | string;
}

interface BarberItem {
  id?: number | string;
  nombre?: string;
}

interface OffPeakManagerProps {
  barberiaId: number | null;
  isOwnerOrAdmin: boolean;
  services: ServiceItem[];
  barbers: BarberItem[];
  onActionMessage: (msg: { type: "success" | "error"; text: string } | null) => void;
  onRulesCountChange?: (count: number) => void;
}

export function OffPeakManager({
  barberiaId,
  isOwnerOrAdmin,
  services,
  barbers,
  onActionMessage,
  onRulesCountChange
}: OffPeakManagerProps) {
  const [rules, setRules] = useState<OffPeakRule[]>([]);
  const [loading, setLoading] = useState(Boolean(barberiaId));
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<OffPeakRule | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<OffPeakRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form Fields
  const [formNombre, setFormNombre] = useState("");
  const [formDiasSemana, setFormDiasSemana] = useState<number[]>([1, 2, 3]); // Lun, Mar, Mié default
  const [formHoraInicio, setFormHoraInicio] = useState("14:00");
  const [formHoraFin, setFormHoraFin] = useState("17:00");
  const [formDescuentoPorcentaje, setFormDescuentoPorcentaje] = useState<number>(20);
  const [formAplicaTodosServicios, setFormAplicaTodosServicios] = useState(true);
  const [formServiciosIds, setFormServiciosIds] = useState<number[]>([]);
  const [formAplicaTodosBarberos, setFormAplicaTodosBarberos] = useState(true);
  const [formBarberosIds, setFormBarberosIds] = useState<number[]>([]);
  const [formActivo, setFormActivo] = useState(true);

  const formNombreId = useId();

  // Load rules from API
  const loadRules = useCallback(async () => {
    if (!barberiaId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOffPeakRules(barberiaId);
      setRules(data);
      onRulesCountChange?.(data.filter((r) => r.activo).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar reglas de tiempos muertos.");
    } finally {
      setLoading(false);
    }
  }, [barberiaId, onRulesCountChange]);

  useEffect(() => {
    let cancelled = false;
    async function initRules() {
      try {
        const data = await fetchOffPeakRules(barberiaId);
        if (cancelled) return;
        setRules(data);
        onRulesCountChange?.(data.filter((r) => r.activo).length);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error al cargar reglas de tiempos muertos.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    if (barberiaId) {
      void initRules();
    }
    return () => {
      cancelled = true;
    };
  }, [barberiaId, onRulesCountChange]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingRule(null);
    setFormNombre("");
    setFormDiasSemana([1, 2, 3]); // Default Lun, Mar, Mié
    setFormHoraInicio("14:00");
    setFormHoraFin("17:00");
    setFormDescuentoPorcentaje(20);
    setFormAplicaTodosServicios(true);
    setFormServiciosIds([]);
    setFormAplicaTodosBarberos(true);
    setFormBarberosIds([]);
    setFormActivo(true);
    setShowModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (rule: OffPeakRule) => {
    setEditingRule(rule);
    setFormNombre(rule.nombre || "");
    setFormDiasSemana(Array.isArray(rule.dias_semana) ? [...rule.dias_semana] : []);
    setFormHoraInicio(formatHoraCorta(rule.hora_inicio));
    setFormHoraFin(formatHoraCorta(rule.hora_fin));
    setFormDescuentoPorcentaje(rule.descuento_porcentaje);
    setFormAplicaTodosServicios(rule.aplica_todos_servicios);
    setFormServiciosIds(Array.isArray(rule.servicios_ids) ? [...rule.servicios_ids] : []);
    setFormAplicaTodosBarberos(rule.aplica_todos_barberos);
    setFormBarberosIds(Array.isArray(rule.barberos_ids) ? [...rule.barberos_ids] : []);
    setFormActivo(rule.activo);
    setShowModal(true);
  };

  // Toggle Day Selection
  const toggleDia = (dia: number) => {
    setFormDiasSemana((prev) => {
      if (prev.includes(dia)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((d) => d !== dia);
      }
      return [...prev, dia].sort((a, b) => a - b);
    });
  };

  // Toggle Service Selection
  const toggleService = (srvId: number) => {
    setFormServiciosIds((prev) => {
      if (prev.includes(srvId)) {
        return prev.filter((id) => id !== srvId);
      }
      return [...prev, srvId];
    });
  };

  // Toggle Barber Selection
  const toggleBarber = (barberId: number) => {
    setFormBarberosIds((prev) => {
      if (prev.includes(barberId)) {
        return prev.filter((id) => id !== barberId);
      }
      return [...prev, barberId];
    });
  };

  // Quick Toggle Active State
  const handleToggleActive = async (rule: OffPeakRule) => {
    if (!isOwnerOrAdmin || saving) return;
    try {
      const updated = await updateOffPeakRuleClient(
        rule.id,
        { activo: !rule.activo },
        barberiaId
      );
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
      onRulesCountChange?.(
        rules.map((r) => (r.id === rule.id ? updated : r)).filter((r) => r.activo).length
      );
      onActionMessage({
        type: "success",
        text: `Promoción '${rule.nombre || "Sin nombre"}' ${updated.activo ? "activada" : "pausada"} exitosamente.`
      });
    } catch (err) {
      onActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error al cambiar estado de la regla."
      });
    }
  };

  // Save (Create / Edit) Rule
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerOrAdmin || saving) return;

    if (!formDiasSemana.length) {
      onActionMessage({ type: "error", text: "Debes seleccionar al menos un día de la semana." });
      return;
    }

    if (!formHoraInicio || !formHoraFin || formHoraFin <= formHoraInicio) {
      onActionMessage({ type: "error", text: "La hora de fin debe ser posterior a la hora de inicio." });
      return;
    }

    if (formDescuentoPorcentaje < 1 || formDescuentoPorcentaje >= 100) {
      onActionMessage({ type: "error", text: "El descuento debe estar entre 1% y 99%." });
      return;
    }

    if (!formAplicaTodosServicios && formServiciosIds.length === 0) {
      onActionMessage({ type: "error", text: "Selecciona al menos un servicio o marca 'Todos los servicios'." });
      return;
    }

    if (!formAplicaTodosBarberos && formBarberosIds.length === 0) {
      onActionMessage({ type: "error", text: "Selecciona al menos un barbero o marca 'Todos los barberos'." });
      return;
    }

    setSaving(true);
    try {
      const payload: OffPeakRuleInput = {
        nombre: formNombre.trim() || null,
        dias_semana: formDiasSemana,
        hora_inicio: formHoraInicio,
        hora_fin: formHoraFin,
        descuento_porcentaje: formDescuentoPorcentaje,
        aplica_todos_servicios: formAplicaTodosServicios,
        servicios_ids: formAplicaTodosServicios ? null : formServiciosIds,
        aplica_todos_barberos: formAplicaTodosBarberos,
        barberos_ids: formAplicaTodosBarberos ? null : formBarberosIds,
        activo: formActivo
      };

      if (editingRule) {
        const updated = await updateOffPeakRuleClient(editingRule.id, payload, barberiaId);
        setRules((prev) => prev.map((r) => (r.id === editingRule.id ? updated : r)));
        onActionMessage({
          type: "success",
          text: `Promoción '${updated.nombre || "Sin nombre"}' actualizada exitosamente.`
        });
      } else {
        const created = await createOffPeakRuleClient(payload, barberiaId);
        setRules((prev) => [...prev, created]);
        onActionMessage({
          type: "success",
          text: `Promoción '${created.nombre || "Sin nombre"}' creada correctamente.`
        });
      }

      setShowModal(false);
      await loadRules();
    } catch (err) {
      onActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error al guardar la regla."
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete Rule Confirmation
  const handleDeleteConfirm = async () => {
    if (!ruleToDelete || !isOwnerOrAdmin || deleting) return;
    setDeleting(true);
    try {
      await deleteOffPeakRuleClient(ruleToDelete.id, barberiaId);
      setRules((prev) => prev.filter((r) => r.id !== ruleToDelete.id));
      onActionMessage({
        type: "success",
        text: `Promoción eliminada correctamente. Las citas existentes conservan su precio congelado.`
      });
      setRuleToDelete(null);
      await loadRules();
    } catch (err) {
      onActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error al eliminar la regla."
      });
    } finally {
      setDeleting(false);
    }
  };

  // Keyboard accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showModal && !saving) setShowModal(false);
        if (ruleToDelete && !deleting) setRuleToDelete(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showModal, saving, ruleToDelete, deleting]);

  // Preview Example
  const sampleBasePrice = 20000;
  const sampleDiscountValue = Math.round((sampleBasePrice * formDescuentoPorcentaje) / 100);
  const sampleFinalPrice = sampleBasePrice - sampleDiscountValue;

  return (
    <div className="ba-card" style={{ padding: "20px", borderRadius: "12px" }}>
      {/* Header Section */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "20px",
          paddingBottom: "16px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)"
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#fff"
            }}
          >
            <Clock size={18} color="#d8b56d" />
            <span>Tiempos Muertos & Descuentos Inteligentes</span>
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted, #9ca3af)", maxWidth: "720px" }}>
            Incentiva reservas en tus días y horarios de menor concurrencia aplicando descuentos promocionales
            automáticos. El cliente ve el descuento en la agenda y el POS cobra el precio promocional congelado.
          </p>
        </div>

        {isOwnerOrAdmin && (
          <button
            type="button"
            className="ba-card-gold"
            onClick={handleOpenCreate}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "9px 18px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            <Plus size={16} />
            <span>Nueva Promoción</span>
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            marginBottom: "16px",
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            color: "#ef4444",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertCircle size={16} />
            <span style={{ fontSize: "13px" }}>{error}</span>
          </div>
          <button
            type="button"
            className="ba-btn-ghost"
            onClick={loadRules}
            style={{ fontSize: "12px", padding: "4px 8px" }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && rules.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--muted, #9ca3af)" }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
          <p style={{ margin: 0, fontSize: "14px" }}>Cargando reglas de tiempos muertos...</p>
        </div>
      ) : rules.length === 0 ? (
        /* Empty State */
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            background: "rgba(255, 255, 255, 0.02)",
            borderRadius: "12px",
            border: "1px dashed rgba(255, 255, 255, 0.12)"
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(216, 181, 109, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px"
            }}
          >
            <Percent size={28} color="#d8b56d" />
          </div>
          <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 600, color: "#fff" }}>
            Sin promociones de tiempos muertos activas
          </h3>
          <p style={{ margin: "0 auto 20px", fontSize: "13px", color: "var(--muted, #9ca3af)", maxWidth: "520px" }}>
            Los tiempos muertos te permiten definir reglas como &quot;Lunes a Miércoles de 2:00 PM a 5:00 PM con 20% de
            descuento&quot; para llenar los turnos vacíos de tu barbería.
          </p>
          {isOwnerOrAdmin && (
            <button
              type="button"
              className="ba-card-gold"
              onClick={handleOpenCreate}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "8px"
              }}
            >
              <Plus size={16} />
              <span>Crear primera promoción</span>
            </button>
          )}
        </div>
      ) : (
        /* Rules Table / Cards */
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.08)", textAlign: "left" }}>
                <th style={{ padding: "12px 14px", color: "var(--muted, #9ca3af)", fontWeight: 600 }}>Promoción</th>
                <th style={{ padding: "12px 14px", color: "var(--muted, #9ca3af)", fontWeight: 600 }}>Días</th>
                <th style={{ padding: "12px 14px", color: "var(--muted, #9ca3af)", fontWeight: 600 }}>Horario (Semi-abierto)</th>
                <th style={{ padding: "12px 14px", color: "var(--muted, #9ca3af)", fontWeight: 600 }}>Descuento</th>
                <th style={{ padding: "12px 14px", color: "var(--muted, #9ca3af)", fontWeight: 600 }}>Alcance</th>
                <th style={{ padding: "12px 14px", color: "var(--muted, #9ca3af)", fontWeight: 600 }}>Estado</th>
                {isOwnerOrAdmin && (
                  <th style={{ padding: "12px 14px", color: "var(--muted, #9ca3af)", fontWeight: 600, textAlign: "right" }}>
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const srvCount = rule.aplica_todos_servicios
                  ? "Todos los servicios"
                  : `${rule.servicios_ids?.length || 0} servicio(s)`;
                const barCount = rule.aplica_todos_barberos
                  ? "Todos los barberos"
                  : `${rule.barberos_ids?.length || 0} barbero(s)`;

                return (
                  <tr
                    key={rule.id}
                    style={{
                      borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                      opacity: rule.activo ? 1 : 0.6,
                      transition: "opacity 0.2s"
                    }}
                  >
                    {/* Name / ID */}
                    <td style={{ padding: "14px" }}>
                      <div style={{ fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>{rule.nombre || "Promoción sin título"}</span>
                      </div>
                      <small style={{ color: "var(--muted, #9ca3af)", fontSize: "11px" }}>Regla #{rule.id}</small>
                    </td>

                    {/* Days */}
                    <td style={{ padding: "14px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          backgroundColor: "rgba(255, 255, 255, 0.06)",
                          fontSize: "12px",
                          fontWeight: 500
                        }}
                      >
                        {formatDiasSemana(rule.dias_semana)}
                      </span>
                    </td>

                    {/* Hours */}
                    <td style={{ padding: "14px" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <Clock size={13} color="#9ca3af" />
                        <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
                          {formatHoraCorta(rule.hora_inicio)} - {formatHoraCorta(rule.hora_fin)}
                        </span>
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--muted, #9ca3af)", marginTop: "2px" }}>
                        Fin exclusivo ({formatHoraCorta(rule.hora_fin)} no aplica)
                      </div>
                    </td>

                    {/* Discount */}
                    <td style={{ padding: "14px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 10px",
                          borderRadius: "14px",
                          backgroundColor: "rgba(216, 181, 109, 0.15)",
                          color: "#d8b56d",
                          fontWeight: 700,
                          fontSize: "12px",
                          border: "1px solid rgba(216, 181, 109, 0.3)"
                        }}
                      >
                        <Sparkles size={12} />
                        <span>-{rule.descuento_porcentaje}%</span>
                      </span>
                    </td>

                    {/* Scope */}
                    <td style={{ padding: "14px", color: "var(--muted, #9ca3af)", fontSize: "12px" }}>
                      <div>{srvCount}</div>
                      <div>{barCount}</div>
                    </td>

                    {/* Status Switch */}
                    <td style={{ padding: "14px" }}>
                      {isOwnerOrAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(rule)}
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            color: rule.activo ? "#10b981" : "#9ca3af"
                          }}
                          title={rule.activo ? "Click para pausar promoción" : "Click para activar promoción"}
                        >
                          {rule.activo ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                          <span style={{ fontSize: "12px", fontWeight: 500 }}>
                            {rule.activo ? "Activa" : "Pausada"}
                          </span>
                        </button>
                      ) : (
                        <span
                          style={{
                            fontSize: "12px",
                            color: rule.activo ? "#10b981" : "#9ca3af",
                            fontWeight: 500
                          }}
                        >
                          {rule.activo ? "● Activa" : "○ Pausada"}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    {isOwnerOrAdmin && (
                      <td style={{ padding: "14px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "8px" }}>
                          <button
                            type="button"
                            className="ba-btn-ghost"
                            onClick={() => handleOpenEdit(rule)}
                            style={{ padding: "6px 10px", fontSize: "12px", borderRadius: "6px" }}
                            title="Editar regla"
                          >
                            <Edit2 size={13} />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            className="ba-btn-ghost"
                            onClick={() => setRuleToDelete(rule)}
                            style={{
                              padding: "6px 10px",
                              fontSize: "12px",
                              borderRadius: "6px",
                              color: "#ef4444"
                            }}
                            title="Eliminar regla"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="off-peak-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            overflowY: "auto"
          }}
        >
          <div
            className="ba-card"
            style={{
              width: "100%",
              maxWidth: "580px",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              border: "1px solid rgba(255, 255, 255, 0.12)"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px"
              }}
            >
              <h3
                id="off-peak-modal-title"
                style={{
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#fff"
                }}
              >
                <Clock size={18} color="#d8b56d" />
                <span>{editingRule ? "Editar Promoción de Tiempos Muertos" : "Nueva Promoción de Tiempos Muertos"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--muted, #9ca3af)",
                  cursor: "pointer",
                  padding: "4px"
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRule}>
              {/* Name */}
              <div style={{ marginBottom: "16px" }}>
                <label
                  htmlFor={formNombreId}
                  style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "6px", color: "#e5e7eb" }}
                >
                  Nombre de la Promoción (Opcional)
                </label>
                <input
                  id={formNombreId}
                  type="text"
                  className="ba-mini-field"
                  placeholder="Ej. Promo Tardes, Lunes Suave"
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "6px" }}
                />
              </div>

              {/* Days Chips Multi-Select */}
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "8px", color: "#e5e7eb" }}>
                  Días de la Semana
                </label>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {[1, 2, 3, 4, 5, 6, 0].map((dia) => {
                    const selected = formDiasSemana.includes(dia);
                    return (
                      <button
                        key={dia}
                        type="button"
                        onClick={() => toggleDia(dia)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "8px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.15s",
                          backgroundColor: selected ? "#d8b56d" : "rgba(255, 255, 255, 0.05)",
                          color: selected ? "#000" : "var(--muted, #9ca3af)",
                          border: selected ? "1px solid #d8b56d" : "1px solid rgba(255, 255, 255, 0.1)"
                        }}
                      >
                        {DIAS_SEMANA_LABELS[dia]}
                      </button>
                    );
                  })}
                </div>
                <small style={{ color: "var(--muted, #9ca3af)", fontSize: "11px", display: "block", marginTop: "4px" }}>
                  Seleccionados: {formatDiasSemana(formDiasSemana)}
                </small>
              </div>

              {/* Hours: Start and End */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginBottom: "16px"
                }}
              >
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "6px", color: "#e5e7eb" }}>
                    Hora Inicio (Inclusive)
                  </label>
                  <input
                    type="time"
                    className="ba-mini-field"
                    value={formHoraInicio}
                    onChange={(e) => setFormHoraInicio(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "6px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "6px", color: "#e5e7eb" }}>
                    Hora Fin (Límite Exclusivo)
                  </label>
                  <input
                    type="time"
                    className="ba-mini-field"
                    value={formHoraFin}
                    onChange={(e) => setFormHoraFin(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "6px" }}
                  />
                </div>
              </div>

              {/* Discount Percentage */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>
                    Porcentaje de Descuento
                  </label>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#d8b56d" }}>
                    {formDescuentoPorcentaje}%
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <input
                    type="range"
                    min="1"
                    max="99"
                    step="1"
                    value={formDescuentoPorcentaje}
                    onChange={(e) => setFormDescuentoPorcentaje(Number(e.target.value))}
                    style={{ flex: 1, accentColor: "#d8b56d", cursor: "pointer" }}
                  />
                  <input
                    type="number"
                    min="1"
                    max="99"
                    className="ba-mini-field"
                    value={formDescuentoPorcentaje}
                    onChange={(e) => setFormDescuentoPorcentaje(Math.min(99, Math.max(1, Number(e.target.value) || 1)))}
                    style={{ width: "65px", padding: "6px 8px", textAlign: "center", fontSize: "13px" }}
                  />
                </div>
              </div>

              {/* Dynamic Price Preview Card */}
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(216, 181, 109, 0.08)",
                  border: "1px solid rgba(216, 181, 109, 0.2)",
                  marginBottom: "16px",
                  fontSize: "12px"
                }}
              >
                <div style={{ color: "#d8b56d", fontWeight: 600, marginBottom: "4px" }}>
                  💡 Simulación de precio en vivo:
                </div>
                <div style={{ color: "#e5e7eb" }}>
                  Servicio base de <span style={{ textDecoration: "line-through" }}>${sampleBasePrice.toLocaleString()}</span>{" "}
                  → <strong style={{ color: "#10b981", fontSize: "13px" }}>${sampleFinalPrice.toLocaleString()}</strong>{" "}
                  (Ahorro de ${sampleDiscountValue.toLocaleString()} para el cliente).
                </div>
              </div>

              {/* Scope: Services */}
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "6px", color: "#e5e7eb" }}>
                  Servicios Aplicables
                </label>
                <div style={{ display: "flex", gap: "16px", marginBottom: "8px", fontSize: "13px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="srv_scope"
                      checked={formAplicaTodosServicios}
                      onChange={() => setFormAplicaTodosServicios(true)}
                    />
                    <span>Todos los servicios</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="srv_scope"
                      checked={!formAplicaTodosServicios}
                      onChange={() => setFormAplicaTodosServicios(false)}
                    />
                    <span>Servicios específicos</span>
                  </label>
                </div>

                {!formAplicaTodosServicios && (
                  <div
                    style={{
                      maxHeight: "120px",
                      overflowY: "auto",
                      padding: "8px 10px",
                      background: "rgba(0,0,0,0.2)",
                      borderRadius: "6px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px"
                    }}
                  >
                    {services.map((srv) => {
                      const idNum = Number(srv.id);
                      const isChecked = formServiciosIds.includes(idNum);
                      return (
                        <label
                          key={srv.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "12px",
                            cursor: "pointer"
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleService(idNum)}
                          />
                          <span>{srv.nombre || `Servicio #${srv.id}`}</span>
                          <span style={{ color: "var(--muted, #9ca3af)", fontSize: "11px" }}>
                            (${Number(srv.precio || 0).toLocaleString()})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Scope: Barbers */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "6px", color: "#e5e7eb" }}>
                  Barberos Aplicables
                </label>
                <div style={{ display: "flex", gap: "16px", marginBottom: "8px", fontSize: "13px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="barber_scope"
                      checked={formAplicaTodosBarberos}
                      onChange={() => setFormAplicaTodosBarberos(true)}
                    />
                    <span>Todos los barberos</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="barber_scope"
                      checked={!formAplicaTodosBarberos}
                      onChange={() => setFormAplicaTodosBarberos(false)}
                    />
                    <span>Barberos específicos</span>
                  </label>
                </div>

                {!formAplicaTodosBarberos && (
                  <div
                    style={{
                      maxHeight: "120px",
                      overflowY: "auto",
                      padding: "8px 10px",
                      background: "rgba(0,0,0,0.2)",
                      borderRadius: "6px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px"
                    }}
                  >
                    {barbers.map((b) => {
                      const idNum = Number(b.id);
                      const isChecked = formBarberosIds.includes(idNum);
                      return (
                        <label
                          key={b.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "12px",
                            cursor: "pointer"
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleBarber(idNum)}
                          />
                          <span>{b.nombre || `Barbero #${b.id}`}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active Switch */}
              <div style={{ marginBottom: "24px" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formActivo}
                    onChange={(e) => setFormActivo(e.target.checked)}
                  />
                  <span>Activar esta promoción inmediatamente al guardar</span>
                </label>
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="ba-btn-ghost"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                  style={{ padding: "8px 16px", borderRadius: "8px" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="ba-card-gold"
                  disabled={saving}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  {saving ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>{editingRule ? "Guardar Cambios" : "Crear Promoción"}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {ruleToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px"
          }}
        >
          <div
            className="ba-card"
            style={{
              width: "100%",
              maxWidth: "460px",
              borderRadius: "12px",
              padding: "24px",
              border: "1px solid rgba(239, 68, 68, 0.3)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(239, 68, 68, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Trash2 size={20} color="#ef4444" />
              </div>
              <h3 id="delete-modal-title" style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#fff" }}>
                ¿Eliminar promoción de tiempos muertos?
              </h3>
            </div>

            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--muted, #9ca3af)", lineHeight: 1.5 }}>
              ¿Estás seguro de que deseas eliminar la promoción{" "}
              <strong style={{ color: "#fff" }}>&quot;{ruleToDelete.nombre || `Regla #${ruleToDelete.id}`}&quot;</strong>?
              <br />
              <br />
              <span style={{ color: "#10b981", fontSize: "12px" }}>
                ✓ Integridad garantizada: Las citas agendadas con esta promoción mantendrán su precio congelado e
                inmutable.
              </span>
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="ba-btn-ghost"
                onClick={() => setRuleToDelete(null)}
                disabled={deleting}
                style={{ padding: "8px 16px", borderRadius: "8px" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{
                  padding: "8px 20px",
                  borderRadius: "8px",
                  backgroundColor: "#ef4444",
                  color: "#fff",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                {deleting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <span>Eliminar Promoción</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
