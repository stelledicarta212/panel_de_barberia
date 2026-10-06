import { NextResponse } from "next/server";
import { resolveQrCode } from "@/lib/public-rpc";

export function isSafeOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.host.toLowerCase();
    if (
      host.includes("localhost") ||
      host.includes("127.0.0.1") ||
      host.includes("0.0.0.0") ||
      host.includes(":3000") ||
      host.endsWith(".internal") ||
      host.endsWith(".local")
    ) {
      return false;
    }
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function getCanonicalOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "https://barberagency-barberagency.gymh5g.easypanel.host";

  let trimmed = configured.trim().replace(/\/+$/, "");
  if (trimmed && isSafeOrigin(trimmed)) {
    if (trimmed.startsWith("http://")) {
      trimmed = trimmed.replace(/^http:\/\//, "https://");
    }
    return trimmed;
  }
  return "https://barberagency-barberagency.gymh5g.easypanel.host";
}

export function isTrustedHost(host: string): boolean {
  const h = host.toLowerCase().trim();
  if (
    h.includes("localhost") ||
    h.includes("127.0.0.1") ||
    h.includes("0.0.0.0") ||
    h.includes(":3000") ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  ) {
    return false;
  }

  if (
    h === "barberagency-barberagency.gymh5g.easypanel.host" ||
    h === "barberagency-app.gymh5g.easypanel.host" ||
    h === "barberagency.com" ||
    h === "www.barberagency.com"
  ) {
    return true;
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (h === url.host.toLowerCase() && isSafeOrigin(configured)) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

export function resolveSafeRedirectOrigin(request: Request): string {
  // Always enforce HTTPS for public canonical BarberAgency redirects.
  // Internal ingress or reverse proxies may forward 'http' internally, but the client-facing scheme must be https.
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost && isTrustedHost(forwardedHost)) {
    return `https://${forwardedHost}`.replace(/\/+$/, "");
  }

  const host = request.headers.get("host");
  if (host && isTrustedHost(host)) {
    return `https://${host}`.replace(/\/+$/, "");
  }

  return getCanonicalOrigin();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ qr_code: string }> }
) {
  const { qr_code } = await context.params;
  const qrCode = String(qr_code || "").trim();
  if (!qrCode) {
    return new NextResponse("QR no encontrado", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  try {
    const resolved = await resolveQrCode(qrCode);
    if (resolved.ok !== true || !resolved.redirect_path) {
      return new NextResponse("QR no encontrado", {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    const safeOrigin = resolveSafeRedirectOrigin(request);
    const target = new URL(resolved.redirect_path, safeOrigin);
    return NextResponse.redirect(target, { status: 302 });
  } catch {
    return new NextResponse("QR no encontrado", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
}
