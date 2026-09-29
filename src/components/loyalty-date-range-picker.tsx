"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, Clock } from "lucide-react";
import {
  type DateRangePreset,
  type LoyaltyDateRange,
  computeDateRange
} from "@/lib/loyalty-date";

interface LoyaltyDateRangePickerProps {
  selectedRange: LoyaltyDateRange;
  onRangeChange: (newRange: LoyaltyDateRange) => void;
  disabled?: boolean;
}

const PRESET_OPTIONS: Array<{ key: DateRangePreset; label: string; desc: string }> = [
  { key: "hoy", label: "Hoy", desc: "Día calendario actual en Colombia" },
  { key: "ayer", label: "Ayer", desc: "Día anterior completo" },
  { key: "esta_semana", label: "Esta semana", desc: "De lunes a domingo" },
  { key: "este_mes", label: "Este mes", desc: "Mes calendario actual" },
  { key: "personalizado", label: "Personalizado", desc: "Seleccionar rango de fechas" }
];

export function LoyaltyDateRangePicker({
  selectedRange,
  onRangeChange,
  disabled = false
}: LoyaltyDateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Custom date range local state
  const [customStart, setCustomStart] = useState<string>(selectedRange.startDate);
  const [customEnd, setCustomEnd] = useState<string>(selectedRange.endDate);
  const [customError, setCustomError] = useState<string | null>(null);

  const handleToggleOpen = () => {
    if (disabled) return;
    if (!isOpen) {
      setCustomStart(selectedRange.startDate);
      setCustomEnd(selectedRange.endDate);
      setCustomError(null);
    }
    setIsOpen((prev) => !prev);
  };

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectPreset = (preset: DateRangePreset) => {
    setCustomError(null);
    if (preset === "personalizado") {
      // Don't close immediately; let user pick custom dates
      return;
    }
    const newRange = computeDateRange(preset);
    onRangeChange(newRange);
    setIsOpen(false);
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);

    if (!customStart || !customEnd) {
      setCustomError("Debes seleccionar fecha inicial y final.");
      return;
    }

    if (customStart > customEnd) {
      setCustomError("La fecha inicial no puede ser posterior a la fecha final.");
      return;
    }

    const newRange = computeDateRange("personalizado", customStart, customEnd);
    onRangeChange(newRange);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      {/* TRIGGER BUTTON */}
      <button
        type="button"
        onClick={handleToggleOpen}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Filtrar métricas por período (America/Bogota)"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "7px 14px",
          fontSize: "13px",
          fontWeight: 600,
          borderRadius: "8px",
          backgroundColor: isOpen ? "rgba(216, 181, 109, 0.15)" : "rgba(255, 255, 255, 0.05)",
          color: isOpen ? "#d8b56d" : "#e5e7eb",
          border: `1px solid ${isOpen ? "rgba(216, 181, 109, 0.5)" : "rgba(255, 255, 255, 0.12)"}`,
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "all 0.15s ease",
          boxShadow: isOpen ? "0 0 12px rgba(216, 181, 109, 0.15)" : "none",
          outline: "none"
        }}
      >
        <CalendarDays size={15} color="#d8b56d" />
        <span style={{ letterSpacing: "-0.01em" }}>{selectedRange.label}</span>
        <ChevronDown
          size={14}
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            color: "var(--muted, #9ca3af)"
          }}
        />
      </button>

      {/* DROPDOWN / POPOVER */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Selector de período"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 999,
            minWidth: "310px",
            maxWidth: "92vw",
            backgroundColor: "#161619",
            border: "1px solid rgba(216, 181, 109, 0.35)",
            borderRadius: "12px",
            padding: "16px",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(216, 181, 109, 0.08)",
            backdropFilter: "blur(16px)"
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
              paddingBottom: "10px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Clock size={14} color="#d8b56d" />
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#d8b56d", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Filtrar por período
              </span>
            </div>
            <span style={{ fontSize: "11px", color: "var(--muted, #9ca3af)" }}>Bogotá (UTC-5)</span>
          </div>

          {/* Preset Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "14px" }}>
            {PRESET_OPTIONS.map((opt) => {
              const isSelected = selectedRange.preset === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleSelectPreset(opt.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: isSelected ? 600 : 500,
                    backgroundColor: isSelected ? "rgba(216, 181, 109, 0.15)" : "transparent",
                    color: isSelected ? "#d8b56d" : "#e5e7eb",
                    border: `1px solid ${isSelected ? "rgba(216, 181, 109, 0.3)" : "transparent"}`,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.1s ease"
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.04)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  <div>
                    <div>{opt.label}</div>
                    <div style={{ fontSize: "11px", color: "var(--muted, #9ca3af)", marginTop: "1px" }}>{opt.desc}</div>
                  </div>
                  {isSelected && <Check size={16} color="#d8b56d" />}
                </button>
              );
            })}
          </div>

          {/* Custom Date Inputs Section */}
          <form
            onSubmit={handleApplyCustom}
            style={{
              paddingTop: "12px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)"
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted, #9ca3af)", marginBottom: "8px", textTransform: "uppercase" }}>
              Rango Personalizado
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>
                  Desde
                </label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    backgroundColor: "rgba(0, 0, 0, 0.3)",
                    color: "#fff",
                    fontSize: "12px",
                    outline: "none"
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>
                  Hasta
                </label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    backgroundColor: "rgba(0, 0, 0, 0.3)",
                    color: "#fff",
                    fontSize: "12px",
                    outline: "none"
                  }}
                />
              </div>
            </div>

            {customError && (
              <div style={{ fontSize: "11px", color: "#ef4444", marginBottom: "8px" }}>
                {customError}
              </div>
            )}

            <button
              type="submit"
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "6px",
                backgroundColor: "#d8b56d",
                color: "#121214",
                fontSize: "12px",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                transition: "opacity 0.15s ease"
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              Aplicar Rango Personalizado
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
