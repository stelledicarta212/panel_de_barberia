import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      code: "endpoint_deprecated",
      message: "Usa /api/session/login"
    },
    { status: 410 }
  );
}
