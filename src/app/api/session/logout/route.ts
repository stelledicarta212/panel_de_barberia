import { NextResponse } from "next/server";
import { getCorsHeaders } from "../../editor/auth";

const SESSION_ME_ENDPOINT = process.env.SESSION_ME_ENDPOINT;
const SESSION_LOGOUT_ENDPOINT = SESSION_ME_ENDPOINT
  ? SESSION_ME_ENDPOINT.replace("/session/me", "/session/logout")
  : "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/session/logout";

function readBaSession(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  return match ? match[1] : "";
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request, "POST, OPTIONS");
  const baSession = readBaSession(request.headers.get("cookie") || "");
  const cookieHeader = baSession ? `ba_session=${baSession}` : "";

  if (cookieHeader) {
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

  const clearCookie = "ba_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
  const response = NextResponse.json(
    { ok: true, message: "Sesión cerrada" },
    { status: 200, headers: corsHeaders }
  );
  response.headers.append("Set-Cookie", clearCookie);
  return response;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request, "POST, OPTIONS")
  });
}
