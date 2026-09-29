export type LoyaltyProgramType = "stamps";

export interface LoyaltyConfig {
  barberia_id: number;
  activo: boolean;
  program_type: LoyaltyProgramType;
  sellos_requeridos: number;
  recompensa_default: string;
  accrual_start_at: string;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyReward {
  id: number;
  barberia_id: number;
  nombre: string;
  descripcion: string | null;
  costo_en_sellos: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyBalance {
  barberia_id: number;
  cliente_id: number;
  cliente_nombre: string;
  cliente_telefono?: string | null;
  saldo_sellos: number;
  total_acumulaciones: number;
  total_canjes: number;
  ultimo_movimiento_at: string | null;
}

export interface LoyaltyLedgerEntry {
  id: number;
  barberia_id: number;
  cliente_id: number;
  cliente_nombre?: string;
  delta: number;
  tipo_movimiento: "acumulacion" | "canje" | "reversion" | "ajuste";
  source_type: string | null;
  source_id: number | null;
  redemption_id: number | null;
  operador_usuario_id: number | null;
  notas: string | null;
  created_at: string;
}

export interface LoyaltyRedemption {
  id: number;
  barberia_id: number;
  cliente_id: number;
  cliente_nombre?: string;
  reward_id: number | null;
  reward_nombre?: string;
  costo_sellos_snapshot: number;
  operador_usuario_id: number | null;
  cita_id: number | null;
  notas: string | null;
  created_at: string;
}

export interface LoyaltySummaryResponse {
  ok: boolean;
  config: LoyaltyConfig | null;
  rewards: LoyaltyReward[];
  balances: LoyaltyBalance[];
  ledger: LoyaltyLedgerEntry[];
  redemptions: LoyaltyRedemption[];
  total_sellos_emitidos: number;
  total_canjes_realizados: number;
  periodo?: {
    from: string;
    to: string;
  };
  error?: string;
  message?: string;
}

export interface LoyaltyRedeemResult {
  success: boolean;
  status:
    | "redeemed"
    | "insufficient_balance"
    | "reward_inactive"
    | "program_disabled"
    | "customer_not_found"
    | "reward_not_found"
    | "cross_tenant_reward"
    | "unauthorized"
    | string;
  redemption_id?: number;
  ledger_id?: number;
  cliente_id?: number;
  barberia_id?: number;
  reward_nombre?: string;
  costo_sellos?: number;
  saldo_restante?: number;
  saldo_actual?: number;
  costo_requerido?: number;
  message?: string;
  error?: string;
}
