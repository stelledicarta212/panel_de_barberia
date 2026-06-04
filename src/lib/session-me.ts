import { apiGetJson } from "@/lib/api";

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
  return apiGetJson<SessionMeResponse>("/webhook/barberagency/session/me", {
    credentials: "include"
  });
}
