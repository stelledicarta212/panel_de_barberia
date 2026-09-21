import { NextResponse } from "next/server";
import { getCorsHeaders } from "../../editor/auth";
import { secureAuthHeaders } from "@/lib/rate-limit";

const SESSION_ME_ENDPOINT = process.env.SESSION_ME_ENDPOINT;
const SESSION_LOGOUT_ENDPOINT = process.env.SESSION_LOGOUT_ENDPOINT ?? (
  SESSION_ME_ENDPOINT ? SESSION_ME_ENDPOINT.replace("/session/me", "/session/logout") : ""
);

const POSTGREST_URL =
  process.env.POSTGREST_BASE_URL ??
  process.env.POSTGREST_URL ??
  "https://api.agencia2c.cloud";

function readBaSession(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  return match ? match[1] : "";
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request, "POST, OPTIONS");
  const baSession = readBaSession(request.headers.get("cookie") || "");
  const cookieHeader = baSession ? `ba_session=${baSession}` : "";

  if (baSession) {
    // 1. Synchronously increment session_version in database via PostgREST RPC
    try {
      const parts = baSession.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        const userId = Number(payload.user_id || payload.sub || 0);
        if (Number.isSafeInteger(userId) && userId > 0) {
          await fetch(`${POSTGREST_URL.replace(/\/+$/, "")}/rpc/ba_revoke_user_session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_user_id: userId }),
            cache: "no-store"
          }).catch((err) => {
            console.error("[logout] Error calling ba_revoke_user_session:", err);
          });
        }
      }
    } catch (err) {
      console.error("[logout] Error parsing JWT for revocation:", err);
    }

    // 2. Call upstream n8n logout workflow if configured
    if (SESSION_LOGOUT_ENDPOINT) {
      try {
        await fetch(SESSION_LOGOUT_ENDPOINT, {
          method: "POST",
          headers: { Cookie: cookieHeader },
          cache: "no-store"
        });
      } catch (err) {
        console.error("Error calling upstream logout:", err);
      }
    }
  }

  const clearCookie = "ba_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
  const responseHeaders = secureAuthHeaders({
    ...corsHeaders
  });

  const response = NextResponse.json(
    { ok: true, message: "Sesión cerrada" },
    { status: 200, headers: responseHeaders }
  );
  response.headers.append("Set-Cookie", clearCookie);
  return response;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: secureAuthHeaders(getCorsHeaders(request, "POST, OPTIONS"))
  });
}
