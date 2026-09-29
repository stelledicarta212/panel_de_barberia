import type {
  LoyaltyConfig,
  LoyaltyReward,
  LoyaltyBalance,
  LoyaltyLedgerEntry,
  LoyaltyRedemption,
  LoyaltySummaryResponse,
  LoyaltyRedeemResult
} from "@/types/loyalty";

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

export class LoyaltyService {
  /**
   * Fetches full Loyalty summary for a tenant from PostgreSQL / PostgREST.
   */
  static async getSummary(
    barberiaId: number,
    baSession?: string,
    dateRange?: { from?: string; to?: string }
  ): Promise<LoyaltySummaryResponse> {
    const baseUrl = getPostgrestBaseUrl();
    if (!baseUrl) {
      throw new Error("POSTGREST_BASE_URL no está configurado.");
    }

    const headers = buildHeaders(baSession);

    const hasDateRange = Boolean(dateRange?.from && dateRange?.to);
    let ledgerUrl = `${baseUrl}/loyalty_ledger?barberia_id=eq.${barberiaId}&order=created_at.desc`;
    let redemptionsUrl = `${baseUrl}/loyalty_redemptions?barberia_id=eq.${barberiaId}&order=created_at.desc`;

    if (hasDateRange && dateRange?.from && dateRange?.to) {
      const fromEnc = encodeURIComponent(dateRange.from);
      const toEnc = encodeURIComponent(dateRange.to);
      ledgerUrl += `&created_at=gte.${fromEnc}&created_at=lt.${toEnc}&limit=500`;
      redemptionsUrl += `&created_at=gte.${fromEnc}&created_at=lt.${toEnc}&limit=500`;
    } else {
      ledgerUrl += `&limit=50`;
      redemptionsUrl += `&limit=50`;
    }

    // Parallel fetch of canonical sources
    const [configRes, rewardsRes, balancesRes, ledgerRes, redemptionsRes, clientsRes] = await Promise.all([
      fetch(`${baseUrl}/barberia_loyalty_config?barberia_id=eq.${barberiaId}`, {
        headers,
        cache: "no-store"
      }),
      fetch(`${baseUrl}/loyalty_rewards?barberia_id=eq.${barberiaId}&order=id.asc`, {
        headers,
        cache: "no-store"
      }),
      fetch(`${baseUrl}/v_loyalty_client_balance?barberia_id=eq.${barberiaId}&order=saldo_sellos.desc`, {
        headers,
        cache: "no-store"
      }),
      fetch(ledgerUrl, {
        headers,
        cache: "no-store"
      }),
      fetch(redemptionsUrl, {
        headers,
        cache: "no-store"
      }),
      fetch(`${baseUrl}/clientes_finales?barberia_id=eq.${barberiaId}&select=id,nombre,telefono`, {
        headers,
        cache: "no-store"
      })
    ]);

    // Parse configs
    let config: LoyaltyConfig | null = null;
    if (configRes.ok) {
      const rows = await configRes.json().catch(() => []);
      if (Array.isArray(rows) && rows.length > 0) {
        config = rows[0] as LoyaltyConfig;
      }
    }

    // Parse rewards
    let rewards: LoyaltyReward[] = [];
    if (rewardsRes.ok) {
      const rows = await rewardsRes.json().catch(() => []);
      if (Array.isArray(rows)) {
        rewards = rows as LoyaltyReward[];
      }
    }

    // Parse clients mapping for identity resolution
    const clientNameMap = new Map<number, { nombre: string; telefono?: string }>();
    if (clientsRes.ok) {
      const rows = await clientsRes.json().catch(() => []);
      if (Array.isArray(rows)) {
        for (const c of rows) {
          if (c && typeof c.id === "number") {
            clientNameMap.set(c.id, {
              nombre: String(c.nombre || `Cliente #${c.id}`).trim(),
              telefono: c.telefono ? String(c.telefono).trim() : undefined
            });
          }
        }
      }
    }

    // Parse balances
    let balances: LoyaltyBalance[] = [];
    if (balancesRes.ok) {
      const rows = await balancesRes.json().catch(() => []);
      if (Array.isArray(rows)) {
        balances = rows.map((r) => {
          const clientMeta = clientNameMap.get(r.cliente_id);
          return {
            barberia_id: Number(r.barberia_id),
            cliente_id: Number(r.cliente_id),
            cliente_nombre: clientMeta?.nombre || `Cliente #${r.cliente_id}`,
            cliente_telefono: clientMeta?.telefono,
            saldo_sellos: Number(r.saldo_sellos ?? 0),
            total_acumulaciones: Number(r.total_acumulaciones ?? 0),
            total_canjes: Number(r.total_canjes ?? 0),
            ultimo_movimiento_at: r.ultimo_movimiento_at ? String(r.ultimo_movimiento_at) : null
          };
        });
      }
    }

    // Parse ledger
    let ledger: LoyaltyLedgerEntry[] = [];
    if (ledgerRes.ok) {
      const rows = await ledgerRes.json().catch(() => []);
      if (Array.isArray(rows)) {
        ledger = rows.map((r) => {
          const clientMeta = clientNameMap.get(r.cliente_id);
          return {
            id: Number(r.id),
            barberia_id: Number(r.barberia_id),
            cliente_id: Number(r.cliente_id),
            cliente_nombre: clientMeta?.nombre || `Cliente #${r.cliente_id}`,
            delta: Number(r.delta),
            tipo_movimiento: r.tipo_movimiento,
            source_type: r.source_type,
            source_id: r.source_id != null ? Number(r.source_id) : null,
            redemption_id: r.redemption_id != null ? Number(r.redemption_id) : null,
            operador_usuario_id: r.operador_usuario_id != null ? Number(r.operador_usuario_id) : null,
            notas: r.notas,
            created_at: String(r.created_at)
          };
        });
      }
    }

    // Parse redemptions
    let redemptions: LoyaltyRedemption[] = [];
    if (redemptionsRes.ok) {
      const rows = await redemptionsRes.json().catch(() => []);
      if (Array.isArray(rows)) {
        redemptions = rows.map((r) => {
          const clientMeta = clientNameMap.get(r.cliente_id);
          const reward = rewards.find((rw) => rw.id === r.reward_id);
          return {
            id: Number(r.id),
            barberia_id: Number(r.barberia_id),
            cliente_id: Number(r.cliente_id),
            cliente_nombre: clientMeta?.nombre || `Cliente #${r.cliente_id}`,
            reward_id: r.reward_id != null ? Number(r.reward_id) : null,
            reward_nombre: reward?.nombre || (r.reward_id ? `Recompensa #${r.reward_id}` : "Recompensa"),
            costo_sellos_snapshot: Number(r.costo_sellos_snapshot),
            operador_usuario_id: r.operador_usuario_id != null ? Number(r.operador_usuario_id) : null,
            cita_id: r.cita_id != null ? Number(r.cita_id) : null,
            notas: r.notas,
            created_at: String(r.created_at)
          };
        });
      }
    }

    const total_sellos_emitidos = hasDateRange
      ? ledger.filter((l) => l.delta > 0).reduce((acc, l) => acc + l.delta, 0)
      : balances.reduce((acc, b) => acc + b.total_acumulaciones, 0);
    const total_canjes_realizados = redemptions.length;

    return {
      ok: true,
      config,
      rewards,
      balances,
      ledger,
      redemptions,
      total_sellos_emitidos,
      total_canjes_realizados,
      ...(hasDateRange && dateRange?.from && dateRange?.to
        ? { periodo: { from: dateRange.from, to: dateRange.to } }
        : {})
    };
  }

  /**
   * Updates or initializes loyalty configuration.
   * Accrual boundary (accrual_start_at) is protected by PostgreSQL triggers.
   */
  static async updateConfig(
    barberiaId: number,
    patch: { activo?: boolean; sellos_requeridos?: number; recompensa_default?: string },
    baSession?: string
  ): Promise<LoyaltyConfig> {
    const baseUrl = getPostgrestBaseUrl();
    if (!baseUrl) {
      throw new Error("POSTGREST_BASE_URL no está configurado.");
    }

    const updatePayload: Record<string, unknown> = {};
    if (typeof patch.activo === "boolean") {
      updatePayload.activo = patch.activo;
    }
    if (patch.sellos_requeridos != null) {
      const num = Number(patch.sellos_requeridos);
      if (!Number.isInteger(num) || num <= 0) {
        throw new Error("sellos_requeridos debe ser un entero mayor a 0");
      }
      updatePayload.sellos_requeridos = num;
    }
    if (patch.recompensa_default != null) {
      const text = String(patch.recompensa_default).trim();
      if (!text) {
        throw new Error("recompensa_default no puede estar vacía");
      }
      updatePayload.recompensa_default = text;
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new Error("No hay campos para actualizar");
    }

    // Check if row already exists
    const checkRes = await fetch(`${baseUrl}/barberia_loyalty_config?barberia_id=eq.${barberiaId}`, {
      headers: buildHeaders(baSession),
      cache: "no-store"
    });

    const checkRows = await checkRes.json().catch(() => []);
    const exists = Array.isArray(checkRows) && checkRows.length > 0;

    let res: Response;
    if (exists) {
      // PATCH existing
      res = await fetch(`${baseUrl}/barberia_loyalty_config?barberia_id=eq.${barberiaId}`, {
        method: "PATCH",
        headers: buildHeaders(baSession, "return=representation"),
        body: JSON.stringify(updatePayload),
        cache: "no-store"
      });
    } else {
      // POST new default row with patch overrides
      const insertPayload = {
        barberia_id: barberiaId,
        program_type: "stamps",
        activo: updatePayload.activo ?? true,
        sellos_requeridos: updatePayload.sellos_requeridos ?? 10,
        recompensa_default: updatePayload.recompensa_default ?? "Corte Gratis"
      };
      res = await fetch(`${baseUrl}/barberia_loyalty_config`, {
        method: "POST",
        headers: buildHeaders(baSession, "return=representation"),
        body: JSON.stringify(insertPayload),
        cache: "no-store"
      });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Error actualizando configuración de fidelización: ${res.status} ${errText}`);
    }

    const rows = await res.json().catch(() => []);
    if (Array.isArray(rows) && rows.length > 0) {
      return rows[0] as LoyaltyConfig;
    }

    // Refetch if representation not returned
    const refetch = await fetch(`${baseUrl}/barberia_loyalty_config?barberia_id=eq.${barberiaId}`, {
      headers: buildHeaders(baSession),
      cache: "no-store"
    });
    const refetchRows = await refetch.json().catch(() => []);
    return refetchRows[0] as LoyaltyConfig;
  }

  /**
   * Creates a new reward for the tenant.
   */
  static async createReward(
    barberiaId: number,
    data: { nombre: string; costo_en_sellos: number; descripcion?: string },
    baSession?: string
  ): Promise<LoyaltyReward> {
    const baseUrl = getPostgrestBaseUrl();
    if (!baseUrl) {
      throw new Error("POSTGREST_BASE_URL no está configurado.");
    }

    const nombre = String(data.nombre || "").trim();
    if (!nombre) {
      throw new Error("El nombre de la recompensa es requerido");
    }

    const costo = Number(data.costo_en_sellos);
    if (!Number.isInteger(costo) || costo <= 0) {
      throw new Error("El costo en sellos debe ser un entero mayor a 0");
    }

    const payload = {
      barberia_id: barberiaId,
      nombre,
      costo_en_sellos: costo,
      descripcion: data.descripcion ? String(data.descripcion).trim() : null,
      activo: true
    };

    const res = await fetch(`${baseUrl}/loyalty_rewards`, {
      method: "POST",
      headers: buildHeaders(baSession, "return=representation"),
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Error creando recompensa: ${res.status} ${errText}`);
    }

    const rows = await res.json().catch(() => []);
    if (Array.isArray(rows) && rows.length > 0) {
      return rows[0] as LoyaltyReward;
    }
    throw new Error("No se pudo obtener la recompensa creada");
  }

  /**
   * Updates or soft-deactivates a reward.
   */
  static async updateReward(
    barberiaId: number,
    rewardId: number,
    patch: { nombre?: string; costo_en_sellos?: number; descripcion?: string; activo?: boolean },
    baSession?: string
  ): Promise<LoyaltyReward> {
    const baseUrl = getPostgrestBaseUrl();
    if (!baseUrl) {
      throw new Error("POSTGREST_BASE_URL no está configurado.");
    }

    if (!Number.isInteger(rewardId) || rewardId <= 0) {
      throw new Error("ID de recompensa inválido");
    }

    const updatePayload: Record<string, unknown> = {};
    if (patch.nombre != null) {
      const n = String(patch.nombre).trim();
      if (!n) throw new Error("El nombre de la recompensa no puede estar vacío");
      updatePayload.nombre = n;
    }
    if (patch.costo_en_sellos != null) {
      const c = Number(patch.costo_en_sellos);
      if (!Number.isInteger(c) || c <= 0) {
        throw new Error("El costo en sellos debe ser un número entero mayor a 0");
      }
      updatePayload.costo_en_sellos = c;
    }
    if (patch.descripcion !== undefined) {
      updatePayload.descripcion = patch.descripcion ? String(patch.descripcion).trim() : null;
    }
    if (typeof patch.activo === "boolean") {
      updatePayload.activo = patch.activo;
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new Error("No hay campos para actualizar");
    }

    const res = await fetch(`${baseUrl}/loyalty_rewards?id=eq.${rewardId}&barberia_id=eq.${barberiaId}`, {
      method: "PATCH",
      headers: buildHeaders(baSession, "return=representation"),
      body: JSON.stringify(updatePayload),
      cache: "no-store"
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Error actualizando recompensa: ${res.status} ${errText}`);
    }

    const rows = await res.json().catch(() => []);
    if (Array.isArray(rows) && rows.length > 0) {
      return rows[0] as LoyaltyReward;
    }
    throw new Error("Recompensa no encontrada o no pertenece a esta barbería");
  }

  /**
   * Executes an atomic, concurrency-safe redemption through public.ba_loyalty_redeem RPC.
   */
  static async redeem(
    barberiaId: number,
    clienteId: number,
    rewardId: number,
    citaId?: number | null,
    notas?: string | null,
    baSession?: string
  ): Promise<LoyaltyRedeemResult> {
    const baseUrl = getPostgrestBaseUrl();
    if (!baseUrl) {
      throw new Error("POSTGREST_BASE_URL no está configurado.");
    }

    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return { success: false, status: "invalid_client", message: "cliente_id inválido" };
    }
    if (!Number.isInteger(rewardId) || rewardId <= 0) {
      return { success: false, status: "invalid_reward", message: "reward_id inválido" };
    }

    const rpcUrl = `${baseUrl}/rpc/ba_loyalty_redeem`;
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: buildHeaders(baSession),
      body: JSON.stringify({
        p_cliente_id: clienteId,
        p_reward_id: rewardId,
        p_cita_id: citaId || null,
        p_notas: notas || null
      }),
      cache: "no-store"
    });

    const raw = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        raw && typeof raw === "object" && typeof raw.message === "string"
          ? raw.message
          : `Error en RPC ba_loyalty_redeem: HTTP ${res.status}`;
      return {
        success: false,
        status: raw?.status || "rpc_error",
        message
      };
    }

    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as LoyaltyRedeemResult;
    }

    return {
      success: false,
      status: "unexpected_response",
      message: "Respuesta inesperada al procesar el canje"
    };
  }
}
