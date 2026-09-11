import type {
  CanonicalBarberiaState,
  CanonicalBillingTerm,
  CanonicalProductState,
  CanonicalSubscriptionState
} from "./product-state";

export type {
  CanonicalBarberiaState,
  CanonicalBillingTerm,
  CanonicalProductState,
  CanonicalSubscriptionState
};

export type SessionMeUser = {
  id: number;
  email: string;
  nombre: string;
  apellido?: string | null;
};

export type SessionMeBarberia = {
  id: number;
  slug: string;
  nombre: string;
  role: string;
  subscription_state?: CanonicalSubscriptionState | null;
  plan_code?: string | null;
  plan_name?: string | null;
  billing_term?: CanonicalBillingTerm | null;
  period_start?: string | null;
  period_end?: string | null;
  days_remaining?: number | null;
};

export type SessionMeResponse = {
  ok: boolean;
  user_id?: number;
  email?: string;
  nombre?: string;
  apellido?: string | null;
  plan_id?: number | null;
  puede_crear_barberia?: boolean;
  user?: SessionMeUser;
  role?: string | null;
  permissions?: Record<string, boolean>;
  current_barberia?: SessionMeBarberia | null;
  barberias?: SessionMeBarberia[];
  barberias_count?: number;
  next_action?: string;
  message?: string;
  // Phase D canonical product state contract:
  product_state?: CanonicalProductState;
  barberia_state?: CanonicalBarberiaState;
  subscription_state?: CanonicalSubscriptionState;
  plan_code?: string | null;
  plan_name?: string | null;
  billing_term?: CanonicalBillingTerm | null;
  period_start?: string | null;
  period_end?: string | null;
  days_remaining?: number | null;
};

export async function getSessionMe(): Promise<SessionMeResponse> {
  const response = await fetch("/api/session/me", {
    method: "GET",
    credentials: "include"
  });
  const text = await response.text().catch(() => "");
  let data: SessionMeResponse;
  try {
    data = (text ? JSON.parse(text) : {}) as SessionMeResponse;
  } catch {
    throw new Error("GET /api/session/me devolvio respuesta no JSON.");
  }
  if (response.status === 401) {
    return {
      ...data,
      ok: false,
      next_action: data.next_action ?? "login"
    };
  }
  if (!response.ok) {
    throw new Error(`GET /api/session/me -> ${response.status}. ${data.message || response.statusText}`);
  }
  return data;
}
