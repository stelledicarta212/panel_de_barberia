import type { OffPeakRule, OffPeakRuleInput } from "@/types/off-peak";

export const DIAS_SEMANA_LABELS: Record<number, string> = {
  0: "Dom",
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb"
};

export const DIAS_SEMANA_COMPLETOS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado"
};

export function formatDiasSemana(dias: number[]): string {
  if (!dias || dias.length === 0) return "Ninguno";
  if (dias.length === 7) return "Todos los días";
  const sorted = [...dias].sort((a, b) => a - b);
  // Check if Monday to Friday
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) {
    return "Lun a Vie";
  }
  // Check if Saturday and Sunday
  if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) {
    return "Fines de semana";
  }
  return sorted.map((d) => DIAS_SEMANA_LABELS[d] || String(d)).join(", ");
}

export function formatHoraCorta(hora: string): string {
  if (!hora) return "";
  return hora.slice(0, 5); // "14:00:00" -> "14:00"
}

export async function fetchOffPeakRules(barberiaId?: number | null): Promise<OffPeakRule[]> {
  const query = barberiaId ? `?barberia_id=${encodeURIComponent(String(barberiaId))}` : "";
  const res = await fetch(`/api/loyalty/off-peak${query}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "include",
    cache: "no-store"
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || "Error al cargar reglas de tiempos muertos.");
  }

  return Array.isArray(data.rules) ? data.rules : [];
}

export async function createOffPeakRuleClient(
  input: OffPeakRuleInput,
  barberiaId?: number | null
): Promise<OffPeakRule> {
  const payload = {
    ...input,
    barberia_id: barberiaId ?? undefined
  };

  const res = await fetch("/api/loyalty/off-peak", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || "Error al crear la regla de tiempos muertos.");
  }

  return data.rule as OffPeakRule;
}

export async function updateOffPeakRuleClient(
  ruleId: number,
  input: Partial<OffPeakRuleInput>,
  barberiaId?: number | null
): Promise<OffPeakRule> {
  const payload = {
    ...input,
    barberia_id: barberiaId ?? undefined
  };

  const res = await fetch(`/api/loyalty/off-peak/${ruleId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || "Error al actualizar la regla de tiempos muertos.");
  }

  return data.rule as OffPeakRule;
}

export async function deleteOffPeakRuleClient(
  ruleId: number,
  barberiaId?: number | null
): Promise<void> {
  const query = barberiaId ? `?barberia_id=${encodeURIComponent(String(barberiaId))}` : "";
  const res = await fetch(`/api/loyalty/off-peak/${ruleId}${query}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
    credentials: "include"
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || "Error al eliminar la regla de tiempos muertos.");
  }
}
