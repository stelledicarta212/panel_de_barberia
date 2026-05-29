import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const targetUrl = "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/pos/create-sale";
    
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
    
    if (!response.ok) {
      return NextResponse.json(
        { ok: false, message: data.message || "Error en el servidor de facturación." },
        { status: response.status }
      );
    }
    
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    console.error("Error proxying POS sale:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Error interno de red en el proxy." },
      { status: 500 }
    );
  }
}
