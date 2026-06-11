# Bug Editor Publicar BarberiaId - Implementacion

Fecha: 2026-06-11
Estado: `BUG PUBLICAR EDITOR - IMPLEMENTACION ENTREGADA`

## Causa raiz

El editor envia la publicacion envuelta como:

```json
{
  "p_payload": {
    "barberia_id": 198,
    "slug": "barberia-prueba-4"
  }
}
```

El backend del panel validaba tenant en `validateEditorTenant()` usando `resolvePayloadBarberiaId()` y `resolvePayloadSlug()`, pero esos helpers solo leian campos de identidad en la raiz del body. Al no encontrar `barberia_id` en la raiz, el endpoint respondia:

```txt
400 barberia_id requerido
```

## Archivo modificado

- `src/app/api/editor/auth.ts`
- `tests/editor-auth.test.ts`

## Funciones modificadas

- `resolvePayloadBarberiaId`
- `resolvePayloadSlug`

Ambas funciones ahora leen identidad desde:

1. Campos de raiz.
2. Campos anidados en `p_payload`.

## Payload antes vs despues

### Antes

```json
{
  "p_payload": {
    "barberia_id": 198,
    "slug": "barberia-prueba-4"
  }
}
```

Resultado: `barberia_id requerido`.

### Despues

```json
{
  "p_payload": {
    "barberia_id": 198,
    "slug": "barberia-prueba-4"
  }
}
```

Resultado esperado: el backend resuelve `barberia_id=198` y `slug=barberia-prueba-4`, luego valida contra `session/me`.

## Seguridad

El cambio no relaja permisos.

- No confia en `admin_email`.
- No usa query params como autoridad.
- No usa localStorage/sessionStorage como autoridad.
- No omite validacion de tenant.
- No permite publicar sin `ba_session`.
- No permite publicar si `barberia_id` no aparece en las barberias autorizadas por `session/me`.
- No permite publicar si el `slug` no coincide con la barberia autorizada.

El cambio solo corrige de donde se lee la identidad dentro del body.

## Pruebas

Se agrego `tests/editor-auth.test.ts` para cubrir:

- identidad en raiz del payload.
- identidad dentro de `p_payload`.
- prioridad de raiz si raiz y `p_payload` existen.
- error nulo si falta `barberia_id`.

## Alcance respetado

- No se toco DB.
- No se toco n8n.
- No se toco EasyPanel.
- No se toco WordPress.
- No se toco Bloque 10.
- No se toco POS.
- No se tocaron reservas.
- No se toco sesion.
- No se toco frontend del editor.
- No se toco `/api/configuracion/update`.

## Redeploy

Requiere redeploy en EasyPanel del panel para que el backend Next.js use el nuevo resolver.

## Decision

`BUG PUBLICAR EDITOR - IMPLEMENTACION ENTREGADA`

