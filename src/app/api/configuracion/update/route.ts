import { NextResponse } from "next/server";

const CONFIG_UPDATE_ENDPOINT =
  process.env.CONFIG_UPDATE_ENDPOINT ??
  process.env.BA_CONFIG_UPDATE_ENDPOINT ??
  process.env.NEXT_PUBLIC_BA_CONFIG_UPDATE_ENDPOINT ??
  "https://barberagency-n8n.gymh5g.easypanel.host/webhook/barberagency/configuracion/update";

function readBaSession(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)ba_session=([^;]+)/);
  return match ? match[1] : "";
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigins = [
    "https://barberagency-barberagency.gymh5g.easypanel.host",
    "http://localhost:3000",
    "http://localhost:8000"
  ];
  
  let allowedOrigin = "";
  if (allowedOrigins.includes(origin) || origin.endsWith(".easypanel.host")) {
    allowedOrigin = origin;
  } else {
    allowedOrigin = "https://barberagency-barberagency.gymh5g.easypanel.host";
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true"
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validatePatchContract(rawBody: string): { ok: true } | { ok: false; status: number; body: Record<string, unknown> } {
  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return {
      ok: false,
      status: 400,
      body: { ok: false, code: "body_invalido", message: "Body JSON invalido" }
    };
  }

  if (!isRecord(payload)) {
    return {
      ok: false,
      status: 400,
      body: { ok: false, code: "contrato_invalido", message: "Payload PATCH invalido" }
    };
  }

  const legacyKeys = [
    "draft",
    "barberia",
    "servicios",
    "barberos",
    "horarios",
    "admin",
    "accesos",
    "password",
    "owner_id",
    "usuarios",
    "miembros",
    "roles",
    "role"
  ];
  const foundLegacyKey = legacyKeys.find((key) => Object.prototype.hasOwnProperty.call(payload, key));
  if (foundLegacyKey) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        code: "contrato_invalido",
        message: "Payload completo/onboarding no permitido en mode=edit",
        field: foundLegacyKey
      }
    };
  }

  if (payload.mode !== "edit" || !isRecord(payload.patch) || !isRecord(payload.collections_patch)) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        code: "contrato_invalido",
        message: "Configuracion requiere mode=edit, patch y collections_patch"
      }
    };
  }

  const collections = payload.collections_patch;

  // 1. Validar servicios
  if (collections.servicios && isRecord(collections.servicios)) {
    const upsert = collections.servicios.upsert;
    if (Array.isArray(upsert)) {
      for (const item of upsert) {
        if (!isRecord(item)) {
          return {
            ok: false,
            status: 400,
            body: { ok: false, code: "contrato_invalido", message: "Item de servicios.upsert invalido" }
          };
        }
        if (Object.prototype.hasOwnProperty.call(item, "precio") && (item.precio === null || Number(item.precio) < 0 || isNaN(Number(item.precio)))) {
          return {
            ok: false,
            status: 400,
            body: { ok: false, code: "contrato_invalido", message: "Ningun servicio puede tener precio negativo o invalido" }
          };
        }
        if (Object.prototype.hasOwnProperty.call(item, "duracion_min") && (item.duracion_min === null || Number(item.duracion_min) <= 0 || isNaN(Number(item.duracion_min)))) {
          return {
            ok: false,
            status: 400,
            body: { ok: false, code: "contrato_invalido", message: "Ningun servicio puede tener duracion menor o igual a cero" }
          };
        }
        if (Object.prototype.hasOwnProperty.call(item, "nombre") && String(item.nombre).trim() === "") {
          return {
            ok: false,
            status: 400,
            body: { ok: false, code: "contrato_invalido", message: "El nombre del servicio no puede estar vacio" }
          };
        }
        if (!item.id && !item.nombre) {
          return {
            ok: false,
            status: 400,
            body: { ok: false, code: "contrato_invalido", message: "Servicios nuevos requieren nombre" }
          };
        }
      }
    }
  }

  // 2. Validar barberos
  if (collections.barberos && isRecord(collections.barberos)) {
    const upsert = collections.barberos.upsert;
    if (Array.isArray(upsert)) {
      for (const item of upsert) {
        if (!isRecord(item)) {
          return {
            ok: false,
            status: 400,
            body: { ok: false, code: "contrato_invalido", message: "Item de barberos.upsert invalido" }
          };
        }
        if (Object.prototype.hasOwnProperty.call(item, "nombre") && String(item.nombre).trim() === "") {
          return {
            ok: false,
            status: 400,
            body: { ok: false, code: "contrato_invalido", message: "El nombre del barbero no puede estar vacio" }
          };
        }
        if (!item.id && !item.nombre) {
          return {
            ok: false,
            status: 400,
            body: { ok: false, code: "contrato_invalido", message: "Barberos nuevos requieren nombre" }
          };
        }
      }
    }
  }

  // 3. Validar horarios (normalización / verificación de 7 días completos)
  if (collections.horarios && isRecord(collections.horarios)) {
    const upsert = collections.horarios.upsert;
    if (Array.isArray(upsert) && upsert.length > 0) {
      if (upsert.length !== 7) {
        return {
          ok: false,
          status: 400,
          body: { ok: false, code: "contrato_invalido", message: "Los horarios deben contener exactamente 7 dias" }
        };
      }
      const daysFound = new Set<number>();
      for (const item of upsert) {
        if (!isRecord(item)) {
          return {
            ok: false,
            status: 400,
            body: { ok: false, code: "contrato_invalido", message: "Item de horarios.upsert invalido" }
          };
        }
        const dia = Number(item.dia_semana);
        if (isNaN(dia) || dia < 0 || dia > 6) {
          return {
            ok: false,
            status: 400,
            body: { ok: false, code: "contrato_invalido", message: "Dia de semana invalido" }
          };
        }
        daysFound.add(dia);

        const abre = String(item.hora_abre || "").trim();
        const cierra = String(item.hora_cierra || "").trim();
        if (item.activo !== false && abre && cierra && cierra <= abre) {
          return {
            ok: false,
            status: 400,
            body: { ok: false, code: "contrato_invalido", message: "La hora de cierre debe ser mayor a la hora de apertura" }
          };
        }
      }
      if (daysFound.size !== 7) {
        return {
          ok: false,
          status: 400,
          body: { ok: false, code: "contrato_invalido", message: "Los horarios deben incluir los 7 dias de la semana sin duplicados" }
        };
      }
    }
  }

  return { ok: true };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  const baSession = readBaSession(request.headers.get("cookie") || "");
  if (!baSession) {
    return NextResponse.json(
      {
        ok: false,
        code: "no_autorizado_anonimo",
        message: "Sesion requerida para actualizar configuracion"
      },
      { status: 401, headers: corsHeaders }
    );
  }

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "body_invalido",
        message: "No se pudo leer el body de configuracion"
      },
      { status: 400, headers: corsHeaders }
    );
  }

  const contract = validatePatchContract(rawBody);
  if (!contract.ok) {
    return NextResponse.json(contract.body, { status: contract.status, headers: corsHeaders });
  }

  try {
    const upstream = await fetch(CONFIG_UPDATE_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "text/plain;charset=UTF-8",
        Cookie: `ba_session=${baSession}`
      },
      body: rawBody,
      cache: "no-store"
    });

    const text = await upstream.text().catch(() => "");
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        {
          ok: false,
          code: "respuesta_no_json",
          message: "configuracion/update devolvio respuesta no JSON"
        },
        { status: 502, headers: corsHeaders }
      );
    }

    return NextResponse.json(body, { status: upstream.status, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "configuracion_update_proxy_error",
        message: error instanceof Error ? error.message : "Error conectando con configuracion/update"
      },
      { status: 502, headers: corsHeaders }
    );
  }
}
