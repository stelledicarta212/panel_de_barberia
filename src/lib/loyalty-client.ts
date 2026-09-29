import type {
  LoyaltySummaryResponse,
  LoyaltyConfig,
  LoyaltyReward,
  LoyaltyRedeemResult
} from "@/types/loyalty";

export async function fetchLoyaltySummary(
  barberiaId?: number | null,
  dateRange?: { from?: string; to?: string } | null
): Promise<LoyaltySummaryResponse> {
  const params = new URLSearchParams();
  if (barberiaId && barberiaId > 0) {
    params.set("barberia_id", String(barberiaId));
  }
  if (dateRange?.from && dateRange?.to) {
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
  }
  const queryString = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/loyalty${queryString}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok || !raw) {
    const errorMsg = raw?.message || `Error del servidor: HTTP ${res.status}`;
    throw new Error(errorMsg);
  }
  return raw as LoyaltySummaryResponse;
}

export async function updateLoyaltyConfigClient(
  patch: { activo?: boolean; sellos_requeridos?: number; recompensa_default?: string },
  barberiaId?: number | null
): Promise<{ ok: boolean; config: LoyaltyConfig }> {
  const body = {
    ...patch,
    ...(barberiaId && barberiaId > 0 ? { barberia_id: barberiaId } : {})
  };

  const res = await fetch("/api/loyalty", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok || !raw?.ok) {
    throw new Error(raw?.message || `Error al actualizar configuración: HTTP ${res.status}`);
  }
  return raw;
}

export async function createLoyaltyRewardClient(
  reward: { nombre: string; costo_en_sellos: number; descripcion?: string },
  barberiaId?: number | null
): Promise<{ ok: boolean; reward: LoyaltyReward }> {
  const body = {
    ...reward,
    ...(barberiaId && barberiaId > 0 ? { barberia_id: barberiaId } : {})
  };

  const res = await fetch("/api/loyalty/rewards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok || !raw?.ok) {
    throw new Error(raw?.message || `Error al crear recompensa: HTTP ${res.status}`);
  }
  return raw;
}

export async function updateLoyaltyRewardClient(
  rewardId: number,
  patch: { nombre?: string; costo_en_sellos?: number; descripcion?: string; activo?: boolean },
  barberiaId?: number | null
): Promise<{ ok: boolean; reward: LoyaltyReward }> {
  const body = {
    ...patch,
    ...(barberiaId && barberiaId > 0 ? { barberia_id: barberiaId } : {})
  };

  const res = await fetch(`/api/loyalty/rewards/${rewardId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok || !raw?.ok) {
    throw new Error(raw?.message || `Error al actualizar recompensa: HTTP ${res.status}`);
  }
  return raw;
}

export async function redeemLoyaltyRewardClient(
  clienteId: number,
  rewardId: number,
  citaId?: number | null,
  notas?: string | null,
  barberiaId?: number | null
): Promise<LoyaltyRedeemResult> {
  const body = {
    cliente_id: clienteId,
    reward_id: rewardId,
    cita_id: citaId || null,
    notas: notas || null,
    ...(barberiaId && barberiaId > 0 ? { barberia_id: barberiaId } : {})
  };

  const res = await fetch("/api/loyalty/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok || !raw) {
    return {
      success: false,
      status: raw?.status || "error",
      message: raw?.message || `Error al canjear: HTTP ${res.status}`,
      saldo_actual: raw?.saldo_actual,
      costo_requerido: raw?.costo_requerido
    };
  }
  return raw as LoyaltyRedeemResult;
}
