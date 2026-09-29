"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import {
  type DateRangePreset,
  type LoyaltyDateRange,
  computeDateRange,
  getBogotaToday,
  buildCalendarDays,
  SPANISH_MONTH_FULL,
  DAYS_OF_WEEK_SHORT
} from "@/lib/loyalty-date";

interface LoyaltyDateRangePickerProps {
  selectedRange: LoyaltyDateRange;
  onRangeChange: (newRange: LoyaltyDateRange) => void;
  disabled?: boolean;
  activityDates?: string[];
}

const PRESET_OPTIONS: Array<{ key: DateRangePreset; label: string; desc: string }> = [
  { key: "hoy", label: "Hoy", desc: "Día actual en Colombia" },
  { key: "ayer", label: "Ayer", desc: "Día anterior completo" },
  { key: "esta_semana", label: "Esta semana", desc: "De lunes a domingo" },
  { key: "este_mes", label: "Este mes", desc: "Mes calendario actual" },
  { key: "personalizado", label: "Personalizado", desc: "Seleccionar en calendario" }
];

export function LoyaltyDateRangePicker({
  selectedRange,
  onRangeChange,
  disabled = false,
  activityDates
}: LoyaltyDateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dynamic positioning state to ensure viewport containment
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const [maxHeight, setMaxHeight] = useState<number>(500);
  const [rightOffset, setRightOffset] = useState<number>(0);

  // Active preset in dialog
  const [activePreset, setActivePreset] = useState<DateRangePreset>(selectedRange.preset);

  // Draft start and end dates (YYYY-MM-DD)
  const [draftStart, setDraftStart] = useState<string>(selectedRange.startDate);
  const [draftEnd, setDraftEnd] = useState<string>(selectedRange.endDate);

  // State when user is in the middle of clicking a 2-step range
  const [isSelectingRange, setIsSelectingRange] = useState(false);

  // Canonical activity set
  const activitySet = useMemo(() => new Set(activityDates || []), [activityDates]);

  // Month and year currently shown in the calendar view (month is 0-indexed)
  const [viewDate, setViewDate] = useState<{ year: number; month: number }>(() => {
    const [y, m] = selectedRange.startDate.split("-").map(Number);
    return { year: y || 2026, month: m ? m - 1 : 8 };
  });

  const todayYmd = useMemo(() => getBogotaToday(), []);

  // Viewport adaptation and flip positioning calculation
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    // Available space above and below (leaving 12px margin to viewport edge)
    const spaceBelow = Math.max(0, vh - rect.bottom - 12);
    const spaceAbove = Math.max(0, rect.top - 12);
    const preferredHeight = 490;

    let newPlacement: "bottom" | "top" = "bottom";
    let availableVertical = spaceBelow;

    // Flip to top if space below is constrained and space above has more room
    if (spaceBelow < preferredHeight && spaceAbove > spaceBelow) {
      newPlacement = "top";
      availableVertical = spaceAbove;
    }

    // Maximum height bounded between 260px and available space
    const computedMaxHeight = Math.max(260, Math.min(availableVertical, vh - 24));

    // Horizontal containment within viewport margins [12px, vw - 12px]
    const popoverWidth = Math.min(560, vw - 24);
    let newRightOffset = 0;
    const leftEdge = rect.right - popoverWidth;

    if (leftEdge < 12) {
      newRightOffset = -(12 - leftEdge);
    } else if (rect.right > vw - 12) {
      newRightOffset = rect.right - (vw - 12);
    }

    setPlacement(newPlacement);
    setMaxHeight(computedMaxHeight);
    setRightOffset(newRightOffset);
  }, []);

  // When opening, synchronize draft values with currently applied range
  const handleToggleOpen = () => {
    if (disabled) return;
    if (!isOpen) {
      setDraftStart(selectedRange.startDate);
      setDraftEnd(selectedRange.endDate);
      setActivePreset(selectedRange.preset);
      setIsSelectingRange(false);
      const [y, m] = selectedRange.startDate.split("-").map(Number);
      setViewDate({ year: y || 2026, month: m ? m - 1 : 8 });
      updatePosition();
    }
    setIsOpen((prev) => !prev);
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsSelectingRange(false);
  };

  // Click outside and Escape key handling
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Window resize and scroll handling to keep popover safely inside viewport
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();
    window.addEventListener("resize", updatePosition, { passive: true });
    window.addEventListener("scroll", updatePosition, { passive: true });

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [isOpen, updatePosition]);

  // Month navigation
  const handlePrevMonth = () => {
    setViewDate((prev) => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const handleNextMonth = () => {
    setViewDate((prev) => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  // Calendar cells for currently viewed month
  const calendarCells = useMemo(() => {
    return buildCalendarDays(viewDate.year, viewDate.month);
  }, [viewDate.year, viewDate.month]);

  // Handle preset selection
  const handleSelectPreset = (preset: DateRangePreset) => {
    if (preset === "personalizado") {
      setActivePreset("personalizado");
      setIsSelectingRange(false);
      return;
    }
    const computed = computeDateRange(preset);
    setActivePreset(preset);
    setDraftStart(computed.startDate);
    setDraftEnd(computed.endDate);
    setIsSelectingRange(false);

    // Navigate calendar view to start date of preset
    const [y, m] = computed.startDate.split("-").map(Number);
    setViewDate({ year: y, month: m - 1 });
  };

  // Handle day click on the calendar
  const handleDayClick = (ymd: string) => {
    setActivePreset("personalizado");

    if (!isSelectingRange) {
      // First click: sets both start and end to this day (single-day selection or start of range)
      setDraftStart(ymd);
      setDraftEnd(ymd);
      setIsSelectingRange(true);
    } else {
      // Second click: completes range selection
      if (ymd < draftStart) {
        // User clicked a day before the start: make clicked date start, previous start end
        setDraftEnd(draftStart);
        setDraftStart(ymd);
      } else {
        setDraftEnd(ymd);
      }
      setIsSelectingRange(false);
    }
  };

  // Compute live preview range for display
  const previewRange = useMemo(() => {
    return computeDateRange(activePreset, draftStart, draftEnd);
  }, [activePreset, draftStart, draftEnd]);

  // Apply changes
  const handleApply = () => {
    onRangeChange(previewRange);
    setIsOpen(false);
    setIsSelectingRange(false);
  };

  const monthLabel = `${SPANISH_MONTH_FULL[viewDate.month]} ${viewDate.year}`;

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

      {/* DROPDOWN / CALENDAR POPOVER */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Selector de período y calendario interactivo"
          style={{
            position: "absolute",
            ...(placement === "top"
              ? { bottom: "calc(100% + 8px)", top: "auto" }
              : { top: "calc(100% + 8px)", bottom: "auto" }),
            right: `${rightOffset}px`,
            zIndex: 1000,
            width: "560px",
            maxWidth: "calc(100vw - 24px)",
            maxHeight: `${maxHeight}px`,
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#161619",
            border: "1px solid rgba(216, 181, 109, 0.35)",
            borderRadius: "14px",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.8), 0 0 24px rgba(216, 181, 109, 0.15)",
            backdropFilter: "blur(16px)",
            overflow: "hidden"
          }}
        >
          {/* 1. Header (Fixed at top of dialog, never scrolls away) */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 16px 10px 16px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Clock size={15} color="#d8b56d" />
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#d8b56d",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em"
                }}
              >
                Filtrar por período
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "11px", color: "var(--muted, #9ca3af)" }}>Bogotá (UTC-5)</span>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Cerrar selector"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--muted, #9ca3af)",
                  cursor: "pointer",
                  padding: "2px",
                  display: "inline-flex",
                  alignItems: "center"
                }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* 2. Scrollable Body (Internal scroll when height is constrained) */}
          <div
            style={{
              flex: "1 1 auto",
              overflowY: "auto",
              overflowX: "hidden",
              padding: "14px 16px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: "16px",
              alignItems: "start",
              overscrollBehavior: "contain"
            }}
          >
            {/* Presets Column */}
            <div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--muted, #9ca3af)",
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em"
                }}
              >
                Accesos rápidos
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {PRESET_OPTIONS.map((opt) => {
                  const isSelected = activePreset === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      data-preset={opt.key}
                      onClick={() => handleSelectPreset(opt.key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: isSelected ? 600 : 500,
                        backgroundColor: isSelected ? "rgba(216, 181, 109, 0.16)" : "transparent",
                        color: isSelected ? "#d8b56d" : "#e5e7eb",
                        border: `1px solid ${isSelected ? "rgba(216, 181, 109, 0.35)" : "transparent"}`,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.12s ease"
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
                        <div style={{ fontSize: "11px", color: "var(--muted, #9ca3af)", marginTop: "1px" }}>
                          {opt.desc}
                        </div>
                      </div>
                      {isSelected && <Check size={15} color="#d8b56d" />}
                    </button>
                  );
                })}
              </div>

              {/* Instructions hint */}
              <div
                style={{
                  marginTop: "12px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  fontSize: "11px",
                  color: "var(--muted, #9ca3af)",
                  lineHeight: "1.4"
                }}
              >
                {isSelectingRange ? (
                  <span style={{ color: "#d8b56d" }}>
                    ● Haz clic en la <strong>fecha final</strong> del rango.
                  </span>
                ) : (
                  <span>
                    💡 Haz clic en un día para seleccionarlo, o dos días para definir un rango.
                  </span>
                )}
              </div>
            </div>

            {/* Interactive Calendar Column */}
            <div
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.25)",
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid rgba(255, 255, 255, 0.08)"
              }}
            >
              {/* Calendar Month & Navigation */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px"
                }}
              >
                <button
                  type="button"
                  data-testid="prev-month"
                  onClick={handlePrevMonth}
                  aria-label="Mes anterior"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    color: "#e5e7eb",
                    cursor: "pointer",
                    transition: "all 0.12s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(216, 181, 109, 0.15)";
                    e.currentTarget.style.color = "#d8b56d";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.04)";
                    e.currentTarget.style.color = "#e5e7eb";
                  }}
                >
                  <ChevronLeft size={16} />
                </button>

                <span
                  data-testid="month-label"
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#fff",
                    letterSpacing: "-0.01em"
                  }}
                >
                  {monthLabel}
                </span>

                <button
                  type="button"
                  data-testid="next-month"
                  onClick={handleNextMonth}
                  aria-label="Mes siguiente"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    color: "#e5e7eb",
                    cursor: "pointer",
                    transition: "all 0.12s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(216, 181, 109, 0.15)";
                    e.currentTarget.style.color = "#d8b56d";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.04)";
                    e.currentTarget.style.color = "#e5e7eb";
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Day of Week Headers */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: "2px",
                  textAlign: "center",
                  marginBottom: "4px"
                }}
              >
                {DAYS_OF_WEEK_SHORT.map((day) => (
                  <span
                    key={`head-${day}`}
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--muted, #9ca3af)",
                      padding: "4px 0"
                    }}
                  >
                    {day}
                  </span>
                ))}
              </div>

              {/* Day Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: "2px",
                  textAlign: "center"
                }}
              >
                {calendarCells.map((cell) => {
                  if (cell.day === null || !cell.ymd) {
                    return <div key={cell.key} style={{ minHeight: "34px" }} />;
                  }

                  const ymd = cell.ymd;
                  const isStart = ymd === draftStart;
                  const isEnd = ymd === draftEnd;
                  const isSingle = isStart && isEnd;
                  const isInRange = draftStart && draftEnd && ymd > draftStart && ymd < draftEnd;
                  const isToday = ymd === todayYmd;
                  const hasActivity = activitySet.has(ymd);

                  let bgColor = "transparent";
                  let textColor = "#e5e7eb";
                  let fontWeight: number | string = 500;
                  let borderRadius = "6px";

                  if (isSingle) {
                    bgColor = "#d8b56d";
                    textColor = "#121214";
                    fontWeight = 700;
                    borderRadius = "6px";
                  } else if (isStart) {
                    bgColor = "#d8b56d";
                    textColor = "#121214";
                    fontWeight = 700;
                    borderRadius = "6px 0 0 6px";
                  } else if (isEnd) {
                    bgColor = "#d8b56d";
                    textColor = "#121214";
                    fontWeight = 700;
                    borderRadius = "0 6px 6px 0";
                  } else if (isInRange) {
                    bgColor = "rgba(216, 181, 109, 0.22)";
                    textColor = "#d8b56d";
                    fontWeight = 600;
                    borderRadius = "0";
                  }

                  return (
                    <button
                      key={cell.key}
                      type="button"
                      data-date={ymd}
                      onClick={() => handleDayClick(ymd)}
                      style={{
                        minHeight: "34px",
                        position: "relative",
                        display: "inline-flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: bgColor,
                        color: textColor,
                        fontWeight,
                        fontSize: "12px",
                        borderRadius,
                        border: isToday && !isStart && !isEnd && !isInRange
                          ? "1px solid rgba(16, 185, 129, 0.7)"
                          : "1px solid transparent",
                        cursor: "pointer",
                        transition: "background-color 0.1s ease",
                        outline: "none",
                        padding: "2px 0"
                      }}
                      onMouseEnter={(e) => {
                        if (!isStart && !isEnd && !isInRange) {
                          e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isStart && !isEnd && !isInRange) {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      <span>{cell.day}</span>
                      {hasActivity && (
                        <span
                          data-activity="true"
                          title="Actividad canónica de lealtad en esta fecha"
                          style={{
                            display: "block",
                            width: "4px",
                            height: "4px",
                            borderRadius: "50%",
                            backgroundColor: isSingle || isStart || isEnd ? "#121214" : "#d8b56d",
                            marginTop: "1px"
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Sticky Footer: Selected Range Display + Action Buttons (flexShrink: 0) */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
              padding: "12px 16px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              backgroundColor: "#161619"
            }}
          >
            {/* Selected range display */}
            <div style={{ fontSize: "12px", color: "#e5e7eb", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "var(--muted, #9ca3af)" }}>Selección:</span>
              <strong data-testid="preview-range-label" style={{ color: "#d8b56d" }}>{previewRange.label}</strong>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                data-testid="cancel-range-btn"
                onClick={handleClose}
                style={{
                  padding: "7px 14px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                  color: "#d1d5db",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.06)";
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                data-testid="apply-range-btn"
                onClick={handleApply}
                style={{
                  padding: "7px 18px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  backgroundColor: "#d8b56d",
                  color: "#121214",
                  border: "none",
                  cursor: "pointer",
                  transition: "opacity 0.15s ease",
                  boxShadow: "0 2px 8px rgba(216, 181, 109, 0.3)"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "0.9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
