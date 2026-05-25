import { env } from "@/lib/env";

function getApiBaseUrl(): string {
  const base = String(env.apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "").trim();
  return base.replace(/\/+$/, "");
}

function getUrl(path: string): string {
  const base = getApiBaseUrl();
  if (!base) {
    throw new Error("Falta NEXT_PUBLIC_API_BASE_URL para RPC publico.");
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function postRpc<TResponse, TBody extends Record<string, unknown>>(path: string, body: TBody): Promise<TResponse> {
  const response = await fetch(getUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const text = await response.text().catch(() => "");
  const parsed = text ? (JSON.parse(text) as unknown) : {};
  if (!response.ok) {
    throw new Error(`RPC ${path} -> ${response.status}`);
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const first = Object.values(obj)[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      return first as TResponse;
    }
    return obj as TResponse;
  }
  return {} as TResponse;
}

export type ResolveQrResponse = {
  ok?: boolean;
  error?: string;
  barberia_id?: number;
  slug?: string;
  redirect_path?: string;
};

export type LandingPublicaResponse = {
  ok?: boolean;
  error?: string;
  barberia?: {
    id?: number;
    nombre?: string;
    slug?: string;
    publicada?: boolean;
  };
  servicios?: Array<{
    id?: number;
    nombre?: string;
    duracion_min?: number;
    precio?: number;
  }>;
  barberos?: Array<{
    id?: number;
    nombre?: string;
  }>;
};

export async function resolveQrCode(qrCode: string): Promise<ResolveQrResponse> {
  return postRpc<ResolveQrResponse, { p_qr_code: string }>(env.resolveQrRpcEndpoint, {
    p_qr_code: qrCode
  });
}

export async function getLandingPublicaBySlug(slug: string): Promise<LandingPublicaResponse> {
  return postRpc<LandingPublicaResponse, { p_slug: string }>(env.publicLandingRpcEndpoint, {
    p_slug: slug
  });
}
