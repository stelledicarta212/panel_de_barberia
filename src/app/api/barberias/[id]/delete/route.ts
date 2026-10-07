import { NextResponse } from "next/server";
import { getCorsHeaders } from "@/app/api/editor/auth";
import { secureAuthHeaders } from "@/lib/rate-limit";
import { deleteBarberiaService } from "@/lib/barberia-delete.service";

async function handleDelete(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const barberiaId = Number(id);

    const result = await deleteBarberiaService(request, barberiaId);
    return NextResponse.json(result, {
      status: result.status,
      headers: secureAuthHeaders(getCorsHeaders(request, "POST, DELETE, OPTIONS"))
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "delete_failed",
        message: error instanceof Error ? error.message : "Error interno al procesar la solicitud."
      },
      {
        status: 500,
        headers: secureAuthHeaders(getCorsHeaders(request, "POST, DELETE, OPTIONS"))
      }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return handleDelete(request, context);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return handleDelete(request, context);
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: secureAuthHeaders(getCorsHeaders(request, "POST, DELETE, OPTIONS"))
  });
}
