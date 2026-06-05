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
