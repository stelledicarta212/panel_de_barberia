import { NextRequest, NextResponse } from "next/server";
import { resolveQrCode } from "@/lib/public-rpc";

export async function GET(
  request: NextRequest,
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
    const target = new URL(resolved.redirect_path, request.nextUrl.origin);
    return NextResponse.redirect(target, { status: 302 });
  } catch {
    return new NextResponse("QR no encontrado", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
}
