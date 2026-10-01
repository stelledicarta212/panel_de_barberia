import type {
  OffPeakRule,
  OffPeakRuleInput,
  OffPeakPriceCalculation
} from "@/types/off-peak";

function getPostgrestBaseUrl(): string {
  const base =
    process.env.POSTGREST_BASE_URL ??
    process.env.POSTGREST_URL ??
    "";
  return String(base).trim().replace(/\/+$/, "");
}

function getServiceRoleToken(): string {
  const token =
    process.env.LOYALTY_SERVICE_ROLE_TOKEN ??
    process.env.POSTGREST_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.BILLING_PURCHASE_INTENTS_INGEST_TOKEN ??
    "";
  return token.trim();
}

function buildHeaders(baSession?: string, prefer?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (prefer) {
    headers["Prefer"] = prefer;
  }
  const serviceToken = getServiceRoleToken();
  if (serviceToken) {
    headers["Authorization"] = `Bearer ${serviceToken}`;
    headers["apikey"] = serviceToken;
  } else if (baSession) {
    headers["Cookie"] = `ba_session=${baSession}`;
    if (baSession.split(".").length === 3) {
      headers["Authorization"] = `Bearer ${baSession}`;
      headers["apikey"] = baSession;
    }
  }
  return headers;
}

export function validateOffPeakInput(input: Partial<OffPeakRuleInput>): { valid: boolean; error?: string } {
  if (input.descuento_porcentaje !== undefined) {
    const pct = Number(input.descuento_porcentaje);
    if (!Number.isInteger(pct) || pct < 1 || pct >= 100) {
      return { valid: false, error: "El porcentaje de descuento debe ser un número entero entre 1 y 99." };
    }
  }

  if (input.dias_semana !== undefined) {
    if (!Array.isArray(input.dias_semana) || input.dias_semana.length === 0) {
      return { valid: false, error: "Debes seleccionar al menos un día de la semana." };
    }
    for (const d of input.dias_semana) {
      const dayNum = Number(d);
      if (!Number.isInteger(dayNum) || dayNum < 0 || dayNum > 6) {
        return { valid: false, error: "Los días de la semana deben estar entre 0 (Domingo) y 6 (Sábado)." };
      }
    }
  }

  if (input.hora_inicio !== undefined && input.hora_fin !== undefined) {
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
    if (!timeRegex.test(input.hora_inicio) || !timeRegex.test(input.hora_fin)) {
      return { valid: false, error: "El formato de hora debe ser HH:MM (ej. 14:00)." };
    }
    if (input.hora_fin <= input.hora_inicio) {
      return { valid: false, error: "La hora de fin debe ser posterior a la hora de inicio." };
    }
  }

  return { valid: true };
}

export class OffPeakService {
  /**
   * List all off-peak discount rules for a specific tenant.
   */
  static async listRules(barberiaId: number, baSession?: string): Promise<OffPeakRule[]> {
    const baseUrl = getPostgrestBaseUrl();
    if (!baseUrl) {
      throw new Error("POSTGREST_BASE_URL no está configurado.");
    }

    const headers = buildHeaders(baSession);
    const url = `${baseUrl}/barberia_off_peak_rules?barberia_id=eq.${barberiaId}&order=id.asc`;

    const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Error consultando reglas de tiempos muertos (${res.status}): ${text}`);
    }

    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? (data as OffPeakRule[]) : [];
  }

  /**
   * Create a new off-peak discount rule for a tenant.
   */
  static async createRule(
    barberiaId: number,
    input: OffPeakRuleInput,
    baSession?: string
  ): Promise<OffPeakRule> {
    const validation = validateOffPeakInput(input);
    if (!validation.valid) {
      throw new Error(validation.error || "Datos de regla inválidos.");
    }

    const baseUrl = getPostgrestBaseUrl();
    if (!baseUrl) {
      throw new Error("POSTGREST_BASE_URL no está configurado.");
    }

    const headers = buildHeaders(baSession, "return=representation");
    const payload = {
      barberia_id: barberiaId,
      nombre: input.nombre ? input.nombre.trim() : null,
      dias_semana: Array.from(new Set(input.dias_semana)).sort((a, b) => a - b),
      hora_inicio: input.hora_inicio.length === 5 ? `${input.hora_inicio}:00` : input.hora_inicio,
      hora_fin: input.hora_fin.length === 5 ? `${input.hora_fin}:00` : input.hora_fin,
      descuento_porcentaje: Math.trunc(input.descuento_porcentaje),
      aplica_todos_servicios: input.aplica_todos_servicios !== false,
      servicios_ids: input.aplica_todos_servicios === false && Array.isArray(input.servicios_ids) ? input.servicios_ids : null,
      aplica_todos_barberos: input.aplica_todos_barberos !== false,
      barberos_ids: input.aplica_todos_barberos === false && Array.isArray(input.barberos_ids) ? input.barberos_ids : null,
      activo: input.activo !== false
    };

    const res = await fetch(`${baseUrl}/barberia_off_peak_rules`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Error creando regla de tiempos muertos (${res.status}): ${text}`);
    }

    const rows = await res.json().catch(() => []);
    return rows[0] as OffPeakRule;
  }

  /**
   * Update an existing off-peak rule for a tenant.
   */
  static async updateRule(
    ruleId: number,
    barberiaId: number,
    input: Partial<OffPeakRuleInput>,
    baSession?: string
  ): Promise<OffPeakRule> {
    const validation = validateOffPeakInput(input);
    if (!validation.valid) {
      throw new Error(validation.error || "Datos de regla inválidos.");
    }

    const baseUrl = getPostgrestBaseUrl();
    if (!baseUrl) {
      throw new Error("POSTGREST_BASE_URL no está configurado.");
    }

    const headers = buildHeaders(baSession, "return=representation");
    const patchPayload: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (input.nombre !== undefined) patchPayload.nombre = input.nombre ? input.nombre.trim() : null;
    if (input.dias_semana !== undefined) patchPayload.dias_semana = Array.from(new Set(input.dias_semana)).sort((a, b) => a - b);
    if (input.hora_inicio !== undefined) patchPayload.hora_inicio = input.hora_inicio.length === 5 ? `${input.hora_inicio}:00` : input.hora_inicio;
    if (input.hora_fin !== undefined) patchPayload.hora_fin = input.hora_fin.length === 5 ? `${input.hora_fin}:00` : input.hora_fin;
    if (input.descuento_porcentaje !== undefined) patchPayload.descuento_porcentaje = Math.trunc(input.descuento_porcentaje);
    if (input.aplica_todos_servicios !== undefined) {
      patchPayload.aplica_todos_servicios = input.aplica_todos_servicios;
      patchPayload.servicios_ids = input.aplica_todos_servicios ? null : input.servicios_ids ?? null;
    } else if (input.servicios_ids !== undefined) {
      patchPayload.servicios_ids = input.servicios_ids;
    }
    if (input.aplica_todos_barberos !== undefined) {
      patchPayload.aplica_todos_barberos = input.aplica_todos_barberos;
      patchPayload.barberos_ids = input.aplica_todos_barberos ? null : input.barberos_ids ?? null;
    } else if (input.barberos_ids !== undefined) {
      patchPayload.barberos_ids = input.barberos_ids;
    }
    if (input.activo !== undefined) patchPayload.activo = input.activo;

    const res = await fetch(
      `${baseUrl}/barberia_off_peak_rules?id=eq.${ruleId}&barberia_id=eq.${barberiaId}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify(patchPayload)
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Error actualizando regla de tiempos muertos (${res.status}): ${text}`);
    }

    const rows = await res.json().catch(() => []);
    if (!rows.length) {
      throw new Error("Regla no encontrada o no pertenece a la barbería.");
    }
    return rows[0] as OffPeakRule;
  }

  /**
   * Delete an existing off-peak rule for a tenant.
   */
  static async deleteRule(ruleId: number, barberiaId: number, baSession?: string): Promise<{ ok: boolean }> {
    const baseUrl = getPostgrestBaseUrl();
    if (!baseUrl) {
      throw new Error("POSTGREST_BASE_URL no está configurado.");
    }

    const headers = buildHeaders(baSession);
    const res = await fetch(
      `${baseUrl}/barberia_off_peak_rules?id=eq.${ruleId}&barberia_id=eq.${barberiaId}`,
      {
        method: "DELETE",
        headers
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Error eliminando regla (${res.status}): ${text}`);
    }

    return { ok: true };
  }

  /**
   * Pure deterministic price calculation algorithm matching PostgreSQL ba_calcular_precio_cita 1:1.
   * Useful for client previews, offline calculations, and unit testing.
   */
  static calculatePricePure(
    basePrice: number,
    rules: OffPeakRule[],
    params: {
      servicioId: number;
      barberoId?: number | null;
      fecha: string; // "YYYY-MM-DD"
      hora: string; // "HH:MM" or "HH:MM:SS"
    }
  ): OffPeakPriceCalculation {
    const normalizedHora = params.hora.length === 5 ? `${params.hora}:00` : params.hora;
    
    // Parse date to DOW in America/Bogota or ISO
    const [year, month, day] = params.fecha.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dow = dateObj.getDay(); // 0=Domingo, 1=Lunes, ..., 6=Sábado

    // Match candidate rules:
    // [hora_inicio, hora_fin) semi-open interval: inclusive start, exclusive end!
    const matchingRules = rules.filter((r) => {
      if (!r.activo) return false;
      if (!r.dias_semana.includes(dow)) return false;

      const rInicio = r.hora_inicio.length === 5 ? `${r.hora_inicio}:00` : r.hora_inicio;
      const rFin = r.hora_fin.length === 5 ? `${r.hora_fin}:00` : r.hora_fin;

      if (normalizedHora < rInicio || normalizedHora >= rFin) return false;

      // Services scope
      if (!r.aplica_todos_servicios) {
        if (!r.servicios_ids || !r.servicios_ids.includes(params.servicioId)) return false;
      }

      // Barbers scope
      if (!r.aplica_todos_barberos && params.barberoId) {
        if (!r.barberos_ids || !r.barberos_ids.includes(params.barberoId)) return false;
      }

      return true;
    });

    // Overlap resolution policy: highest discount percentage wins, tie-breaker id ASC
    matchingRules.sort((a, b) => {
      if (b.descuento_porcentaje !== a.descuento_porcentaje) {
        return b.descuento_porcentaje - a.descuento_porcentaje;
      }
      return a.id - b.id;
    });

    const winningRule = matchingRules[0];

    if (!winningRule) {
      return {
        ok: true,
        precio_base: basePrice,
        descuento_porcentaje: 0,
        descuento_valor: 0,
        precio_final: basePrice,
        tiene_descuento: false,
        promocion_id: null,
        promocion_nombre: null,
        promocion_snapshot: null
      };
    }

    const pct = winningRule.descuento_porcentaje;
    const discountValue = Math.round((basePrice * pct) / 100);
    const finalPrice = Math.max(0, basePrice - discountValue);

    return {
      ok: true,
      precio_base: basePrice,
      descuento_porcentaje: pct,
      descuento_valor: discountValue,
      precio_final: finalPrice,
      tiene_descuento: true,
      promocion_id: winningRule.id,
      promocion_nombre: winningRule.nombre,
      promocion_snapshot: {
        id: winningRule.id,
        nombre: winningRule.nombre,
        descuento_porcentaje: pct,
        descuento_valor: discountValue,
        hora_inicio: winningRule.hora_inicio.slice(0, 5),
        hora_fin: winningRule.hora_fin.slice(0, 5),
        dias_semana: winningRule.dias_semana
      }
    };
  }
}
