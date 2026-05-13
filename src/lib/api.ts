import { env } from "@/lib/env";

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function buildUrl(path: string): string {
  if (isAbsoluteUrl(path)) return path;
  const base = String(env.apiBaseUrl || "").trim().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function sanitizeErrorBody(text: string): string {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (raw.startsWith("<!DOCTYPE") || raw.startsWith("<html")) {
    return "El endpoint devolvió HTML (posible 404/ruta incorrecta), no JSON.";
  }
  return raw.length > 280 ? `${raw.slice(0, 280)}...` : raw;
}

export async function apiFetch(path: string, init?: RequestInit) {
  const url = buildUrl(path);
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
}

export async function apiGetJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = buildUrl(path);
  const response = await apiFetch(path, { ...init, method: "GET" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const body = sanitizeErrorBody(text);
    throw new Error(`GET ${url} -> ${response.status}. ${body || response.statusText}`);
  }
  const text = await response.text().catch(() => "");
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error(`GET ${url} devolvió respuesta no JSON.`);
  }
}

export async function apiPostJson<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
  init?: RequestInit
): Promise<TResponse> {
  const url = buildUrl(path);
  const response = await apiFetch(path, {
    ...init,
    method: "POST",
    body: JSON.stringify(body)
  });

  const text = await response.text().catch(() => "");
  let data = {} as TResponse;
  if (text) {
    try {
      data = JSON.parse(text) as TResponse;
    } catch {
      data = {} as TResponse;
    }
  }
  if (!response.ok) {
    const bodySummary = sanitizeErrorBody(text);
    throw new Error(`POST ${url} -> ${response.status}. ${bodySummary || response.statusText}`);
  }
  return data;
}
