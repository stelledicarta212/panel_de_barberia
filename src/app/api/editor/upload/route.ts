import { NextResponse } from "next/server";
import { getCorsHeaders, readBaSession, validateEditorTenant } from "../auth";
import { consumeRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon"
]);

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".svg",
  ".ico"
]);

function getUploadEndpoint(): string | null {
  const endpoint = process.env.EDITOR_UPLOAD_ENDPOINT;
  return endpoint && endpoint.trim().length > 0 ? endpoint.trim() : null;
}

export function sanitizeFileName(name: string): string {
  const baseName = name.replace(/^.*[\\/]/, "");
  const cleaned = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const finalName = cleaned.replace(/^\.+/, "") || "upload_asset";
  return finalName;
}

export function validateImageMagicBytes(buffer: ArrayBuffer, mimeType: string): boolean {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4) return false;

  const mime = mimeType.toLowerCase();

  if (mime === "image/jpeg" || mime === "image/jpg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mime === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }

  if (mime === "image/gif") {
    return (
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46
    );
  }

  if (mime === "image/webp") {
    if (bytes.length < 12) return false;
    const isRiff =
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46;
    const isWebp =
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50;
    return isRiff && isWebp;
  }

  if (mime === "image/x-icon" || mime === "image/vnd.microsoft.icon") {
    return (
      bytes[0] === 0x00 &&
      bytes[1] === 0x00 &&
      bytes[2] === 0x01 &&
      bytes[3] === 0x00
    );
  }

  if (mime === "image/svg+xml") {
    const textDecoder = new TextDecoder("utf-8", { fatal: false });
    const text = textDecoder.decode(bytes.slice(0, 1024)).toLowerCase();
    const hasSvgTag = text.includes("<svg");
    const hasDangerousScript =
      text.includes("<script") ||
      text.includes("javascript:") ||
      /on\w+\s*=/i.test(text);
    return hasSvgTag && !hasDangerousScript;
  }

  return false;
}

export function isValidCanonicalStorageUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith("https://")) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("blob:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.includes("localhost") ||
    lower.includes("127.0.0.1")
  ) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  const uploadEndpoint = getUploadEndpoint();

  if (!uploadEndpoint) {
    return NextResponse.json(
      {
        ok: false,
        code: "editor_upload_endpoint_not_configured",
        message: "El servidor no esta configurado correctamente para uploads."
      },
      { status: 500, headers: corsHeaders }
    );
  }

  const baSession = readBaSession(request.headers.get("cookie") || "");
  if (!baSession) {
    return NextResponse.json(
      {
        ok: false,
        code: "no_autorizado_anonimo",
        message: "Sesion requerida para subir archivos"
      },
      { status: 401, headers: corsHeaders }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "form_data_invalido",
        message: "No se pudo procesar el formulario de subida."
      },
      { status: 400, headers: corsHeaders }
    );
  }

  const rawBarberiaId =
    formData.get("barberia_id") ??
    formData.get("id_barberia") ??
    formData.get("p_barberia_id");
  const parsedId = Number(rawBarberiaId);
  const barberiaId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : undefined;

  const slug = (
    formData.get("slug") ??
    formData.get("biz_slug") ??
    ""
  ).toString().trim();

  if (!barberiaId && !slug) {
    return NextResponse.json(
      {
        ok: false,
        code: "barberia_id_requerido",
        message: "barberia_id requerido"
      },
      { status: 400, headers: corsHeaders }
    );
  }

  let tenant;
  try {
    tenant = await validateEditorTenant(request, {
      barberia_id: barberiaId,
      slug: slug || undefined
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "session_validation_error",
        message: error instanceof Error ? error.message : "Error validando sesion"
      },
      { status: 502, headers: corsHeaders }
    );
  }

  if (!tenant.ok) {
    return NextResponse.json(tenant.body, { status: tenant.status, headers: corsHeaders });
  }

  const clientIp = getClientIp(request);
  const rateLimitKey = `editor_upload:${tenant.barberiaId}:${clientIp}`;
  const limitCheck = await consumeRateLimit(rateLimitKey, 30, 60, true);
  if (!limitCheck.allowed) {
    return rateLimitResponse(limitCheck.retryAfter);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      {
        ok: false,
        code: "archivo_requerido",
        message: "No se proporciono ningun archivo valido para subir."
      },
      { status: 400, headers: corsHeaders }
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        code: "archivo_demasiado_grande",
        message: "El archivo supera el tamano maximo permitido (10MB)."
      },
      { status: 413, headers: corsHeaders }
    );
  }

  const rawName = (file as File).name || "archivo.png";
  if (rawName.includes("..") || rawName.includes("/") || rawName.includes("\\")) {
    return NextResponse.json(
      {
        ok: false,
        code: "nombre_archivo_invalido",
        message: "Nombre de archivo invalido o contiene caracteres peligrosos."
      },
      { status: 400, headers: corsHeaders }
    );
  }

  const extMatch = rawName.match(/\.([a-zA-Z0-9]+)$/);
  const extension = extMatch ? `.${extMatch[1].toLowerCase()}` : "";
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      {
        ok: false,
        code: "extension_no_permitida",
        message: "Extension de archivo no permitida. Solo se aceptan imagenes."
      },
      { status: 400, headers: corsHeaders }
    );
  }

  const mimeType = (file.type || "").toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      {
        ok: false,
        code: "tipo_archivo_no_permitido",
        message: "Tipo de archivo no permitido. Solo se aceptan imagenes (JPEG, PNG, WebP, GIF, SVG, ICO)."
      },
      { status: 415, headers: corsHeaders }
    );
  }

  const headerSlice = await file.slice(0, 512).arrayBuffer();
  if (!validateImageMagicBytes(headerSlice, mimeType)) {
    return NextResponse.json(
      {
        ok: false,
        code: "contenido_archivo_invalido",
        message: "El contenido del archivo no coincide con un formato de imagen valido."
      },
      { status: 415, headers: corsHeaders }
    );
  }

  const safeFileName = sanitizeFileName(rawName);

  const upstreamFormData = new FormData();
  upstreamFormData.append("file", file, safeFileName);
  upstreamFormData.append("barberia_id", String(tenant.barberiaId));
  if (tenant.slug) {
    upstreamFormData.append("biz_slug", tenant.slug);
  }
  const slot = formData.get("slot");
  if (slot) {
    upstreamFormData.append("slot", String(slot).trim());
  }
  const template = formData.get("template");
  if (template) {
    upstreamFormData.append("template", String(template).trim());
  }
  const barberId = formData.get("barber_id");
  if (barberId) {
    upstreamFormData.append("barber_id", String(barberId).trim());
  }
  const serviceId = formData.get("service_id");
  if (serviceId) {
    upstreamFormData.append("service_id", String(serviceId).trim());
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.EDITOR_UPLOAD_TIMEOUT_MS) || 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstreamRes = await fetch(uploadEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Cookie: `ba_session=${tenant.baSession}`
      },
      body: upstreamFormData,
      cache: "no-store",
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const text = await upstreamRes.text().catch(() => "");
    let body: Record<string, unknown> = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      // non-JSON
    }

    if (!upstreamRes.ok) {
      const status = upstreamRes.status >= 400 && upstreamRes.status < 600 ? upstreamRes.status : 502;
      return NextResponse.json(
        {
          ok: false,
          code: (typeof body.code === "string" && body.code) || `upstream_upload_error_${upstreamRes.status}`,
          message:
            (typeof body.message === "string" && body.message) ||
            "Error al procesar el archivo en el servidor de almacenamiento."
        },
        { status, headers: corsHeaders }
      );
    }

    const publicUrl = String(
      body.url ??
      body.source_url ??
      body.sourceUrl ??
      body.public_url ??
      body.publicUrl ??
      body.file_url ??
      body.fileUrl ??
      body.location ??
      ""
    ).trim();

    if (!isValidCanonicalStorageUrl(publicUrl)) {
      return NextResponse.json(
        {
          ok: false,
          code: "invalid_storage_url",
          message: "El proveedor de almacenamiento no retorno una URL publica valida."
        },
        { status: 502, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        url: publicUrl
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        {
          ok: false,
          code: "upload_upstream_timeout",
          message: "El servidor de almacenamiento tardo demasiado en responder."
        },
        { status: 504, headers: corsHeaders }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        code: "upload_proxy_error",
        message: error instanceof Error ? error.message : "Error de conexion con el servidor de almacenamiento"
      },
      { status: 502, headers: corsHeaders }
    );
  }
}
