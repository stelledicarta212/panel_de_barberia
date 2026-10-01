"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Check,
  Clock,
  Edit2,
  Gift,
  History,
  Info,
  Plus,
  Power,
  RefreshCw,
  Scissors,
  Search,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Users,
  X
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { OffPeakManager } from "@/components/off-peak-manager";
import { useDashboard } from "@/store/dashboard-context";
import {
  fetchLoyaltySummary,
  updateLoyaltyConfigClient,
  createLoyaltyRewardClient,
  updateLoyaltyRewardClient,
  redeemLoyaltyRewardClient
} from "@/lib/loyalty-client";
import { LoyaltyDateRangePicker } from "@/components/loyalty-date-range-picker";
import {
  type LoyaltyDateRange,
  computeDateRange,
  isDateInRange,
  isoToBogotaYmd
} from "@/lib/loyalty-date";
import type {
  LoyaltyConfig,
  LoyaltyReward,
  LoyaltyBalance,
  LoyaltyLedgerEntry,
  LoyaltyRedemption
} from "@/types/loyalty";

type LoyaltyTab = "clientes" | "recompensas" | "tiempos_muertos" | "configuracion" | "historial";
type ClientFilterMode = "periodo" | "listos" | "todos";
type HistoryFilterMode = "todos" | "acumulaciones" | "canjes";

export default function ProgramaLealtadPage() {
  const { identity, access, merged } = useDashboard();
  const barberiaId = identity?.barberia_id ?? null;
  const searchInputId = useId();

  // Role resolution
  const isOwnerOrAdmin = access.role === "owner" || access.role === "admin" || access.role === "super_admin";
  const isCajero = access.role === "cajero";
  const canRedeem = isOwnerOrAdmin || isCajero;

  // Navigation tab (cajero lands directly on operational 'clientes' tab)
  const [activeTab, setActiveTab] = useState<LoyaltyTab>("clientes");
  const [offPeakRulesCount, setOffPeakRulesCount] = useState<number>(0);

  // Canonical state loaded from PostgreSQL API
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [config, setConfig] = useState<LoyaltyConfig | null>(null);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [balances, setBalances] = useState<LoyaltyBalance[]>([]);
  const [ledger, setLedger] = useState<LoyaltyLedgerEntry[]>([]);
  const [redemptions, setRedemptions] = useState<LoyaltyRedemption[]>([]);

  // Tab A: Clientes & Canjes state (Default operational mode is period-driven)
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState<ClientFilterMode>("periodo");

  // Safe 2-Step Redemption Modal state
  const [selectedClientForRedeem, setSelectedClientForRedeem] = useState<LoyaltyBalance | null>(null);
  const [selectedRewardId, setSelectedRewardId] = useState<number | null>(null);
  const [redeemNotas, setRedeemNotas] = useState("");
  const [redeemStep, setRedeemStep] = useState<1 | 2>(1);
  const [redeeming, setRedeeming] = useState(false);

  // Tab B: Rewards Catalog state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRewardNombre, setNewRewardNombre] = useState("");
  const [newRewardCosto, setNewRewardCosto] = useState<number>(8);
  const [newRewardDesc, setNewRewardDesc] = useState("");
  const [creatingReward, setCreatingReward] = useState(false);

  const [rewardToEdit, setRewardToEdit] = useState<LoyaltyReward | null>(null);
  const [editRewardNombre, setEditRewardNombre] = useState("");
  const [editRewardCosto, setEditRewardCosto] = useState<number>(8);
  const [editRewardDesc, setEditRewardDesc] = useState("");
  const [savingEditReward, setSavingEditReward] = useState(false);

  const [rewardToDeactivate, setRewardToDeactivate] = useState<LoyaltyReward | null>(null);
  const [deactivatingReward, setDeactivatingReward] = useState(false);

  // Tab C: Configuration state
  const [formActivo, setFormActivo] = useState(false);
  const [formSellosRequeridos, setFormSellosRequeridos] = useState(10);
  const [formRecompensaDefault, setFormRecompensaDefault] = useState("Corte Gratis");
  const [savingConfig, setSavingConfig] = useState(false);
  const [showProgramDeactivateModal, setShowProgramDeactivateModal] = useState(false);

  // Tab D: History state
  const [historyFilter, setHistoryFilter] = useState<HistoryFilterMode>("todos");

  // Date range filter state (America/Bogota)
  const [dateRange, setDateRange] = useState<LoyaltyDateRange>(() => computeDateRange("hoy"));

  // Load canonical data
  const loadSummary = useCallback(
    async (rangeToUse?: LoyaltyDateRange) => {
      setLoading(true);
      setError(null);
      const activeRange = rangeToUse ?? dateRange;
      try {
        const queryRange = activeRange
          ? { from: activeRange.startIso, to: activeRange.endIso }
          : undefined;
        const data = await fetchLoyaltySummary(barberiaId, queryRange);
        if (data.config) {
          setConfig(data.config);
          setFormActivo(data.config.activo);
          setFormSellosRequeridos(data.config.sellos_requeridos);
          setFormRecompensaDefault(data.config.recompensa_default);
        } else {
          setConfig(null);
          setFormActivo(false);
          setFormSellosRequeridos(10);
          setFormRecompensaDefault("Corte Gratis");
        }
        setRewards(data.rewards || []);
        setBalances(data.balances || []);
        setLedger(data.ledger || []);
        setRedemptions(data.redemptions || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error cargando información canónica de lealtad");
      } finally {
        setLoading(false);
      }
    },
    [barberiaId, dateRange]
  );

  useEffect(() => {
    let ignore = false;
    const queryRange = dateRange
      ? { from: dateRange.startIso, to: dateRange.endIso }
      : undefined;

    fetchLoyaltySummary(barberiaId, queryRange)
      .then((data) => {
        if (ignore) return;
        if (data.config) {
          setConfig(data.config);
          setFormActivo(data.config.activo);
          setFormSellosRequeridos(data.config.sellos_requeridos);
          setFormRecompensaDefault(data.config.recompensa_default);
        } else {
          setConfig(null);
          setFormActivo(false);
          setFormSellosRequeridos(10);
          setFormRecompensaDefault("Corte Gratis");
        }
        setRewards(data.rewards || []);
        setBalances(data.balances || []);
        setLedger(data.ledger || []);
        setRedemptions(data.redemptions || []);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Error cargando información canónica de lealtad");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [barberiaId, dateRange]);

  // Canonical loyalty activity dates for authenticated tenant (Section: Source-of-truth)
  const canonicalActivityDates = useMemo(() => {
    const dates = new Set<string>();
    for (const entry of ledger) {
      if (entry.created_at) {
        const ymd = isoToBogotaYmd(entry.created_at);
        if (ymd) dates.add(ymd);
      }
    }
    for (const r of redemptions) {
      if (r.created_at) {
        const ymd = isoToBogotaYmd(r.created_at);
        if (ymd) dates.add(ymd);
      }
    }
    return Array.from(dates);
  }, [ledger, redemptions]);

  // Active rewards sorted ascending by cost (with canonical config fallback)
  const sortedActiveRewards = useMemo(() => {
    const list = rewards.filter((r) => r.activo);
    if (list.length > 0) {
      return [...list].sort((a, b) => a.costo_en_sellos - b.costo_en_sellos);
    }
    if (config) {
      return [
        {
          id: 0,
          barberia_id: config.barberia_id,
          nombre: config.recompensa_default || "Corte Gratis",
          costo_en_sellos: config.sellos_requeridos || 10,
          descripcion: "Recompensa principal",
          activo: config.activo,
          created_at: config.created_at,
          updated_at: config.updated_at
        }
      ];
    }
    return [];
  }, [rewards, config]);

  // Dynamic progress & eligibility helper (Section 18)
  const resolveClientProgress = useCallback(
    (balance: number) => {
      const affordable = sortedActiveRewards.filter((r) => r.costo_en_sellos <= balance);
      const next = sortedActiveRewards.find((r) => r.costo_en_sellos > balance);
      const highestAffordable = affordable.length > 0 ? affordable[affordable.length - 1] : null;
      const isEligible = affordable.length > 0;

      let progressPercent = 0;
      let statusText = "Sin sellos";
      let statusType: "eligible" | "progress" | "zero" | "none" = "zero";

      if (sortedActiveRewards.length === 0) {
        statusType = "none";
        statusText = "Sin recompensas activas";
        progressPercent = 0;
      } else if (isEligible) {
        statusType = "eligible";
        statusText = `¡Recompensa lista! (${highestAffordable?.nombre} — ${highestAffordable?.costo_en_sellos} sellos)`;
        progressPercent = next
          ? Math.min(100, Math.round(((balance / next.costo_en_sellos) * 100) * 10) / 10)
          : 100;
      } else if (balance > 0 && next) {
        statusType = "progress";
        const rawPct = (balance / next.costo_en_sellos) * 100;
        progressPercent = Math.min(100, Math.round(rawPct * 10) / 10);
        statusText = `${balance} / ${next.costo_en_sellos} sellos (faltan ${next.costo_en_sellos - balance} para ${next.nombre})`;
      } else {
        statusType = "zero";
        statusText = next ? `0 / ${next.costo_en_sellos} sellos para ${next.nombre}` : "0 sellos";
        progressPercent = 0;
      }

      return {
        isEligible,
        affordable,
        highestAffordable,
        nextReward: next || null,
        progressPercent,
        statusText,
        statusType
      };
    },
    [sortedActiveRewards]
  );

  // Build tenant canonical client directory from dashboard context (clientes & citas)
  const tenantClientMap = useMemo(() => {
    const map = new Map<number, { nombre: string; telefono?: string }>();

    // 1. Ingest canonical clients from dashboard context
    (merged.clients || []).forEach((c) => {
      const rawId = Number(c.id ?? c.cliente_id ?? 0);
      const name = String(c.nombre ?? c.nombre_completo ?? c.name ?? "").trim();
      const phone = String(c.telefono ?? c.phone ?? "").trim() || undefined;
      if (Number.isFinite(rawId) && rawId > 0 && name && !name.toLowerCase().startsWith("cliente #")) {
        const existing = map.get(rawId);
        map.set(rawId, {
          nombre: name,
          telefono: phone || existing?.telefono
        });
      }
    });

    // 2. Ingest canonical appointments from dashboard context
    (merged.appointments || []).forEach((a) => {
      const rawId = Number(a.cliente_id ?? a.id_cliente ?? 0);
      const name = String(a.cliente_nombre ?? a.nombre_cliente ?? a.client ?? "").trim();
      const phone = String(a.cliente_tel ?? a.telefono ?? a.phone ?? "").trim() || undefined;
      if (Number.isFinite(rawId) && rawId > 0 && name && !name.toLowerCase().startsWith("cliente #")) {
        const existing = map.get(rawId);
        map.set(rawId, {
          nombre: existing?.nombre || name,
          telefono: existing?.telefono || phone
        });
      }
    });

    return map;
  }, [merged.clients, merged.appointments]);

  // Secondary lookup index by phone digits (min 7 digits)
  const tenantPhoneMap = useMemo(() => {
    const map = new Map<string, { nombre: string; telefono?: string }>();
    for (const meta of tenantClientMap.values()) {
      if (meta.telefono) {
        const digits = meta.telefono.replace(/\D/g, "");
        if (digits.length >= 7) {
          map.set(digits, meta);
        }
      }
    }
    return map;
  }, [tenantClientMap]);

  // Resolved balances: Enrich with canonical identity, fallback defensively to Cliente #<id>
  const resolvedBalances = useMemo(() => {
    return balances.map((b) => {
      let meta = tenantClientMap.get(b.cliente_id);
      if (!meta && b.cliente_telefono) {
        const digits = b.cliente_telefono.replace(/\D/g, "");
        if (digits.length >= 7) {
          meta = tenantPhoneMap.get(digits);
        }
      }

      const hasCanonicalName = b.cliente_nombre && !b.cliente_nombre.toLowerCase().startsWith("cliente #");
      const resolvedNombre = hasCanonicalName
        ? b.cliente_nombre
        : (meta?.nombre || b.cliente_nombre || `Cliente #${b.cliente_id}`);
      const resolvedTelefono = b.cliente_telefono || meta?.telefono || null;

      return {
        ...b,
        cliente_nombre: resolvedNombre,
        cliente_telefono: resolvedTelefono
      };
    });
  }, [balances, tenantClientMap, tenantPhoneMap]);

  // Resolved ledger: Enrich with canonical client names
  const resolvedLedger = useMemo(() => {
    return ledger.map((entry) => {
      const meta = tenantClientMap.get(entry.cliente_id);
      const hasCanonicalName = entry.cliente_nombre && !entry.cliente_nombre.toLowerCase().startsWith("cliente #");
      const resolvedNombre = hasCanonicalName
        ? entry.cliente_nombre
        : (meta?.nombre || entry.cliente_nombre || `Cliente #${entry.cliente_id}`);
      return {
        ...entry,
        cliente_nombre: resolvedNombre
      };
    });
  }, [ledger, tenantClientMap]);

  // Resolved redemptions: Enrich with canonical client names
  const resolvedRedemptions = useMemo(() => {
    return redemptions.map((red) => {
      const meta = tenantClientMap.get(red.cliente_id);
      const hasCanonicalName = red.cliente_nombre && !red.cliente_nombre.toLowerCase().startsWith("cliente #");
      const resolvedNombre = hasCanonicalName
        ? red.cliente_nombre
        : (meta?.nombre || red.cliente_nombre || `Cliente #${red.cliente_id}`);
      return {
        ...red,
        cliente_nombre: resolvedNombre
      };
    });
  }, [redemptions, tenantClientMap]);

  // Date-filtered ledger and redemptions (guarantees [startIso, endIso) half-open interval)
  const periodLedger = useMemo(() => {
    return resolvedLedger.filter((l) => isDateInRange(l.created_at, dateRange));
  }, [resolvedLedger, dateRange]);

  const periodRedemptions = useMemo(() => {
    return resolvedRedemptions.filter((r) => isDateInRange(r.created_at, dateRange));
  }, [resolvedRedemptions, dateRange]);

  // Set of clients with canonical loyalty activity in the selected period
  const periodClientIds = useMemo(() => {
    const ids = new Set<number>();
    for (const l of periodLedger) {
      ids.add(l.cliente_id);
    }
    for (const r of periodRedemptions) {
      ids.add(r.cliente_id);
    }
    return ids;
  }, [periodLedger, periodRedemptions]);

  // KPI 1: Clientes Participantes (active within selected period)
  const kpiPeriodParticipants = periodClientIds.size;

  // Filtered customer list: Period-driven by default, full-tenant search preserved
  const filteredBalances = useMemo(() => {
    const normalize = (str: string) =>
      str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const term = normalize(customerSearch);
    const rawDigits = customerSearch.replace(/\D/g, "");
    const isSearching = Boolean(term);

    return resolvedBalances.filter((b) => {
      const progress = resolveClientProgress(b.saldo_sellos);
      const isPeriodActive = periodClientIds.has(b.cliente_id);

      // Search mode: Searches across the full tenant customer directory
      if (isSearching) {
        const matchName = normalize(b.cliente_nombre).includes(term);
        const matchPhone = b.cliente_telefono
          ? b.cliente_telefono.includes(customerSearch.trim()) ||
            (rawDigits.length >= 3 && b.cliente_telefono.replace(/\D/g, "").includes(rawDigits))
          : false;

        if (!matchName && !matchPhone) return false;

        if (customerFilter === "listos" && !progress.isEligible) {
          return false;
        }
        return true;
      }

      // Default operational mode (no search term typed):
      if (customerFilter === "periodo") {
        return isPeriodActive;
      }
      if (customerFilter === "listos") {
        return progress.isEligible;
      }
      if (customerFilter === "todos") {
        return true;
      }
      return isPeriodActive;
    });
  }, [resolvedBalances, customerFilter, customerSearch, periodClientIds, resolveClientProgress]);

  // KPI 2: Sellos en Circulación (stock) & Period flow
  const kpiStampsInCirculation = useMemo(() => {
    return resolvedBalances.reduce((sum, b) => sum + b.saldo_sellos, 0);
  }, [resolvedBalances]);

  const periodStampsEmitted = useMemo(() => {
    return periodLedger
      .filter((l) => l.delta > 0)
      .reduce((sum, l) => sum + l.delta, 0);
  }, [periodLedger]);

  const periodStampsRedeemed = useMemo(() => {
    return periodLedger
      .filter((l) => l.delta < 0)
      .reduce((sum, l) => sum + Math.abs(l.delta), 0);
  }, [periodLedger]);

  // KPI 3: Canjes Realizados (in period)
  const kpiPeriodRedemptions = periodRedemptions.length;

  // KPI 4: Listos para Canje (current snapshot of eligible clients)
  const kpiEligibleClients = useMemo(() => {
    if (sortedActiveRewards.length === 0) return 0;
    return resolvedBalances.filter((b) => sortedActiveRewards.some((r) => b.saldo_sellos >= r.costo_en_sellos)).length;
  }, [resolvedBalances, sortedActiveRewards]);

  // Selected reward in redemption modal
  const selectedRewardForRedeem = useMemo(() => {
    return sortedActiveRewards.find((r) => r.id === selectedRewardId) || null;
  }, [sortedActiveRewards, selectedRewardId]);

  const canAffordSelectedReward = useMemo(() => {
    if (!selectedClientForRedeem || !selectedRewardForRedeem) return false;
    return selectedClientForRedeem.saldo_sellos >= selectedRewardForRedeem.costo_en_sellos;
  }, [selectedClientForRedeem, selectedRewardForRedeem]);

  // Handle open redeem modal for client
  const handleOpenRedeemModal = (client: LoyaltyBalance) => {
    setSelectedClientForRedeem(client);
    setRedeemStep(1);
    setRedeemNotas("");
    // Default to the highest affordable reward or the first active reward
    const affordable = sortedActiveRewards.filter((r) => r.costo_en_sellos <= client.saldo_sellos);
    if (affordable.length > 0) {
      setSelectedRewardId(affordable[affordable.length - 1].id);
    } else {
      setSelectedRewardId(sortedActiveRewards[0]?.id || null);
    }
  };

  // Execute canonical redemption (Step 2 confirmation)
  const handleConfirmRedeem = async () => {
    if (!selectedClientForRedeem || selectedRewardId == null || !canAffordSelectedReward || redeeming) return;
    setRedeeming(true);
    setActionMessage(null);
    try {
      const res = await redeemLoyaltyRewardClient(
        selectedClientForRedeem.cliente_id,
        selectedRewardId,
        null,
        redeemNotas.trim() || undefined,
        barberiaId
      );
      if (res.success || (res as unknown as { ok?: boolean }).ok) {
        setActionMessage({
          type: "success",
          text: `Canje exitoso de '${res.reward_nombre || "recompensa"}' para ${selectedClientForRedeem.cliente_nombre}. Saldo restante: ${res.saldo_restante} sellos.`
        });
        setSelectedClientForRedeem(null);
        setSelectedRewardId(null);
        setRedeemNotas("");
        setRedeemStep(1);
        await loadSummary();
      } else {
        setActionMessage({
          type: "error",
          text: res.message || "No se pudo realizar el canje en el sistema."
        });
      }
    } catch (err) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error al procesar el canje."
      });
    } finally {
      setRedeeming(false);
    }
  };

  // Handle create reward
  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerOrAdmin || creatingReward) return;
    const name = newRewardNombre.trim();
    const cost = Number(newRewardCosto);
    if (!name || cost <= 0) return;
    setCreatingReward(true);
    setActionMessage(null);
    try {
      await createLoyaltyRewardClient(
        {
          nombre: name,
          costo_en_sellos: cost,
          descripcion: newRewardDesc.trim() || undefined
        },
        barberiaId
      );
      setNewRewardNombre("");
      setNewRewardCosto(8);
      setNewRewardDesc("");
      setShowCreateModal(false);
      setActionMessage({ type: "success", text: `Recompensa '${name}' creada exitosamente en el catálogo.` });
      await loadSummary();
    } catch (err) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error al crear la recompensa."
      });
    } finally {
      setCreatingReward(false);
    }
  };

  // Handle edit reward
  const handleOpenEditReward = (reward: LoyaltyReward) => {
    setRewardToEdit(reward);
    setEditRewardNombre(reward.nombre);
    setEditRewardCosto(reward.costo_en_sellos);
    setEditRewardDesc(reward.descripcion || "");
  };

  const handleSaveEditReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rewardToEdit || !isOwnerOrAdmin || savingEditReward) return;
    const name = editRewardNombre.trim();
    const cost = Number(editRewardCosto);
    if (!name || cost <= 0) return;
    setSavingEditReward(true);
    setActionMessage(null);
    try {
      await updateLoyaltyRewardClient(
        rewardToEdit.id,
        {
          nombre: name,
          costo_en_sellos: cost,
          descripcion: editRewardDesc.trim() || undefined
        },
        barberiaId
      );
      setActionMessage({ type: "success", text: `Recompensa '${name}' actualizada exitosamente.` });
      setRewardToEdit(null);
      await loadSummary();
    } catch (err) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error actualizando la recompensa."
      });
    } finally {
      setSavingEditReward(false);
    }
  };

  // Handle soft-deactivate reward
  const handleConfirmDeactivateReward = async () => {
    if (!rewardToDeactivate || !isOwnerOrAdmin || deactivatingReward) return;
    setDeactivatingReward(true);
    setActionMessage(null);
    try {
      await updateLoyaltyRewardClient(rewardToDeactivate.id, { activo: false }, barberiaId);
      setActionMessage({
        type: "success",
        text: `Recompensa '${rewardToDeactivate.nombre}' desactivada correctamente. Los canjes históricos se conservan.`
      });
      setRewardToDeactivate(null);
      await loadSummary();
    } catch (err) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error al desactivar la recompensa."
      });
    } finally {
      setDeactivatingReward(false);
    }
  };

  // Handle reactivate reward
  const handleReactivateReward = async (reward: LoyaltyReward) => {
    if (!isOwnerOrAdmin) return;
    setActionMessage(null);
    try {
      await updateLoyaltyRewardClient(reward.id, { activo: true }, barberiaId);
      setActionMessage({
        type: "success",
        text: `Recompensa '${reward.nombre}' reactivada en el catálogo.`
      });
      await loadSummary();
    } catch (err) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error al reactivar la recompensa."
      });
    }
  };

  // Handle save configuration
  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isOwnerOrAdmin || savingConfig) return;
    setSavingConfig(true);
    setActionMessage(null);
    try {
      const res = await updateLoyaltyConfigClient(
        {
          activo: formActivo,
          sellos_requeridos: Number(formSellosRequeridos),
          recompensa_default: formRecompensaDefault
        },
        barberiaId
      );
      setConfig(res.config);
      setActionMessage({ type: "success", text: "Configuración del programa guardada correctamente en PostgreSQL." });
      await loadSummary();
    } catch (err) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error al guardar la configuración."
      });
    } finally {
      setSavingConfig(false);
    }
  };

  // Filtered ledger entries (uses periodLedger to respect selected date range)
  const filteredLedger = useMemo(() => {
    if (historyFilter === "todos") return periodLedger;
    if (historyFilter === "acumulaciones") return periodLedger.filter((l) => l.tipo_movimiento === "acumulacion");
    if (historyFilter === "canjes") return periodLedger.filter((l) => l.tipo_movimiento === "canje");
    return periodLedger;
  }, [periodLedger, historyFilter]);

  // Keyboard accessibility for modals (Escape key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedClientForRedeem && !redeeming) setSelectedClientForRedeem(null);
        if (showCreateModal && !creatingReward) setShowCreateModal(false);
        if (rewardToEdit && !savingEditReward) setRewardToEdit(null);
        if (rewardToDeactivate && !deactivatingReward) setRewardToDeactivate(null);
        if (showProgramDeactivateModal && !savingConfig) setShowProgramDeactivateModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedClientForRedeem,
    redeeming,
    showCreateModal,
    creatingReward,
    rewardToEdit,
    savingEditReward,
    rewardToDeactivate,
    deactivatingReward,
    showProgramDeactivateModal,
    savingConfig
  ]);

  return (
    <DashboardShell>
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 12px 32px" }}>
        {/* HEADER SECTION (Section 7) */}
        <header
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
            <h1
              style={{
                margin: 0,
                fontSize: "26px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              Programa de Lealtad <Sparkles size={20} color="#d8b56d" />
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted, #9ca3af)" }}>
              Gestiona sellos, catálogo de recompensas y canjes de clientes con fuentes canónicas.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Status Pill with icon and high contrast (Canonical Truth-in-UI) */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 600,
                backgroundColor: !config
                  ? "rgba(107, 114, 128, 0.2)"
                  : config.activo
                  ? "rgba(16, 185, 129, 0.15)"
                  : "rgba(239, 68, 68, 0.15)",
                color: !config
                  ? "#9ca3af"
                  : config.activo
                  ? "#10b981"
                  : "#f87171",
                border: `1px solid ${
                  !config
                    ? "rgba(107, 114, 128, 0.4)"
                    : config.activo
                    ? "rgba(16, 185, 129, 0.4)"
                    : "rgba(239, 68, 68, 0.4)"
                }`
              }}
            >
              {!config ? (
                <AlertCircle size={14} />
              ) : config.activo ? (
                <BadgeCheck size={14} />
              ) : (
                <AlertCircle size={14} />
              )}
              <span>
                {!config
                  ? "○ Programa no configurado"
                  : config.activo
                  ? "● Programa Activo"
                  : "○ Programa Inactivo"}
              </span>
            </div>

            {/* Date Range Selector (America/Bogota) */}
            <LoyaltyDateRangePicker
              selectedRange={dateRange}
              onRangeChange={setDateRange}
              disabled={loading}
              activityDates={canonicalActivityDates}
            />

            <button
              type="button"
              className="ba-btn-ghost"
              onClick={() => loadSummary(dateRange)}
              title="Actualizar datos canónicos"
              disabled={loading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                fontSize: "13px",
                borderRadius: "8px"
              }}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span>Actualizar</span>
            </button>
          </div>
        </header>

        {/* FEEDBACK BANNERS (Section 43: aria-live="polite") */}
        <div aria-live="polite">
          {actionMessage && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "8px",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                backgroundColor: actionMessage.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                color: actionMessage.type === "success" ? "#10b981" : "#ef4444",
                border: `1px solid ${actionMessage.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {actionMessage.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
                <span style={{ fontSize: "13px", fontWeight: 500 }}>{actionMessage.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionMessage(null)}
                style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: "2px" }}
              >
                <X size={14} />
              </button>
            </div>
          )}

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
                className="ba-card-gold"
                onClick={() => loadSummary(dateRange)}
                style={{ padding: "4px 12px", fontSize: "12px", borderRadius: "6px" }}
              >
                Reintentar
              </button>
            </div>
          )}
        </div>

        {/* CANONICAL KPI BAR (Section 10 & 11) */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
            marginBottom: "20px"
          }}
        >
          {/* KPI 1: Clientes Participantes */}
          <div className="ba-card" style={{ padding: "16px", borderRadius: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--muted, #9ca3af)", fontSize: "12px" }}>
              <span>Clientes Participantes</span>
              <Users size={16} color="#d8b56d" />
            </div>
            <div style={{ fontSize: "24px", fontWeight: 700, margin: "6px 0 2px", color: "#fff" }}>
              {loading && !resolvedBalances.length ? "..." : kpiPeriodParticipants.toLocaleString()}
            </div>
            <small style={{ color: "var(--muted, #9ca3af)", fontSize: "11px" }}>
              Activos en el período ({dateRange.label})
            </small>
          </div>

          {/* KPI 2: Sellos en Circulación */}
          <div className="ba-card" style={{ padding: "16px", borderRadius: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--muted, #9ca3af)", fontSize: "12px" }}>
              <span>Sellos en Circulación</span>
              <Scissors size={16} color="#10b981" />
            </div>
            <div style={{ fontSize: "24px", fontWeight: 700, margin: "6px 0 2px", color: "#10b981" }}>
              {loading && !resolvedBalances.length ? "..." : `✂ ${kpiStampsInCirculation.toLocaleString()}`}
            </div>
            <small style={{ color: "var(--muted, #9ca3af)", fontSize: "11px" }}>
              Saldo activo · Período: +{periodStampsEmitted} / -{periodStampsRedeemed}
            </small>
          </div>

          {/* KPI 3: Canjes Realizados */}
          <div className="ba-card" style={{ padding: "16px", borderRadius: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--muted, #9ca3af)", fontSize: "12px" }}>
              <span>Canjes Realizados</span>
              <Gift size={16} color="#f59e0b" />
            </div>
            <div style={{ fontSize: "24px", fontWeight: 700, margin: "6px 0 2px", color: "#f59e0b" }}>
              {loading && !redemptions.length ? "..." : kpiPeriodRedemptions.toLocaleString()}
            </div>
            <small style={{ color: "var(--muted, #9ca3af)", fontSize: "11px" }}>
              En el período ({dateRange.label})
            </small>
          </div>

          {/* KPI 4: Listos para Canje */}
          <div
            className="ba-card"
            style={{
              padding: "16px",
              borderRadius: "10px",
              border: kpiEligibleClients > 0 ? "1px solid rgba(216, 181, 109, 0.4)" : undefined,
              background: kpiEligibleClients > 0 ? "radial-gradient(circle at 90% 10%, rgba(216, 181, 109, 0.12), transparent 40%)" : undefined
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--muted, #9ca3af)", fontSize: "12px" }}>
              <span>Listos para Canje</span>
              <Sparkles size={16} color="#d8b56d" />
            </div>
            <div style={{ fontSize: "24px", fontWeight: 700, margin: "6px 0 2px", color: "#d8b56d" }}>
              {loading && !resolvedBalances.length ? "..." : kpiEligibleClients.toLocaleString()}
            </div>
            <small style={{ color: "var(--muted, #9ca3af)", fontSize: "11px" }}>
              Estado actual (con saldo para canjear)
            </small>
          </div>
        </section>

        {/* SEGMENTED NAVIGATION / TABS (Section 6 & 12) */}
        <nav
          role="tablist"
          aria-label="Secciones del programa de lealtad"
          style={{
            display: "flex",
            gap: "8px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            marginBottom: "20px",
            overflowX: "auto"
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "clientes"}
            onClick={() => setActiveTab("clientes")}
            style={{
              padding: "10px 16px",
              fontSize: "13px",
              fontWeight: 600,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "clientes" ? "2px solid #d8b56d" : "2px solid transparent",
              color: activeTab === "clientes" ? "#d8b56d" : "var(--muted, #9ca3af)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              whiteSpace: "nowrap"
            }}
          >
            <Users size={16} />
            <span>Clientes & Canjes</span>
            <span
              style={{
                fontSize: "11px",
                padding: "2px 6px",
                borderRadius: "10px",
                backgroundColor: activeTab === "clientes" ? "rgba(216, 181, 109, 0.2)" : "rgba(255, 255, 255, 0.05)"
              }}
            >
              {customerSearch.trim()
                ? filteredBalances.length
                : customerFilter === "periodo"
                ? kpiPeriodParticipants
                : customerFilter === "listos"
                ? kpiEligibleClients
                : resolvedBalances.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "recompensas"}
            onClick={() => setActiveTab("recompensas")}
            style={{
              padding: "10px 16px",
              fontSize: "13px",
              fontWeight: 600,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "recompensas" ? "2px solid #d8b56d" : "2px solid transparent",
              color: activeTab === "recompensas" ? "#d8b56d" : "var(--muted, #9ca3af)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              whiteSpace: "nowrap"
            }}
          >
            <Gift size={16} />
            <span>Catálogo de Recompensas</span>
            <span
              style={{
                fontSize: "11px",
                padding: "2px 6px",
                borderRadius: "10px",
                backgroundColor: activeTab === "recompensas" ? "rgba(216, 181, 109, 0.2)" : "rgba(255, 255, 255, 0.05)"
              }}
            >
              {rewards.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "tiempos_muertos"}
            onClick={() => setActiveTab("tiempos_muertos")}
            style={{
              padding: "10px 16px",
              fontSize: "13px",
              fontWeight: 600,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "tiempos_muertos" ? "2px solid #d8b56d" : "2px solid transparent",
              color: activeTab === "tiempos_muertos" ? "#d8b56d" : "var(--muted, #9ca3af)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              whiteSpace: "nowrap"
            }}
          >
            <Clock size={16} />
            <span>Tiempos Muertos</span>
            <span
              style={{
                fontSize: "11px",
                padding: "2px 6px",
                borderRadius: "10px",
                backgroundColor: activeTab === "tiempos_muertos" ? "rgba(216, 181, 109, 0.2)" : "rgba(255, 255, 255, 0.05)"
              }}
            >
              {offPeakRulesCount}
            </span>
          </button>

          {isOwnerOrAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "configuracion"}
              onClick={() => setActiveTab("configuracion")}
              style={{
                padding: "10px 16px",
                fontSize: "13px",
                fontWeight: 600,
                background: "transparent",
                border: "none",
                borderBottom: activeTab === "configuracion" ? "2px solid #d8b56d" : "2px solid transparent",
                color: activeTab === "configuracion" ? "#d8b56d" : "var(--muted, #9ca3af)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                whiteSpace: "nowrap"
              }}
            >
              <BadgeCheck size={16} />
              <span>Configuración</span>
            </button>
          )}

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "historial"}
            onClick={() => setActiveTab("historial")}
            style={{
              padding: "10px 16px",
              fontSize: "13px",
              fontWeight: 600,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "historial" ? "2px solid #d8b56d" : "2px solid transparent",
              color: activeTab === "historial" ? "#d8b56d" : "var(--muted, #9ca3af)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              whiteSpace: "nowrap"
            }}
          >
            <History size={16} />
            <span>Actividad Reciente</span>
          </button>
        </nav>

        {/* TAB A: CLIENTES & CANJES (PRIMARY OPERATIONAL WORKSPACE) */}
        {activeTab === "clientes" && (
          <div className="ba-card" style={{ padding: "20px", borderRadius: "12px" }}>
            {/* Filter & Search Bar Controls (Section 13 & 14) */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "20px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1 1 280px" }}>
                <label htmlFor={searchInputId} style={{ display: "flex", alignItems: "center", position: "relative", width: "100%" }}>
                  <Search size={16} style={{ position: "absolute", left: "12px", color: "var(--muted, #9ca3af)" }} />
                  <input
                    id={searchInputId}
                    type="text"
                    className="ba-input"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Buscar cliente por nombre o teléfono..."
                    style={{ paddingLeft: "36px", width: "100%", borderRadius: "8px" }}
                  />
                  {customerSearch && (
                    <button
                      type="button"
                      onClick={() => setCustomerSearch("")}
                      style={{
                        position: "absolute",
                        right: "10px",
                        background: "transparent",
                        border: "none",
                        color: "var(--muted, #9ca3af)",
                        cursor: "pointer"
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
              </div>

              {/* Eligibility Filter Pills (Section 15 & Phase 5) */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={customerFilter === "periodo" ? "ba-card-gold" : "ba-btn-ghost"}
                  onClick={() => setCustomerFilter("periodo")}
                  style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "6px" }}
                >
                  Con actividad ({kpiPeriodParticipants})
                </button>
                <button
                  type="button"
                  className={customerFilter === "listos" ? "ba-card-gold" : "ba-btn-ghost"}
                  onClick={() => setCustomerFilter("listos")}
                  style={{
                    padding: "6px 12px",
                    fontSize: "12px",
                    borderRadius: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <Sparkles size={12} />
                  <span>Listos para canje ({kpiEligibleClients})</span>
                </button>
                <button
                  type="button"
                  className={customerFilter === "todos" ? "ba-card-gold" : "ba-btn-ghost"}
                  onClick={() => setCustomerFilter("todos")}
                  style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "6px" }}
                >
                  Directorio completo ({resolvedBalances.length})
                </button>
              </div>
            </div>

            {/* Global Search Banner (Section: Phase 5) */}
            {customerSearch.trim() && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(216, 181, 109, 0.08)",
                  border: "1px solid rgba(216, 181, 109, 0.2)",
                  marginBottom: "16px",
                  fontSize: "12px",
                  color: "#d8b56d"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Search size={14} />
                  <span>
                    Búsqueda en directorio general: <strong>{filteredBalances.length}</strong> cliente(s) para &ldquo;{customerSearch}&rdquo;.
                    Se indica la actividad en el período <em>{dateRange.label}</em>.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomerSearch("")}
                  className="ba-btn-ghost"
                  style={{ fontSize: "11px", padding: "2px 8px" }}
                >
                  Limpiar búsqueda
                </button>
              </div>
            )}

            {/* Empty State */}
            {resolvedBalances.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--muted, #9ca3af)" }}>
                <Users size={32} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                <h3 style={{ margin: 0, fontSize: "15px", color: "#fff" }}>No hay clientes registrados aún</h3>
                <p style={{ margin: "6px 0 0", fontSize: "13px" }}>
                  Las citas cobradas con un cliente asociado acumularán automáticamente 1 sello por cita.
                </p>
              </div>
            ) : filteredBalances.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--muted, #9ca3af)" }}>
                {customerSearch.trim() ? (
                  <>
                    <Search size={28} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: "14px", color: "#fff" }}>
                      No se encontraron clientes para &ldquo;{customerSearch}&rdquo;.
                    </p>
                    <button
                      type="button"
                      className="ba-btn-ghost"
                      onClick={() => setCustomerSearch("")}
                      style={{ marginTop: "10px", fontSize: "12px", padding: "4px 10px" }}
                    >
                      Limpiar búsqueda
                    </button>
                  </>
                ) : customerFilter === "periodo" ? (
                  <>
                    <Users size={28} style={{ margin: "0 auto 8px", opacity: 0.5, color: "#d8b56d" }} />
                    <h3 style={{ margin: 0, fontSize: "15px", color: "#fff" }}>
                      Sin actividad de fidelización en {dateRange.label}
                    </h3>
                    <p style={{ margin: "6px 0 0", fontSize: "13px" }}>
                      No se registraron acumulaciones ni canjes en este rango de fechas.
                    </p>
                    <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "14px" }}>
                      <button
                        type="button"
                        className="ba-btn-ghost"
                        onClick={() => setCustomerFilter("todos")}
                        style={{ fontSize: "12px", padding: "6px 12px" }}
                      >
                        Ver directorio completo ({resolvedBalances.length})
                      </button>
                      {kpiEligibleClients > 0 && (
                        <button
                          type="button"
                          className="ba-card-gold"
                          onClick={() => setCustomerFilter("listos")}
                          style={{ fontSize: "12px", padding: "6px 12px" }}
                        >
                          Ver listos para canje ({kpiEligibleClients})
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Users size={28} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: "14px" }}>No se encontraron clientes para los filtros aplicados.</p>
                    <button
                      type="button"
                      className="ba-btn-ghost"
                      onClick={() => {
                        setCustomerSearch("");
                        setCustomerFilter("periodo");
                      }}
                      style={{ marginTop: "10px", fontSize: "12px", padding: "4px 10px" }}
                    >
                      Restablecer filtros
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                {/* DESKTOP TABLE (Section 16) */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.08)", textAlign: "left", color: "var(--muted, #9ca3af)" }}>
                        <th style={{ padding: "12px 10px" }}>CLIENTE</th>
                        <th style={{ padding: "12px 10px" }}>SALDO</th>
                        <th style={{ padding: "12px 10px", width: "35%" }}>PROGRESO / SIGUIENTE META</th>
                        <th style={{ padding: "12px 10px" }}>ESTADO</th>
                        <th style={{ padding: "12px 10px", textAlign: "right" }}>ACCIÓN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBalances.map((client) => {
                        const progress = resolveClientProgress(client.saldo_sellos);
                        return (
                          <tr
                            key={`client-${client.cliente_id}`}
                            style={{
                              borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                              backgroundColor: progress.isEligible ? "rgba(216, 181, 109, 0.03)" : "transparent"
                            }}
                          >
                            <td style={{ padding: "12px 10px" }}>
                              <strong style={{ color: "#fff", display: "block" }}>{client.cliente_nombre}</strong>
                              {client.cliente_telefono ? (
                                <small style={{ color: "var(--muted, #9ca3af)" }}>{client.cliente_telefono}</small>
                              ) : (
                                <small style={{ color: "var(--muted, #9ca3af)", fontStyle: "italic" }}>Sin teléfono</small>
                              )}
                              <div style={{ marginTop: "4px" }}>
                                {periodClientIds.has(client.cliente_id) ? (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "3px",
                                      padding: "2px 6px",
                                      borderRadius: "4px",
                                      fontSize: "10px",
                                      fontWeight: 600,
                                      backgroundColor: "rgba(16, 185, 129, 0.12)",
                                      color: "#10b981",
                                      border: "1px solid rgba(16, 185, 129, 0.25)"
                                    }}
                                  >
                                    Activo en el período
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "3px",
                                      padding: "2px 6px",
                                      borderRadius: "4px",
                                      fontSize: "10px",
                                      color: "var(--muted, #9ca3af)",
                                      backgroundColor: "rgba(255, 255, 255, 0.04)"
                                    }}
                                  >
                                    Sin actividad en el período
                                  </span>
                                )}
                              </div>
                            </td>

                            <td style={{ padding: "12px 10px" }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontWeight: 700,
                                  fontSize: "14px",
                                  color: client.saldo_sellos > 0 ? "#d8b56d" : "var(--muted, #9ca3af)"
                                }}
                              >
                                <Scissors size={14} />
                                {client.saldo_sellos}
                              </span>
                              <small style={{ display: "block", color: "var(--muted, #9ca3af)", fontSize: "11px" }}>
                                {client.total_acumulaciones} acum. / {client.total_canjes} canjes
                              </small>
                            </td>

                            {/* Critical Multi-Reward Progress Calculation (Section 18) */}
                            <td style={{ padding: "12px 10px" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted, #9ca3af)" }}>
                                  <span>{progress.statusText}</span>
                                  <span style={{ fontWeight: 600, color: progress.isEligible ? "#10b981" : "#d8b56d" }}>{progress.progressPercent}%</span>
                                </div>
                                <div
                                  style={{
                                    height: "6px",
                                    borderRadius: "3px",
                                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                                    overflow: "hidden"
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      width: `${progress.progressPercent}%`,
                                      backgroundColor: progress.isEligible ? "#10b981" : "#d8b56d",
                                      borderRadius: "3px"
                                    }}
                                  />
                                </div>
                              </div>
                            </td>

                            <td style={{ padding: "12px 10px" }}>
                              {progress.isEligible ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                                    color: "#10b981",
                                    border: "1px solid rgba(16, 185, 129, 0.3)"
                                  }}
                                >
                                  <Check size={12} />
                                  <span>¡Listo para canje!</span>
                                </span>
                              ) : client.saldo_sellos > 0 ? (
                                <span
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    fontWeight: 500,
                                    backgroundColor: "rgba(216, 181, 109, 0.1)",
                                    color: "#d8b56d"
                                  }}
                                >
                                  En progreso
                                </span>
                              ) : (
                                <span
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    color: "var(--muted, #9ca3af)",
                                    backgroundColor: "rgba(255, 255, 255, 0.03)"
                                  }}
                                >
                                  Sin sellos
                                </span>
                              )}
                            </td>

                            {/* CANJEAR BUTTON (Section 22) */}
                            <td style={{ padding: "12px 10px", textAlign: "right" }}>
                              {canRedeem && (
                                <button
                                  type="button"
                                  className={progress.isEligible ? "ba-card-gold" : "ba-btn-ghost"}
                                  disabled={!progress.isEligible}
                                  onClick={() => handleOpenRedeemModal(client)}
                                  title={progress.isEligible ? "Canjear recompensa para este cliente" : "Saldo insuficiente para recompensas activas"}
                                  style={{
                                    padding: "6px 14px",
                                    fontSize: "12px",
                                    borderRadius: "6px",
                                    opacity: progress.isEligible ? 1 : 0.45,
                                    cursor: progress.isEligible ? "pointer" : "not-allowed",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px"
                                  }}
                                >
                                  <Gift size={13} />
                                  <span>Canjear</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB B: CATÁLOGO DE RECOMPENSAS (Section 28) */}
        {activeTab === "recompensas" && (
          <div className="ba-card" style={{ padding: "20px", borderRadius: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                  <Gift size={16} color="#d8b56d" />
                  <span>Catálogo de Recompensas</span>
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--muted, #9ca3af)" }}>
                  Premios que los clientes pueden canjear al alcanzar el costo en sellos establecido.
                </p>
              </div>

              {isOwnerOrAdmin && (
                <button
                  type="button"
                  className="ba-card-gold"
                  onClick={() => setShowCreateModal(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", fontSize: "13px", borderRadius: "8px" }}
                >
                  <Plus size={14} />
                  <span>Nueva Recompensa</span>
                </button>
              )}
            </div>

            {rewards.length === 0 ? (
              <div style={{ padding: "36px 16px", textAlign: "center", color: "var(--muted, #9ca3af)" }}>
                <Gift size={32} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                <h3 style={{ margin: 0, fontSize: "15px", color: "#fff" }}>No hay recompensas en el catálogo</h3>
                <p style={{ margin: "6px 0 16px", fontSize: "13px" }}>Configura al menos una recompensa para que tus clientes puedan canjear.</p>
                {isOwnerOrAdmin && (
                  <button type="button" className="ba-card-gold" onClick={() => setShowCreateModal(true)} style={{ padding: "8px 16px", fontSize: "13px" }}>
                    Crear primera recompensa
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                {rewards.map((reward) => (
                  <div
                    key={`reward-card-${reward.id}`}
                    style={{
                      padding: "16px",
                      borderRadius: "10px",
                      backgroundColor: reward.activo ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.01)",
                      border: `1px solid ${reward.activo ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.04)"}`,
                      opacity: reward.activo ? 1 : 0.6,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between"
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                        <strong style={{ fontSize: "15px", color: reward.activo ? "#fff" : "var(--muted, #9ca3af)" }}>{reward.nombre}</strong>
                        <span
                          style={{
                            fontSize: "12px",
                            padding: "3px 8px",
                            borderRadius: "12px",
                            backgroundColor: "rgba(216, 181, 109, 0.15)",
                            color: "#d8b56d",
                            fontWeight: 700,
                            whiteSpace: "nowrap"
                          }}
                        >
                          ✂ {reward.costo_en_sellos} sellos
                        </span>
                      </div>

                      {reward.descripcion && (
                        <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--muted, #9ca3af)", lineHeight: 1.4 }}>
                          {reward.descripcion}
                        </p>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "16px",
                        paddingTop: "12px",
                        borderTop: "1px solid rgba(255, 255, 255, 0.05)"
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: reward.activo ? "#10b981" : "var(--muted, #9ca3af)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        {reward.activo ? <Check size={12} /> : <AlertCircle size={12} />}
                        <span>{reward.activo ? "Activa" : "Inactiva"}</span>
                      </span>

                      {isOwnerOrAdmin && (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            className="ba-btn-ghost"
                            onClick={() => handleOpenEditReward(reward)}
                            title="Editar recompensa"
                            style={{ padding: "4px 8px", fontSize: "11px", borderRadius: "4px" }}
                          >
                            <Edit2 size={12} />
                          </button>

                          {reward.activo ? (
                            <button
                              type="button"
                              className="ba-btn-ghost"
                              onClick={() => setRewardToDeactivate(reward)}
                              title="Desactivar recompensa"
                              style={{ padding: "4px 8px", fontSize: "11px", borderRadius: "4px", color: "#ef4444" }}
                            >
                              <Trash2 size={12} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="ba-card-gold"
                              onClick={() => handleReactivateReward(reward)}
                              title="Reactivar recompensa"
                              style={{ padding: "4px 8px", fontSize: "11px", borderRadius: "4px" }}
                            >
                              Reactivar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: TIEMPOS MUERTOS & DESCUENTOS INTELIGENTES */}
        {activeTab === "tiempos_muertos" && (
          <OffPeakManager
            barberiaId={barberiaId}
            isOwnerOrAdmin={isOwnerOrAdmin}
            services={merged.services || []}
            barbers={merged.barbers || []}
            onActionMessage={setActionMessage}
            onRulesCountChange={setOffPeakRulesCount}
          />
        )}

        {/* TAB C: CONFIGURACIÓN DEL PROGRAMA (Owner/Admin Only - Section 34) */}
        {activeTab === "configuracion" && isOwnerOrAdmin && (
          <div className="ba-card" style={{ padding: "20px", borderRadius: "12px", maxWidth: "800px" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
              <BadgeCheck size={16} color="#d8b56d" />
              <span>Configuración del Programa de Lealtad</span>
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: "12px", color: "var(--muted, #9ca3af)" }}>
              Parámetros generales de acumulación y estado del programa para tu barbería.
            </p>

            <form onSubmit={handleSaveConfig} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Program Switch (Section 41 Accessible Semantics) */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.08)"
                }}
              >
                <div>
                  <strong style={{ fontSize: "14px", display: "block" }}>Estado del Programa</strong>
                  <small style={{ color: "var(--muted, #9ca3af)" }}>
                    {formActivo
                      ? "El programa está acumulando sellos automáticamente con cada cita cobrada."
                      : "El programa está pausado. Las citas no sumarán sellos nuevos."}
                  </small>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={formActivo}
                  aria-label="Activar o pausar programa de fidelización"
                  onClick={() => {
                    if (formActivo) {
                      setShowProgramDeactivateModal(true);
                    } else {
                      setFormActivo(true);
                    }
                  }}
                  disabled={savingConfig}
                  className="ba-input"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    padding: "6px 12px",
                    width: "auto"
                  }}
                >
                  {formActivo ? (
                    <>
                      <ToggleRight size={20} color="#10b981" />
                      <span style={{ color: "#10b981", fontWeight: 700 }}>Activo</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft size={20} color="#9ca3af" />
                      <span style={{ color: "#9ca3af", fontWeight: 700 }}>Pausado</span>
                    </>
                  )}
                </button>
              </div>

              {/* Meta Principal de Sellos (Section 19) */}
              <label className="ba-field">
                <span style={{ fontWeight: 600 }}>Meta principal de la tarjeta</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="ba-input"
                  value={formSellosRequeridos}
                  disabled={savingConfig}
                  onChange={(e) => setFormSellosRequeridos(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ marginTop: "4px" }}
                />
                <small style={{ color: "var(--muted, #9ca3af)", marginTop: "4px", display: "block", fontSize: "11px" }}>
                  Cantidad de sellos requeridos para obtener el beneficio. Al guardar, se sincroniza automáticamente con el catálogo y las metas de tus clientes.
                </small>
              </label>

              {/* Beneficio Principal (Section 20) */}
              <label className="ba-field">
                <span style={{ fontWeight: 600 }}>Beneficio / meta principal</span>
                <input
                  type="text"
                  className="ba-input"
                  value={formRecompensaDefault}
                  disabled={savingConfig}
                  onChange={(e) => setFormRecompensaDefault(e.target.value)}
                  placeholder="Ej. Corte gratis"
                  style={{ marginTop: "4px" }}
                />
                <small style={{ color: "var(--muted, #9ca3af)", marginTop: "4px", display: "block", fontSize: "11px" }}>
                  Beneficio o premio correspondiente al completar los sellos. Al guardar, se actualiza automáticamente en el catálogo de recompensas.
                </small>
              </label>

              {/* Accrual Boundary Notice (Section 36) */}
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(216, 181, 109, 0.08)",
                  border: "1px solid rgba(216, 181, 109, 0.2)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  fontSize: "12px",
                  color: "#d8b56d"
                }}
              >
                <Info size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>
                  {config?.accrual_start_at ? (
                    <>
                      Las citas pagadas se cuentan automáticamente a partir del:{" "}
                      <strong>
                        {new Date(config.accrual_start_at).toLocaleDateString("es-ES")} a las{" "}
                        {new Date(config.accrual_start_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                      </strong>
                      . Los eventos anteriores a este límite quedan protegidos por el contrato canónico de PostgreSQL.
                    </>
                  ) : (
                    <>Al guardar y activar el programa, los cobros registrados en el POS acumularán sellos de forma segura.</>
                  )}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                <button
                  type="submit"
                  className="ba-card-gold"
                  disabled={savingConfig}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 18px", fontSize: "13px" }}
                >
                  {savingConfig && <RefreshCw size={14} className="animate-spin" />}
                  <span>Guardar Configuración</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB D: HISTORIAL / ACTIVIDAD RECIENTE (Section 37 & 38) */}
        {activeTab === "historial" && (
          <div className="ba-card" style={{ padding: "20px", borderRadius: "12px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "16px"
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                  <History size={16} color="#d8b56d" />
                  <span>Actividad Reciente</span>
                </h2>
                <small style={{ color: "var(--muted, #9ca3af)", fontSize: "12px" }}>
                  Movimientos canónicos en el período ({dateRange.label}).
                </small>
              </div>

              {/* History Filter Pills */}
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className={historyFilter === "todos" ? "ba-card-gold" : "ba-btn-ghost"}
                  onClick={() => setHistoryFilter("todos")}
                  style={{ padding: "4px 10px", fontSize: "11px", borderRadius: "6px" }}
                >
                  Todos ({periodLedger.length})
                </button>
                <button
                  type="button"
                  className={historyFilter === "acumulaciones" ? "ba-card-gold" : "ba-btn-ghost"}
                  onClick={() => setHistoryFilter("acumulaciones")}
                  style={{ padding: "4px 10px", fontSize: "11px", borderRadius: "6px" }}
                >
                  Acumulaciones
                </button>
                <button
                  type="button"
                  className={historyFilter === "canjes" ? "ba-card-gold" : "ba-btn-ghost"}
                  onClick={() => setHistoryFilter("canjes")}
                  style={{ padding: "4px 10px", fontSize: "11px", borderRadius: "6px" }}
                >
                  Canjes
                </button>
              </div>
            </div>

            {filteredLedger.length === 0 ? (
              <div style={{ padding: "36px 16px", textAlign: "center", color: "var(--muted, #9ca3af)" }}>
                <History size={28} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: "13px" }}>Sin movimientos en esta categoría.</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.08)", textAlign: "left", color: "var(--muted, #9ca3af)" }}>
                      <th style={{ padding: "10px 8px" }}>FECHA Y HORA</th>
                      <th style={{ padding: "10px 8px" }}>CLIENTE</th>
                      <th style={{ padding: "10px 8px" }}>TIPO</th>
                      <th style={{ padding: "10px 8px" }}>SELLOS</th>
                      <th style={{ padding: "10px 8px" }}>DETALLE / NOTAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.map((entry) => {
                      const isAcumulacion = entry.tipo_movimiento === "acumulacion";
                      const isCanje = entry.tipo_movimiento === "canje";
                      const movementLabel = isAcumulacion
                        ? "Sello acumulado"
                        : isCanje
                          ? "Recompensa canjeada"
                          : entry.tipo_movimiento === "reversion"
                            ? "Reversión"
                            : "Ajuste";

                      return (
                        <tr key={`ledger-${entry.id}`} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                          <td style={{ padding: "10px 8px", color: "var(--muted, #9ca3af)", whiteSpace: "nowrap" }}>
                            {new Date(entry.created_at).toLocaleDateString("es-ES")}{" "}
                            {new Date(entry.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <strong style={{ color: "#fff" }}>{entry.cliente_nombre || `Cliente #${entry.cliente_id}`}</strong>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 600,
                                backgroundColor: isAcumulacion
                                  ? "rgba(16, 185, 129, 0.15)"
                                  : isCanje
                                    ? "rgba(245, 158, 11, 0.15)"
                                    : "rgba(107, 114, 128, 0.15)",
                                color: isAcumulacion ? "#10b981" : isCanje ? "#f59e0b" : "#9ca3af"
                              }}
                            >
                              {isAcumulacion ? <Check size={11} /> : isCanje ? <Gift size={11} /> : <AlertCircle size={11} />}
                              <span>{movementLabel}</span>
                            </span>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <strong style={{ color: entry.delta > 0 ? "#10b981" : "#f59e0b" }}>
                              {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                            </strong>
                          </td>
                          <td style={{ padding: "10px 8px", color: "var(--muted, #9ca3af)" }}>
                            {entry.notas || (entry.source_type === "pago" && entry.source_id ? `Pago #${entry.source_id}` : "-")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SAFE 2-STEP REDEMPTION MODAL (Sections 23, 24, 25, 42)                    */}
        {/* ========================================================================= */}
        {selectedClientForRedeem && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="redeem-dialog-title"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100,
              padding: "16px"
            }}
          >
            <div
              className="ba-card"
              style={{
                maxWidth: "480px",
                width: "100%",
                padding: "24px",
                borderRadius: "14px",
                border: "1px solid rgba(216, 181, 109, 0.3)",
                boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)"
              }}
            >
              {redeemStep === 1 ? (
                /* STEP 1: SELECT REWARD & PREVIEW */
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                      <h3 id="redeem-dialog-title" style={{ margin: 0, fontSize: "17px", display: "flex", alignItems: "center", gap: "8px" }}>
                        <Gift size={18} color="#d8b56d" />
                        <span>Canjear Recompensa</span>
                      </h3>
                      <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted, #9ca3af)" }}>
                        Paso 1 de 2: Selecciona el premio que desea el cliente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => !redeeming && setSelectedClientForRedeem(null)}
                      style={{ background: "transparent", border: "none", color: "var(--muted, #9ca3af)", cursor: "pointer" }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Client Summary Box */}
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      marginBottom: "16px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: "12px", color: "var(--muted, #9ca3af)" }}>Cliente:</span>
                        <strong style={{ display: "block", fontSize: "14px", color: "#fff" }}>
                          {selectedClientForRedeem.cliente_nombre}
                        </strong>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: "12px", color: "var(--muted, #9ca3af)" }}>Saldo actual:</span>
                        <strong style={{ display: "block", fontSize: "16px", color: "#d8b56d" }}>
                          ✂ {selectedClientForRedeem.saldo_sellos} sellos
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Reward Selector */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <label className="ba-field">
                      <span style={{ fontWeight: 600 }}>Seleccionar Recompensa del Catálogo</span>
                      <select
                        className="ba-input"
                        value={selectedRewardId || ""}
                        onChange={(e) => setSelectedRewardId(Number(e.target.value) || null)}
                        style={{ marginTop: "4px" }}
                      >
                        {sortedActiveRewards.map((r) => {
                          const affordable = selectedClientForRedeem.saldo_sellos >= r.costo_en_sellos;
                          return (
                            <option key={`opt-${r.id}`} value={r.id} disabled={!affordable}>
                              {r.nombre} — {r.costo_en_sellos} sellos {affordable ? "(Disponible)" : "(Saldo insuficiente)"}
                            </option>
                          );
                        })}
                      </select>
                    </label>

                    {/* Affordability Balance Check Banner */}
                    {selectedRewardForRedeem && (
                      <div
                        style={{
                          padding: "10px 14px",
                          borderRadius: "8px",
                          fontSize: "12px",
                          backgroundColor: canAffordSelectedReward ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                          color: canAffordSelectedReward ? "#10b981" : "#ef4444",
                          border: `1px solid ${canAffordSelectedReward ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`
                        }}
                      >
                        {canAffordSelectedReward ? (
                          <>
                            ✓ <strong>Saldo suficiente:</strong> Se descontarán {selectedRewardForRedeem.costo_en_sellos} sellos.
                            El saldo restante del cliente será de{" "}
                            <strong>{selectedClientForRedeem.saldo_sellos - selectedRewardForRedeem.costo_en_sellos} sellos</strong>.
                          </>
                        ) : (
                          <>
                            ✕ <strong>Saldo insuficiente:</strong> La recompensa requiere {selectedRewardForRedeem.costo_en_sellos} sellos,
                            pero el cliente solo tiene {selectedClientForRedeem.saldo_sellos}.
                          </>
                        )}
                      </div>
                    )}

                    <label className="ba-field">
                      <span style={{ fontWeight: 600 }}>Notas adicionales (opcional)</span>
                      <input
                        type="text"
                        className="ba-input"
                        value={redeemNotas}
                        onChange={(e) => setRedeemNotas(e.target.value)}
                        placeholder="Ej. Canjeado en recepción durante su corte"
                        style={{ marginTop: "4px" }}
                      />
                    </label>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                    <button
                      type="button"
                      className="ba-btn-ghost"
                      onClick={() => setSelectedClientForRedeem(null)}
                      style={{ padding: "8px 14px", fontSize: "13px" }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="ba-card-gold"
                      disabled={!canAffordSelectedReward}
                      onClick={() => setRedeemStep(2)}
                      style={{
                        padding: "8px 16px",
                        fontSize: "13px",
                        opacity: canAffordSelectedReward ? 1 : 0.45,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      <span>Continuar</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </>
              ) : (
                /* STEP 2: EXPLICIT CONFIRMATION (Section 24) */
                <>
                  <div style={{ marginBottom: "16px" }}>
                    <h3 id="redeem-dialog-title" style={{ margin: 0, fontSize: "17px", display: "flex", alignItems: "center", gap: "8px", color: "#f59e0b" }}>
                      <AlertTriangle size={18} />
                      <span>¿Confirmar este canje?</span>
                    </h3>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted, #9ca3af)" }}>
                      Paso 2 de 2: Revisa los detalles antes de aplicar la deducción de sellos.
                    </p>
                  </div>

                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "10px",
                      backgroundColor: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      fontSize: "13px",
                      marginBottom: "16px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--muted, #9ca3af)" }}>Cliente:</span>
                      <strong style={{ color: "#fff" }}>{selectedClientForRedeem.cliente_nombre}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--muted, #9ca3af)" }}>Recompensa:</span>
                      <strong style={{ color: "#d8b56d" }}>{selectedRewardForRedeem?.nombre}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--muted, #9ca3af)" }}>Costo en sellos:</span>
                      <strong style={{ color: "#ef4444" }}>-{selectedRewardForRedeem?.costo_en_sellos} sellos</strong>
                    </div>
                    <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: "8px", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--muted, #9ca3af)" }}>Saldo actual:</span>
                      <span>{selectedClientForRedeem.saldo_sellos} sellos</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--muted, #9ca3af)" }}>Saldo después del canje:</span>
                      <strong style={{ color: "#10b981" }}>
                        {selectedClientForRedeem.saldo_sellos - (selectedRewardForRedeem?.costo_en_sellos || 0)} sellos
                      </strong>
                    </div>
                    {redeemNotas && (
                      <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: "8px" }}>
                        <span style={{ color: "var(--muted, #9ca3af)", fontSize: "11px" }}>Notas:</span>
                        <p style={{ margin: "2px 0 0", color: "#d1d5db", fontSize: "12px" }}>{redeemNotas}</p>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(245, 158, 11, 0.1)",
                      border: "1px solid rgba(245, 158, 11, 0.25)",
                      fontSize: "11px",
                      color: "#f59e0b",
                      marginBottom: "20px"
                    }}
                  >
                    ⚠️ Este movimiento se registrará de forma inmediata en el historial de transacciones canónico.
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button
                      type="button"
                      className="ba-btn-ghost"
                      onClick={() => setRedeemStep(1)}
                      disabled={redeeming}
                      style={{ padding: "8px 14px", fontSize: "13px" }}
                    >
                      ← Volver
                    </button>
                    {/* Double-Submit Protected Button (Section 25) */}
                    <button
                      type="button"
                      className="ba-card-gold"
                      onClick={handleConfirmRedeem}
                      disabled={redeeming}
                      style={{
                        padding: "8px 18px",
                        fontSize: "13px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      {redeeming && <RefreshCw size={14} className="animate-spin" />}
                      <span>{redeeming ? "Procesando canje..." : "Confirmar y Canjear"}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CREATE REWARD MODAL (Section 29)                                          */}
        {/* ========================================================================= */}
        {showCreateModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-reward-title"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100,
              padding: "16px"
            }}
          >
            <div
              className="ba-card"
              style={{
                maxWidth: "460px",
                width: "100%",
                padding: "24px",
                borderRadius: "14px",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 id="create-reward-title" style={{ margin: 0, fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Plus size={16} color="#d8b56d" />
                  <span>Crear Nueva Recompensa</span>
                </h3>
                <button
                  type="button"
                  onClick={() => !creatingReward && setShowCreateModal(false)}
                  style={{ background: "transparent", border: "none", color: "var(--muted, #9ca3af)", cursor: "pointer" }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateReward} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label className="ba-field">
                  <span style={{ fontWeight: 600 }}>Nombre de la recompensa *</span>
                  <input
                    type="text"
                    className="ba-input"
                    value={newRewardNombre}
                    onChange={(e) => setNewRewardNombre(e.target.value)}
                    placeholder="Ej. Corte de Cabello Gratis"
                    required
                    style={{ marginTop: "4px" }}
                  />
                </label>

                <label className="ba-field">
                  <span style={{ fontWeight: 600 }}>Costo en sellos *</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="ba-input"
                    value={newRewardCosto}
                    onChange={(e) => setNewRewardCosto(parseInt(e.target.value) || 1)}
                    required
                    style={{ marginTop: "4px" }}
                  />
                  <small style={{ color: "var(--muted, #9ca3af)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                    Cantidad de sellos que el cliente debe acumular para obtener este premio.
                  </small>
                </label>

                <label className="ba-field">
                  <span style={{ fontWeight: 600 }}>Descripción (opcional)</span>
                  <input
                    type="text"
                    className="ba-input"
                    value={newRewardDesc}
                    onChange={(e) => setNewRewardDesc(e.target.value)}
                    placeholder="Detalles sobre lo que incluye"
                    style={{ marginTop: "4px" }}
                  />
                </label>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
                  <button
                    type="button"
                    className="ba-btn-ghost"
                    onClick={() => setShowCreateModal(false)}
                    disabled={creatingReward}
                    style={{ padding: "8px 14px", fontSize: "13px" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="ba-card-gold"
                    disabled={creatingReward}
                    style={{ padding: "8px 16px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    {creatingReward && <RefreshCw size={14} className="animate-spin" />}
                    <span>{creatingReward ? "Creando..." : "Crear Recompensa"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* EDIT REWARD MODAL (Section 30 & 31)                                       */}
        {/* ========================================================================= */}
        {rewardToEdit && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-reward-title"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100,
              padding: "16px"
            }}
          >
            <div
              className="ba-card"
              style={{
                maxWidth: "460px",
                width: "100%",
                padding: "24px",
                borderRadius: "14px",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 id="edit-reward-title" style={{ margin: 0, fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Edit2 size={16} color="#d8b56d" />
                  <span>Editar Recompensa</span>
                </h3>
                <button
                  type="button"
                  onClick={() => !savingEditReward && setRewardToEdit(null)}
                  style={{ background: "transparent", border: "none", color: "var(--muted, #9ca3af)", cursor: "pointer" }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveEditReward} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label className="ba-field">
                  <span style={{ fontWeight: 600 }}>Nombre de la recompensa *</span>
                  <input
                    type="text"
                    className="ba-input"
                    value={editRewardNombre}
                    onChange={(e) => setEditRewardNombre(e.target.value)}
                    required
                    style={{ marginTop: "4px" }}
                  />
                </label>

                <label className="ba-field">
                  <span style={{ fontWeight: 600 }}>Costo en sellos *</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="ba-input"
                    value={editRewardCosto}
                    onChange={(e) => setEditRewardCosto(parseInt(e.target.value) || 1)}
                    required
                    style={{ marginTop: "4px" }}
                  />
                  <small style={{ color: "var(--muted, #9ca3af)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                    Los canjes realizados previamente preservan su costo histórico registrado en el momento del canje.
                  </small>
                </label>

                <label className="ba-field">
                  <span style={{ fontWeight: 600 }}>Descripción (opcional)</span>
                  <input
                    type="text"
                    className="ba-input"
                    value={editRewardDesc}
                    onChange={(e) => setEditRewardDesc(e.target.value)}
                    style={{ marginTop: "4px" }}
                  />
                </label>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
                  <button
                    type="button"
                    className="ba-btn-ghost"
                    onClick={() => setRewardToEdit(null)}
                    disabled={savingEditReward}
                    style={{ padding: "8px 14px", fontSize: "13px" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="ba-card-gold"
                    disabled={savingEditReward}
                    style={{ padding: "8px 16px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    {savingEditReward && <RefreshCw size={14} className="animate-spin" />}
                    <span>{savingEditReward ? "Guardando..." : "Guardar Cambios"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DEACTIVATE REWARD CONFIRMATION MODAL (Section 32 & 33)                    */}
        {/* ========================================================================= */}
        {rewardToDeactivate && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-reward-title"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100,
              padding: "16px"
            }}
          >
            <div
              className="ba-card"
              style={{
                maxWidth: "440px",
                width: "100%",
                padding: "24px",
                borderRadius: "14px",
                border: "1px solid rgba(239, 68, 68, 0.3)"
              }}
            >
              <h3 id="deactivate-reward-title" style={{ margin: "0 0 10px", fontSize: "16px", color: "#ef4444", display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertTriangle size={18} />
                <span>¿Desactivar esta recompensa?</span>
              </h3>
              <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#fff" }}>
                Recompensa: <strong>{rewardToDeactivate.nombre}</strong> ({rewardToDeactivate.costo_en_sellos} sellos)
              </p>
              <div
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  fontSize: "12px",
                  color: "var(--muted, #9ca3af)",
                  lineHeight: 1.5,
                  marginBottom: "16px"
                }}
              >
                • Los canjes históricos se conservarán intactos en el ledger.
                <br />
                • La recompensa dejará de estar disponible para nuevos canjes en el catálogo.
                <br />• Puedes volver a activarla en cualquier momento.
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  className="ba-btn-ghost"
                  onClick={() => setRewardToDeactivate(null)}
                  disabled={deactivatingReward}
                  style={{ padding: "8px 14px", fontSize: "13px" }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeactivateReward}
                  disabled={deactivatingReward}
                  style={{
                    backgroundColor: "#ef4444",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  {deactivatingReward ? "Desactivando..." : "Desactivar Recompensa"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PROGRAM DEACTIVATION WARNING MODAL (Section 35)                          */}
        {/* ========================================================================= */}
        {showProgramDeactivateModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-program-title"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100,
              padding: "16px"
            }}
          >
            <div
              className="ba-card"
              style={{
                maxWidth: "460px",
                width: "100%",
                padding: "24px",
                borderRadius: "14px",
                border: "1px solid rgba(239, 68, 68, 0.3)"
              }}
            >
              <h3 id="deactivate-program-title" style={{ margin: "0 0 10px", fontSize: "16px", color: "#ef4444", display: "flex", alignItems: "center", gap: "8px" }}>
                <Power size={18} />
                <span>¿Pausar el Programa de Lealtad?</span>
              </h3>
              <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#d1d5db" }}>
                Al pausar el programa, se detendrán nuevas acumulaciones de sellos en el POS.
              </p>
              <div
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  fontSize: "12px",
                  color: "var(--muted, #9ca3af)",
                  lineHeight: 1.5,
                  marginBottom: "16px"
                }}
              >
                • <strong>No se borrarán sellos</strong> de ningún cliente.
                <br />
                • <strong>No se borrarán recompensas</strong> del catálogo.
                <br />
                • <strong>No se borrará el historial</strong> de movimientos ni canjes.
                <br />• Nuevas citas pagadas en el POS <strong>no acumularán sellos</strong> hasta su reactivación.
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  className="ba-btn-ghost"
                  onClick={() => setShowProgramDeactivateModal(false)}
                  style={{ padding: "8px 14px", fontSize: "13px" }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormActivo(false);
                    setShowProgramDeactivateModal(false);
                  }}
                  style={{
                    backgroundColor: "#ef4444",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Pausar Programa
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
